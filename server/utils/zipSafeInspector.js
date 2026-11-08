const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const SecurityService = require('../services/securityService');

// Phase 1 / Phase 2A Authoritative Archive Security Limits
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;         // 50 MB
const MAX_COMPRESSED_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_COMPRESSION_RATIO = 100;                      // 100:1

// ZIP binary signatures
const SIG_LOCAL_FILE_HEADER = 0x04034b50;
const SIG_CENTRAL_DIR_HEADER = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_EOCD_LOCATOR = 0x07064b50;

// Allowed top-level files and directories in an FKF v1.0.0 package
const ALLOWED_ROOT_FILES = new Set(['manifest.json', 'folders.json']);
const ALLOWED_ROOT_DIRS = new Set([
  'project',
  'notes',
  'sources',
  'relationships',
  'assets',
  'optional',
  'exports'
]);

// Dangerous extensions explicitly forbidden anywhere inside a .flowden.zip archive
const FORBIDDEN_ARCHIVE_EXTENSIONS = new Set([
  ...(SecurityService.BLOCKED_EXTENSIONS ? Array.from(SecurityService.BLOCKED_EXTENSIONS) : []),
  '.exe', '.dll', '.so', '.dylib', '.bin', '.com', '.scr', '.pif', '.msi', '.msp',
  '.bat', '.cmd', '.ps1', '.sh', '.bash', '.zsh', '.csh', '.ksh', '.vbs', '.vbe',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.php', '.phtml', '.py', '.pyc',
  '.rb', '.pl', '.jar', '.war', '.class', '.hta', '.wsf', '.wsh', '.reg', '.inf',
  '.html', '.htm', '.xhtml', '.svg', '.swf'
]);

// Precomputed CRC-32 lookup table for streaming verification
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function updateCrc32(crc, buf) {
  let c = crc >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c >>> 0;
}

/**
 * Validate a raw entry path from the ZIP Central Directory before extraction.
 */
function validateArchiveEntryPath(rawName, isDirectory) {
  if (typeof rawName !== 'string' || rawName.length === 0 || rawName.length > 255) {
    return { valid: false, code: 'ARCHIVE_INVALID_PATH', message: `Archive entry path length is invalid (${rawName ? rawName.length : 0}).` };
  }

  if (rawName.includes('\0')) {
    return { valid: false, code: 'ARCHIVE_NULL_BYTE_PATH', message: 'Archive entry path contains a null byte.' };
  }

  // Reject Windows backslashes — FKF v1.0.0 requires POSIX forward-slash relative paths
  if (rawName.includes('\\')) {
    return {
      valid: false,
      code: 'ARCHIVE_INVALID_PATH_SEPARATOR',
      message: `Archive entry "${rawName}" contains invalid backslash path separator.`
    };
  }

  // Reject absolute paths (leading '/' or Windows drive letter 'C:')
  if (rawName.startsWith('/') || /^[a-zA-Z]:/.test(rawName) || rawName.includes(':')) {
    return {
      valid: false,
      code: 'ARCHIVE_ABSOLUTE_PATH',
      message: `Archive entry "${rawName}" uses an absolute or drive-prefixed path.`
    };
  }

  const trimmed = isDirectory ? rawName.replace(/\/+$/, '') : rawName;
  const segments = trimmed.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') {
      return {
        valid: false,
        code: 'ARCHIVE_PATH_TRAVERSAL',
        message: `Archive entry "${rawName}" contains path traversal or empty segment ("${seg}").`
      };
    }
  }

  // Verify top-level placement conforms to FKF layout
  const topSegment = segments[0];
  if (segments.length === 1) {
    if (isDirectory) {
      if (!ALLOWED_ROOT_DIRS.has(topSegment)) {
        return {
          valid: false,
          code: 'ARCHIVE_UNEXPECTED_ENTRY_PATH',
          message: `Unexpected root directory "${topSegment}/" in package archive.`
        };
      }
    } else if (!ALLOWED_ROOT_FILES.has(topSegment)) {
      return {
        valid: false,
        code: 'ARCHIVE_UNEXPECTED_ENTRY_PATH',
        message: `Unexpected root file "${topSegment}" in package archive.`
      };
    }
  } else {
    if (!ALLOWED_ROOT_DIRS.has(topSegment)) {
      return {
        valid: false,
        code: 'ARCHIVE_UNEXPECTED_ENTRY_PATH',
        message: `Archive entry "${rawName}" resides outside allowed FKF package directories.`
      };
    }
  }

  if (!isDirectory) {
    const baseName = path.posix.basename(trimmed);
    const ext = path.posix.extname(baseName).toLowerCase();
    if (!ext || FORBIDDEN_ARCHIVE_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        code: 'ARCHIVE_DANGEROUS_FILE_TYPE',
        message: `Archive entry "${rawName}" has a blocked or missing file extension ("${ext || 'none'}").`
      };
    }

    // Check double extensions (e.g., payload.exe.png)
    const parts = baseName.toLowerCase().split('.');
    if (parts.length > 2) {
      for (let i = 1; i < parts.length - 1; i++) {
        const innerExt = '.' + parts[i];
        if (FORBIDDEN_ARCHIVE_EXTENSIONS.has(innerExt)) {
          return {
            valid: false,
            code: 'ARCHIVE_DANGEROUS_FILE_TYPE',
            message: `Archive entry "${rawName}" contains a disguised executable double extension ("${innerExt}").`
          };
        }
      }
    }
  }

  return { valid: true, normalizedPath: trimmed };
}

/**
 * Inspect the Central Directory of a ZIP buffer/file BEFORE extracting any entry.
 */
function inspectZipCentralDirectory(zipPath, limits = {}) {
  const maxEntries = limits.maxEntries || MAX_ARCHIVE_ENTRIES;
  const maxTotalUncompressedBytes = limits.maxTotalUncompressedBytes || MAX_TOTAL_UNCOMPRESSED_BYTES;
  const maxSingleFileBytes = limits.maxSingleFileBytes || MAX_SINGLE_FILE_BYTES;
  const maxCompressedBytes = limits.maxCompressedBytes || MAX_COMPRESSED_ARCHIVE_BYTES;
  const maxCompressionRatio = limits.maxCompressionRatio || MAX_COMPRESSION_RATIO;

  const errors = [];
  const warnings = [];

  if (!fs.existsSync(zipPath)) {
    return {
      valid: false,
      errors: [{ code: 'ARCHIVE_FILE_MISSING', message: 'Uploaded archive file does not exist.' }],
      warnings,
      entries: []
    };
  }

  const stat = fs.statSync(zipPath);
  if (stat.size > maxCompressedBytes) {
    return {
      valid: false,
      errors: [{
        code: 'ARCHIVE_COMPRESSED_TOO_LARGE',
        message: `Compressed archive size (${stat.size} bytes) exceeds maximum limit (${maxCompressedBytes} bytes).`
      }],
      warnings,
      entries: []
    };
  }

  if (stat.size < 22) {
    return {
      valid: false,
      errors: [{
        code: 'INVALID_ZIP_MAGIC_BYTES',
        message: `File is too small (${stat.size} bytes) to be a valid ZIP archive.`
      }],
      warnings,
      entries: []
    };
  }

  const fd = fs.openSync(zipPath, 'r');
  try {
    // 1. Check leading 4 magic bytes
    const magicBuf = Buffer.alloc(4);
    fs.readSync(fd, magicBuf, 0, 4, 0);
    const leadingSig = magicBuf.readUInt32LE(0);
    if (leadingSig !== SIG_LOCAL_FILE_HEADER) {
      return {
        valid: false,
        errors: [{
          code: 'INVALID_ZIP_MAGIC_BYTES',
          message: `Invalid ZIP magic bytes (0x${leadingSig.toString(16).padStart(8, '0')}); expected PK\\x03\\x04 (0x04034b50).`
        }],
        warnings,
        entries: []
      };
    }

    // 2. Locate End of Central Directory (EOCD) record in the tail of the file
    const maxTail = Math.min(stat.size, 65557);
    const tailBuf = Buffer.alloc(maxTail);
    const tailOffset = stat.size - maxTail;
    fs.readSync(fd, tailBuf, 0, maxTail, tailOffset);

    let eocdPos = -1;
    for (let i = maxTail - 22; i >= 0; i--) {
      if (tailBuf.readUInt32LE(i) === SIG_EOCD) {
        const commentLen = tailBuf.readUInt16LE(i + 20);
        if (i + 22 + commentLen === maxTail) {
          eocdPos = i;
          break;
        }
      }
    }

    if (eocdPos === -1) {
      return {
        valid: false,
        errors: [{
          code: 'INVALID_ZIP_STRUCTURE',
          message: 'Corrupt or truncated ZIP archive: valid End of Central Directory (EOCD) record not found.'
        }],
        warnings,
        entries: []
      };
    }

    // Check for ZIP64 EOCD Locator immediately preceding EOCD
    if (eocdPos >= 20 && tailBuf.readUInt32LE(eocdPos - 20) === SIG_ZIP64_EOCD_LOCATOR) {
      return {
        valid: false,
        errors: [{
          code: 'UNSUPPORTED_ZIP64_ARCHIVE',
          message: 'ZIP64 archives are not supported; standard FKF packages must be <= 250 MB and <= 500 entries.'
        }],
        warnings,
        entries: []
      };
    }

    const diskNumber = tailBuf.readUInt16LE(eocdPos + 4);
    const cdDiskNumber = tailBuf.readUInt16LE(eocdPos + 6);
    const cdDiskEntries = tailBuf.readUInt16LE(eocdPos + 8);
    const cdTotalEntries = tailBuf.readUInt16LE(eocdPos + 10);
    const cdSize = tailBuf.readUInt32LE(eocdPos + 12);
    const cdOffset = tailBuf.readUInt32LE(eocdPos + 16);

    if (diskNumber !== 0 || cdDiskNumber !== 0 || cdDiskEntries !== cdTotalEntries) {
      return {
        valid: false,
        errors: [{
          code: 'INVALID_ZIP_STRUCTURE',
          message: 'Multi-disk or inconsistent ZIP central directory is not allowed.'
        }],
        warnings,
        entries: []
      };
    }

    if (cdTotalEntries === 0) {
      return {
        valid: false,
        errors: [{
          code: 'ARCHIVE_EMPTY',
          message: 'ZIP archive contains zero entries.'
        }],
        warnings,
        entries: []
      };
    }

    if (cdTotalEntries > maxEntries) {
      return {
        valid: false,
        errors: [{
          code: 'ARCHIVE_TOO_MANY_ENTRIES',
          message: `Archive contains ${cdTotalEntries} entries, exceeding the maximum limit of ${maxEntries}.`
        }],
        warnings,
        entries: []
      };
    }

    const absoluteEocdOffset = tailOffset + eocdPos;
    if (cdOffset + cdSize > absoluteEocdOffset || cdSize === 0) {
      return {
        valid: false,
        errors: [{
          code: 'INVALID_ZIP_STRUCTURE',
          message: 'Central Directory bounds exceed archive size or overlap EOCD.'
        }],
        warnings,
        entries: []
      };
    }

    // 3. Read and parse the entire Central Directory buffer before extracting anything
    const cdBuf = Buffer.alloc(cdSize);
    fs.readSync(fd, cdBuf, 0, cdSize, cdOffset);

    const entries = [];
    const seenNormalizedPaths = new Set();
    const seenLowerPaths = new Set();

    let ptr = 0;
    let totalDeclaredUncompressed = 0;
    let totalDeclaredCompressed = 0;

    while (ptr < cdSize) {
      if (ptr + 46 > cdSize) {
        errors.push({
          code: 'INVALID_ZIP_STRUCTURE',
          message: 'Truncated Central Directory File Header.'
        });
        break;
      }

      const sig = cdBuf.readUInt32LE(ptr);
      if (sig !== SIG_CENTRAL_DIR_HEADER) {
        errors.push({
          code: 'INVALID_ZIP_STRUCTURE',
          message: `Invalid Central Directory File Header signature at offset ${ptr} (0x${sig.toString(16)}).`
        });
        break;
      }

      const versionMadeBy = cdBuf.readUInt16LE(ptr + 4);
      const versionNeeded = cdBuf.readUInt16LE(ptr + 6);
      const flags = cdBuf.readUInt16LE(ptr + 8);
      const compressionMethod = cdBuf.readUInt16LE(ptr + 10);
      const crc32 = cdBuf.readUInt32LE(ptr + 16);
      const compressedSize = cdBuf.readUInt32LE(ptr + 20);
      const uncompressedSize = cdBuf.readUInt32LE(ptr + 24);
      const fileNameLen = cdBuf.readUInt16LE(ptr + 28);
      const extraFieldLen = cdBuf.readUInt16LE(ptr + 30);
      const fileCommentLen = cdBuf.readUInt16LE(ptr + 32);
      const externalAttrs = cdBuf.readUInt32LE(ptr + 38);
      const localHeaderOffset = cdBuf.readUInt32LE(ptr + 42);

      const headerTotalLen = 46 + fileNameLen + extraFieldLen + fileCommentLen;
      if (ptr + headerTotalLen > cdSize) {
        errors.push({
          code: 'INVALID_ZIP_STRUCTURE',
          message: 'Central Directory entry extends past Central Directory end.'
        });
        break;
      }

      const rawName = cdBuf.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');
      ptr += headerTotalLen;

      // Check entry count limit dynamically in case cdTotalEntries was spoofed lower than actual entries
      if (entries.length + 1 > maxEntries) {
        errors.push({
          code: 'ARCHIVE_TOO_MANY_ENTRIES',
          message: `Archive entry count exceeds maximum allowed limit (${maxEntries}).`
        });
        break;
      }

      // Check encryption flag (Bit 0) or data descriptor streaming flag with unknown sizes
      if ((flags & 0x0001) !== 0) {
        errors.push({
          code: 'ARCHIVE_ENCRYPTED_ENTRY_REJECTED',
          entry: rawName,
          message: `Archive entry "${rawName}" is encrypted; encrypted entries are not permitted.`
        });
      }

      // Check ZIP64 sentinel sizes
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        errors.push({
          code: 'UNSUPPORTED_ZIP64_ARCHIVE',
          entry: rawName,
          message: `Archive entry "${rawName}" uses ZIP64 64-bit size fields exceeding standard limits.`
        });
      }

      // Check Symlink / Special File attributes in externalAttrs
      const unixFileType = (externalAttrs >>> 16) & 0o170000;
      const isPosixSymlink = unixFileType === 0o120000;
      const isPosixSpecial = unixFileType === 0o010000 || unixFileType === 0o020000 || unixFileType === 0o060000 || unixFileType === 0o140000;
      const isDosReparsePoint = (externalAttrs & 0x0400) !== 0;

      if (isPosixSymlink || isPosixSpecial || isDosReparsePoint) {
        errors.push({
          code: 'ARCHIVE_SYMLINK_REJECTED',
          entry: rawName,
          message: `Archive entry "${rawName}" is a symbolic link or special device file (externalAttrs=0x${externalAttrs.toString(16)}), which is forbidden.`
        });
      }

      const isDirectory = rawName.endsWith('/') || unixFileType === 0o040000 || ((externalAttrs & 0x10) !== 0 && uncompressedSize === 0 && rawName.endsWith('/'));

      // Validate compression method
      if (compressionMethod !== 0 && compressionMethod !== 8) {
        errors.push({
          code: 'ARCHIVE_UNSUPPORTED_COMPRESSION_METHOD',
          entry: rawName,
          message: `Archive entry "${rawName}" uses unsupported compression method (${compressionMethod}); only Stored (0) and Deflate (8) are supported.`
        });
      }

      // Validate path safety (ZIP Slip, absolute paths, backslashes, dangerous extensions)
      const pathCheck = validateArchiveEntryPath(rawName, isDirectory);
      if (!pathCheck.valid) {
        errors.push({
          code: pathCheck.code,
          entry: rawName,
          message: pathCheck.message
        });
      } else {
        const normPath = pathCheck.normalizedPath;
        const lowerPath = normPath.toLowerCase();
        if (seenNormalizedPaths.has(normPath) || seenLowerPaths.has(lowerPath)) {
          errors.push({
            code: 'ARCHIVE_DUPLICATE_PATH',
            entry: rawName,
            message: `Duplicate archive entry path detected: "${normPath}".`
          });
        } else {
          seenNormalizedPaths.add(normPath);
          seenLowerPaths.add(lowerPath);
        }
      }

      // Per-entry size and compression ratio validation
      if (uncompressedSize > maxSingleFileBytes) {
        errors.push({
          code: 'ARCHIVE_ENTRY_TOO_LARGE',
          entry: rawName,
          message: `Archive entry "${rawName}" uncompressed size (${uncompressedSize} bytes) exceeds per-file limit (${maxSingleFileBytes} bytes).`
        });
      }

      totalDeclaredUncompressed += uncompressedSize;
      totalDeclaredCompressed += compressedSize;

      if (totalDeclaredUncompressed > maxTotalUncompressedBytes) {
        errors.push({
          code: 'ARCHIVE_TOTAL_UNCOMPRESSED_TOO_LARGE',
          entry: rawName,
          message: `Total declared uncompressed size (${totalDeclaredUncompressed} bytes) exceeds archive limit (${maxTotalUncompressedBytes} bytes).`
        });
      }

      if (!isDirectory && uncompressedSize > 0) {
        const entryRatio = uncompressedSize / Math.max(1, compressedSize);
        if (entryRatio > maxCompressionRatio) {
          errors.push({
            code: 'ARCHIVE_COMPRESSION_RATIO_EXCEEDED',
            entry: rawName,
            message: `Archive entry "${rawName}" compression ratio (${entryRatio.toFixed(1)}:1) exceeds maximum allowed ratio (${maxCompressionRatio}:1).`
          });
        }
      }

      if (localHeaderOffset >= cdOffset) {
        errors.push({
          code: 'INVALID_ZIP_STRUCTURE',
          entry: rawName,
          message: `Archive entry "${rawName}" local header offset (${localHeaderOffset}) points into or beyond the Central Directory.`
        });
      }

      entries.push({
        rawName,
        normalizedPath: pathCheck.valid ? pathCheck.normalizedPath : rawName,
        isDirectory,
        versionMadeBy,
        versionNeeded,
        flags,
        compressionMethod,
        crc32,
        compressedSize,
        uncompressedSize,
        externalAttrs,
        localHeaderOffset
      });
    }

    if (entries.length !== cdTotalEntries && errors.length === 0) {
      errors.push({
        code: 'INVALID_ZIP_STRUCTURE',
        message: `Central Directory entry count mismatch: EOCD declared ${cdTotalEntries}, parsed ${entries.length}.`
      });
    }

    if (totalDeclaredUncompressed > 0 && errors.length === 0) {
      const aggregateRatio = totalDeclaredUncompressed / Math.max(1, totalDeclaredCompressed);
      if (aggregateRatio > maxCompressionRatio) {
        errors.push({
          code: 'ARCHIVE_COMPRESSION_RATIO_EXCEEDED',
          message: `Overall archive compression ratio (${aggregateRatio.toFixed(1)}:1) exceeds maximum allowed ratio (${maxCompressionRatio}:1).`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        compressedArchiveBytes: stat.size,
        entryCount: entries.length,
        totalDeclaredUncompressedBytes: totalDeclaredUncompressed,
        totalDeclaredCompressedBytes: totalDeclaredCompressed
      },
      entries
    };
  } finally {
    try { fs.closeSync(fd); } catch (_) {}
  }
}

/**
 * Safely extract a Central-Directory-validated ZIP archive into an isolated staging directory
 * using streaming decompression with live decompressed-byte, compression-ratio, and CRC-32 guards.
 */
async function extractValidatedZipToStaging(zipPath, stagingDir, maybeCdResult, limits = {}) {
  let cdResult = maybeCdResult;
  if (!cdResult || !cdResult.entries) {
    cdResult = inspectZipCentralDirectory(zipPath, limits);
    if (!cdResult.valid) {
      return cdResult;
    }
  }

  const maxTotalUncompressedBytes = limits.maxTotalUncompressedBytes || MAX_TOTAL_UNCOMPRESSED_BYTES;
  const maxSingleFileBytes = limits.maxSingleFileBytes || MAX_SINGLE_FILE_BYTES;
  const maxCompressionRatio = limits.maxCompressionRatio || MAX_COMPRESSION_RATIO;

  const resolvedStagingRoot = path.resolve(stagingDir);
  fs.mkdirSync(resolvedStagingRoot, { recursive: true });

  const extractedFiles = new Map();
  let totalActualDecompressedBytes = 0;

  const fd = fs.openSync(zipPath, 'r');
  try {
    for (const entry of cdResult.entries) {
      const targetPath = path.resolve(resolvedStagingRoot, entry.normalizedPath);
      if (!targetPath.startsWith(resolvedStagingRoot + path.sep)) {
        return {
          valid: false,
          errors: [{
            code: 'ARCHIVE_PATH_TRAVERSAL',
            entry: entry.rawName,
            message: `Resolved extraction path escaped staging root for "${entry.rawName}".`
          }]
        };
      }

      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
        continue;
      }

      // Read Local File Header (30 bytes)
      const lfhBuf = Buffer.alloc(30);
      const bytesRead = fs.readSync(fd, lfhBuf, 0, 30, entry.localHeaderOffset);
      if (bytesRead !== 30 || lfhBuf.readUInt32LE(0) !== SIG_LOCAL_FILE_HEADER) {
        return {
          valid: false,
          errors: [{
            code: 'INVALID_ZIP_STRUCTURE',
            entry: entry.rawName,
            message: `Invalid Local File Header signature for entry "${entry.rawName}".`
          }]
        };
      }

      const lfhFlags = lfhBuf.readUInt16LE(6);
      const lfhMethod = lfhBuf.readUInt16LE(8);
      const lfhCompSize = lfhBuf.readUInt32LE(18);
      const lfhUncompSize = lfhBuf.readUInt32LE(22);
      const lfhNameLen = lfhBuf.readUInt16LE(26);
      const lfhExtraLen = lfhBuf.readUInt16LE(28);

      if (lfhMethod !== entry.compressionMethod) {
        return {
          valid: false,
          errors: [{
            code: 'ARCHIVE_HEADER_MISMATCH',
            entry: entry.rawName,
            message: `Compression method mismatch between Local File Header (${lfhMethod}) and Central Directory (${entry.compressionMethod}) for "${entry.rawName}".`
          }]
        };
      }

      // When Bit 3 (data descriptor) is not set, Local File Header sizes must match Central Directory sizes
      if ((lfhFlags & 0x0008) === 0 && (lfhCompSize !== entry.compressedSize)) {
        return {
          valid: false,
          errors: [{
            code: 'ARCHIVE_HEADER_MISMATCH',
            entry: entry.rawName,
            message: `Compressed size mismatch between Local File Header and Central Directory for "${entry.rawName}".`
          }]
        };
      }

      const dataStart = entry.localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      let entryActualBytes = 0;
      let rollingCrc = 0xffffffff;
      const sha256Hash = crypto.createHash('sha256');
      let streamLimitError = null;

      const guardTransform = new Transform({
        transform(chunk, _encoding, callback) {
          entryActualBytes += chunk.length;
          totalActualDecompressedBytes += chunk.length;

          if (entryActualBytes > maxSingleFileBytes) {
            streamLimitError = {
              code: 'ARCHIVE_ENTRY_TOO_LARGE',
              entry: entry.rawName,
              message: `Decompressed stream for "${entry.rawName}" exceeded per-file limit (${maxSingleFileBytes} bytes).`
            };
            return callback(new Error(streamLimitError.message));
          }

          if (totalActualDecompressedBytes > maxTotalUncompressedBytes) {
            streamLimitError = {
              code: 'ARCHIVE_TOTAL_UNCOMPRESSED_TOO_LARGE',
              entry: entry.rawName,
              message: `Total decompressed stream bytes (${totalActualDecompressedBytes}) exceeded archive limit (${maxTotalUncompressedBytes} bytes).`
            };
            return callback(new Error(streamLimitError.message));
          }

          const liveRatio = entryActualBytes / Math.max(1, entry.compressedSize);
          if (liveRatio > maxCompressionRatio) {
            streamLimitError = {
              code: 'ARCHIVE_COMPRESSION_RATIO_EXCEEDED',
              entry: entry.rawName,
              message: `Decompressed stream ratio (${liveRatio.toFixed(1)}:1) for "${entry.rawName}" exceeded maximum ratio (${maxCompressionRatio}:1).`
            };
            return callback(new Error(streamLimitError.message));
          }

          rollingCrc = updateCrc32(rollingCrc, chunk);
          sha256Hash.update(chunk);
          callback(null, chunk);
        }
      });

      if (entry.compressedSize === 0) {
        if (entry.uncompressedSize !== 0) {
          return {
            valid: false,
            errors: [{
              code: 'ARCHIVE_CORRUPT_OR_SPOOFED_SIZE',
              entry: entry.rawName,
              message: `Entry "${entry.rawName}" has 0 compressed bytes but non-zero declared size.`
            }]
          };
        }
        fs.writeFileSync(targetPath, Buffer.alloc(0), { flag: 'wx' });
      } else {
        const readStream = fs.createReadStream(null, {
          fd,
          start: dataStart,
          end: dataStart + entry.compressedSize - 1,
          autoClose: false
        });
        const writeStream = fs.createWriteStream(targetPath, { flags: 'wx' });

        try {
          if (entry.compressionMethod === 8) {
            const inflateStream = zlib.createInflateRaw();
            await pipeline(readStream, inflateStream, guardTransform, writeStream);
          } else {
            await pipeline(readStream, guardTransform, writeStream);
          }
        } catch (err) {
          if (streamLimitError) {
            return { valid: false, errors: [streamLimitError] };
          }
          return {
            valid: false,
            errors: [{
              code: 'ARCHIVE_DECOMPRESSION_FAILED',
              entry: entry.rawName,
              message: `Decompression failed for "${entry.rawName}": ${err.message}`
            }]
          };
        }
      }

      const finalCrc = (rollingCrc ^ 0xffffffff) >>> 0;
      if (entryActualBytes !== entry.uncompressedSize) {
        return {
          valid: false,
          errors: [{
            code: 'ARCHIVE_DECOMPRESSED_SIZE_MISMATCH',
            entry: entry.rawName,
            message: `Actual decompressed size (${entryActualBytes} bytes) did not match declared size (${entry.uncompressedSize} bytes) for "${entry.rawName}".`
          }]
        };
      }

      if (finalCrc !== (entry.crc32 >>> 0)) {
        return {
          valid: false,
          errors: [{
            code: 'ARCHIVE_CRC_MISMATCH',
            entry: entry.rawName,
            message: `CRC-32 integrity check failed for "${entry.rawName}".`
          }]
        };
      }

      extractedFiles.set(entry.normalizedPath, {
        normalizedPath: entry.normalizedPath,
        diskPath: targetPath,
        sizeBytes: entryActualBytes,
        sha256: sha256Hash.digest('hex'),
        crc32: finalCrc
      });
    }

    return {
      valid: true,
      errors: [],
      extractedFiles,
      totalActualDecompressedBytes
    };
  } finally {
    try { fs.closeSync(fd); } catch (_) {}
  }
}

module.exports = {
  MAX_ARCHIVE_ENTRIES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_SINGLE_FILE_BYTES,
  MAX_COMPRESSED_ARCHIVE_BYTES,
  MAX_COMPRESSION_RATIO,
  inspectZipCentralDirectory,
  extractValidatedZipToStaging
};

