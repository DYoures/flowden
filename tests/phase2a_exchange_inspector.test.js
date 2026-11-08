const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const SecurityService = require('../server/services/securityService');
const app = require('../server/index');
const {
  STAGING_BASE_DIR,
  UPLOAD_TEMP_DIR,
  cleanupStaleStagingDirs,
  inspectKnowledgePackage
} = require('../server/services/packageInspectionService');

const PORT = 3092;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REF_ZIP_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'knowledge-exchange',
  'examples',
  'flowden-reference-package.flowden.zip'
);
const REF_DIR_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'knowledge-exchange',
  'examples',
  'flowden-reference-package'
);

// CRC-32 helper for crafting synthetic test ZIP buffers
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a custom ZIP Buffer from an array of entry descriptors:
 * {
 *   name: string,
 *   data?: Buffer | string,
 *   method?: 0 | 8,
 *   externalAttrs?: number,
 *   overrideCdUncompressedSize?: number,
 *   overrideCdCompressedSize?: number,
 *   overrideLfhUncompressedSize?: number,
 *   flags?: number
 * }
 */
function buildSyntheticZipBuffer(entrySpecs) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const spec of entrySpecs) {
    const nameBuf = Buffer.from(spec.name, 'utf8');
    const rawData = spec.data !== undefined
      ? (Buffer.isBuffer(spec.data) ? spec.data : Buffer.from(String(spec.data), 'utf8'))
      : Buffer.alloc(0);
    const method = spec.method !== undefined ? spec.method : 8;
    const compData = method === 8 && rawData.length > 0 ? zlib.deflateRawSync(rawData) : rawData;
    const crc = crc32(rawData);
    const flags = spec.flags || 0;
    const extAttrs = spec.externalAttrs !== undefined ? spec.externalAttrs : 0;

    const lfhUncomp = spec.overrideLfhUncompressedSize !== undefined ? spec.overrideLfhUncompressedSize : rawData.length;
    const cdUncomp = spec.overrideCdUncompressedSize !== undefined ? spec.overrideCdUncompressedSize : rawData.length;
    const cdComp = spec.overrideCdCompressedSize !== undefined ? spec.overrideCdCompressedSize : compData.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(flags, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compData.length, 18);
    lfh.writeUInt32LE(lfhUncomp, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    const localOffset = offset;
    localParts.push(lfh, nameBuf, compData);
    offset += lfh.length + nameBuf.length + compData.length;

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4); // UNIX version made by
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(flags, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(cdComp, 20);
    cdh.writeUInt32LE(cdUncomp, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(extAttrs >>> 0, 38);
    cdh.writeUInt32LE(localOffset, 42);

    cdParts.push(cdh, nameBuf);
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entrySpecs.length, 8);
  eocd.writeUInt16LE(entrySpecs.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

/**
 * Load all files from the unpacked reference package into a mutable Map<relPath, Buffer>
 * so tests can clone and mutate specific files to test validation edge cases.
 */
function loadReferencePackageMap() {
  const fileMap = new Map();
  function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const rel = full.slice(REF_DIR_PATH.length + 1).replace(/\\/g, '/');
        fileMap.set(rel, fs.readFileSync(full));
      }
    }
  }
  walk(REF_DIR_PATH);
  return fileMap;
}

function buildZipFromMap(fileMap, method = 8) {
  const specs = [];
  for (const [name, data] of fileMap.entries()) {
    specs.push({ name, data, method });
  }
  return buildSyntheticZipBuffer(specs);
}

async function uploadZipBufferToEndpoint(zipBuf, filename, token = null) {
  const formData = new FormData();
  const blob = new Blob([zipBuf], { type: 'application/zip' });
  formData.append('file', blob, filename);

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function getTableCounts() {
  const tables = [
    'projects',
    'notes',
    'note_folders',
    'note_links',
    'research_documents',
    'research_excerpts',
    'tasks',
    'boards',
    'board_items',
    'entities',
    'entity_links',
    'file_uploads'
  ];
  const counts = {};
  for (const t of tables) {
    const rows = await db.query(`SELECT COUNT(*) AS count FROM ${t}`);
    counts[t] = Number(rows[0].count || 0);
  }
  return counts;
}

(async () => {
  console.log('================================================================');
  console.log('  FLOWDEN PHASE 2A — SECURE PACKAGE INSPECTOR TEST SUITE');
  console.log('================================================================\n');

  await db.initDB();
  await SecurityService.ensureSecurityTables();

  const server = app.listen(PORT);
  let passed = 0;
  let failed = 0;
  let testUserId = null;

  function record(name, condition, detail = '') {
    if (condition) {
      passed += 1;
      console.log(`  [PASS] #${passed + failed} ${name}${detail ? ' — ' + detail : ''}`);
    } else {
      failed += 1;
      console.error(`  [FAIL] #${passed + failed} ${name}${detail ? ' — ' + detail : ''}`);
      throw new Error(`Test failed: ${name} (${detail})`);
    }
  }

  try {
    cleanupStaleStagingDirs(0);
    // Register & login an isolated test user in flowden_test
    const suffix = Date.now().toString(36);
    const email = `phase2a_inspector_${suffix}@flowden.test`;
    const password = 'InspectorPass!2026';

    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Phase 2A Tester', email, password })
    });
    const regData = await regRes.json();
    const token = regData.token;
    testUserId = regData.user ? regData.user.id : null;
    record('Test user registered in flowden_test', Boolean(token && testUserId), `userId=${testUserId}`);

    // Snapshot DB counts BEFORE any package inspection
    const countsBefore = await getTableCounts();

    // -------------------------------------------------------------------------
    // 1. Unauthorized endpoint requests & non-existent /commit check
    // -------------------------------------------------------------------------
    const unauthRes = await uploadZipBufferToEndpoint(fs.readFileSync(REF_ZIP_PATH), 'ref.flowden.zip', null);
    record('Unauthorized request (missing token) rejected with 401', unauthRes.status === 401);

    const badTokenRes = await uploadZipBufferToEndpoint(fs.readFileSync(REF_ZIP_PATH), 'ref.flowden.zip', 'invalid.jwt.token');
    record('Unauthorized request (invalid JWT) rejected with 401/403', badTokenRes.status === 401 || badTokenRes.status === 403);

    const commitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    record('/api/v1/exchange/commit rejects empty payload (or 404 in Phase 2A)', commitRes.status === 404 || commitRes.status === 400);

    // -------------------------------------------------------------------------
    // 2. Valid Reference Package (.flowden.zip)
    // -------------------------------------------------------------------------
    const refZipBuf = fs.readFileSync(REF_ZIP_PATH);
    const validRes = await uploadZipBufferToEndpoint(refZipBuf, 'flowden-reference-package.flowden.zip', token);
    record(
      'Valid reference package returns HTTP 200 and valid=true',
      validRes.status === 200 && validRes.data.valid === true,
      `package_id=${validRes.data.package_id}, version=${validRes.data.fkf_version}`
    );
    record(
      'Valid reference package reports accurate entity counts',
      validRes.data.folder_count === 3 &&
        validRes.data.note_count === 3 &&
        validRes.data.source_count === 2 &&
        validRes.data.excerpt_count === 3 &&
        validRes.data.relationship_count === 9 &&
        validRes.data.asset_count === 1 &&
        validRes.data.task_count === 2 &&
        validRes.data.board_item_count === 4 &&
        validRes.data.errors.length === 0,
      JSON.stringify(validRes.data.counts)
    );
    record(
      'Valid reference package preserves [[fkf:<id>|Label]] WikiLinks without rewriting to title-only links',
      Array.isArray(validRes.data.preview.notes) &&
        validRes.data.preview.notes.some(n =>
          n.preserved_wikilinks.includes('[[fkf:note-example-01|Thermal Performance Summary (High-Albedo Cool Roof Membranes)]]')
        )
    );
    record(
      'Valid reference package records Phase 2B architectural guardrails and cleans up staging',
      validRes.data.staging_cleaned_up === true &&
        Boolean(validRes.data.phase2b_preconditions.markdown_storage_discrepancy) &&
        Boolean(validRes.data.phase2b_preconditions.wikilink_identity_durability) &&
        Boolean(validRes.data.phase2b_preconditions.crash_recovery_scope)
    );

    // -------------------------------------------------------------------------
    // 3. Invalid Magic Bytes
    // -------------------------------------------------------------------------
    const badMagicBuf = Buffer.from('NOT_A_ZIP_FILE_HEADER_1234567890_ABCDEFGHIJKLMNOP', 'utf8');
    const badMagicRes = await uploadZipBufferToEndpoint(badMagicBuf, 'bad-magic.flowden.zip', token);
    record(
      'Invalid magic bytes rejected with INVALID_ZIP_MAGIC_BYTES',
      badMagicRes.status === 422 &&
        badMagicRes.data.valid === false &&
        badMagicRes.data.errors.some(e => e.code === 'INVALID_ZIP_MAGIC_BYTES')
    );

    // -------------------------------------------------------------------------
    // 4. Invalid / Truncated ZIP Structure
    // -------------------------------------------------------------------------
    const corruptZipBuf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 0xaa)]);
    const corruptZipRes = await uploadZipBufferToEndpoint(corruptZipBuf, 'corrupt.flowden.zip', token);
    record(
      'Corrupt/truncated ZIP without valid EOCD rejected with INVALID_ZIP_STRUCTURE',
      corruptZipRes.status === 422 &&
        corruptZipRes.data.valid === false &&
        corruptZipRes.data.errors.some(e => e.code === 'INVALID_ZIP_STRUCTURE')
    );

    // -------------------------------------------------------------------------
    // 5. ZIP Slip / Path Traversal (../)
    // -------------------------------------------------------------------------
    const slipZipBuf = buildSyntheticZipBuffer([
      { name: 'manifest.json', data: '{}' },
      { name: '../../evil-escape.txt', data: 'pwned' }
    ]);
    const slipRes = await uploadZipBufferToEndpoint(slipZipBuf, 'zip-slip.flowden.zip', token);
    record(
      'ZIP Slip path traversal (../../evil-escape.txt) rejected before extraction',
      slipRes.status === 422 &&
        slipRes.data.valid === false &&
        slipRes.data.errors.some(e => e.code === 'ARCHIVE_PATH_TRAVERSAL')
    );

    // -------------------------------------------------------------------------
    // 6. Absolute Paths & Invalid Path Separators
    // -------------------------------------------------------------------------
    const absZipBuf = buildSyntheticZipBuffer([
      { name: '/etc/passwd', data: 'root:x:0:0' }
    ]);
    const absRes = await uploadZipBufferToEndpoint(absZipBuf, 'abs-path.flowden.zip', token);
    record(
      'Absolute path (/etc/passwd) rejected with ARCHIVE_ABSOLUTE_PATH',
      absRes.status === 422 &&
        absRes.data.valid === false &&
        absRes.data.errors.some(e => e.code === 'ARCHIVE_ABSOLUTE_PATH')
    );

    const backslashZipBuf = buildSyntheticZipBuffer([
      { name: 'notes\\note-example-01.md', data: '# test' }
    ]);
    const backslashRes = await uploadZipBufferToEndpoint(backslashZipBuf, 'backslash.flowden.zip', token);
    record(
      'Backslash path separator (notes\\note-example-01.md) rejected with ARCHIVE_INVALID_PATH_SEPARATOR',
      backslashRes.status === 422 &&
        backslashRes.data.valid === false &&
        backslashRes.data.errors.some(e => e.code === 'ARCHIVE_INVALID_PATH_SEPARATOR')
    );

    // -------------------------------------------------------------------------
    // 7. Symlink Entries Rejected
    // -------------------------------------------------------------------------
    const symlinkZipBuf = buildSyntheticZipBuffer([
      {
        name: 'notes/symlink-note.md',
        data: '/etc/shadow',
        method: 0,
        externalAttrs: (0o120777 << 16) >>> 0 // POSIX S_IFLNK mode in upper 16 bits
      }
    ]);
    const symlinkRes = await uploadZipBufferToEndpoint(symlinkZipBuf, 'symlink.flowden.zip', token);
    record(
      'Symlink entry (POSIX S_IFLNK 0120000) rejected with ARCHIVE_SYMLINK_REJECTED',
      symlinkRes.status === 422 &&
        symlinkRes.data.valid === false &&
        symlinkRes.data.errors.some(e => e.code === 'ARCHIVE_SYMLINK_REJECTED')
    );

    // -------------------------------------------------------------------------
    // 8. Duplicate Archive Paths Rejected
    // -------------------------------------------------------------------------
    const dupPathZipBuf = buildSyntheticZipBuffer([
      { name: 'notes/note-example-01.md', data: 'first' },
      { name: 'notes/note-example-01.md', data: 'second' }
    ]);
    const dupPathRes = await uploadZipBufferToEndpoint(dupPathZipBuf, 'dup-path.flowden.zip', token);
    record(
      'Duplicate archive entry paths rejected with ARCHIVE_DUPLICATE_PATH',
      dupPathRes.status === 422 &&
        dupPathRes.data.valid === false &&
        dupPathRes.data.errors.some(e => e.code === 'ARCHIVE_DUPLICATE_PATH')
    );

    // -------------------------------------------------------------------------
    // 9. Excessive Archive Entries (> 500)
    // -------------------------------------------------------------------------
    const manyEntries = [];
    for (let i = 1; i <= 501; i++) {
      manyEntries.push({ name: `notes/note-${String(i).padStart(4, '0')}.md`, data: 'x', method: 0 });
    }
    const manyZipBuf = buildSyntheticZipBuffer(manyEntries);
    const manyRes = await uploadZipBufferToEndpoint(manyZipBuf, 'too-many.flowden.zip', token);
    record(
      'Excessive archive entries (501 > 500) rejected with ARCHIVE_TOO_MANY_ENTRIES',
      manyRes.status === 422 &&
        manyRes.data.valid === false &&
        manyRes.data.errors.some(e => e.code === 'ARCHIVE_TOO_MANY_ENTRIES')
    );

    // -------------------------------------------------------------------------
    // 10. Excessive Uncompressed Size (> 50 MB per file & > 250 MB total)
    // -------------------------------------------------------------------------
    const hugeEntryZipBuf = buildSyntheticZipBuffer([
      {
        name: 'notes/huge-note.md',
        data: Buffer.from('small'),
        method: 0,
        overrideCdUncompressedSize: 55 * 1024 * 1024, // 55 MB > 50 MB single-file limit
        overrideCdCompressedSize: 55 * 1024 * 1024
      }
    ]);
    const hugeEntryRes = await uploadZipBufferToEndpoint(hugeEntryZipBuf, 'huge-entry.flowden.zip', token);
    record(
      'Single entry exceeding 50 MB rejected with ARCHIVE_ENTRY_TOO_LARGE',
      hugeEntryRes.status === 422 &&
        hugeEntryRes.data.valid === false &&
        hugeEntryRes.data.errors.some(e => e.code === 'ARCHIVE_ENTRY_TOO_LARGE')
    );

    // 6 entries * 45 MB = 270 MB (> 250 MB total uncompressed limit, while each is < 50 MB)
    const totalHugeSpecs = [];
    for (let i = 1; i <= 6; i++) {
      totalHugeSpecs.push({
        name: `notes/chunk-${i}.md`,
        data: Buffer.from('small'),
        method: 0,
        overrideCdUncompressedSize: 45 * 1024 * 1024,
        overrideCdCompressedSize: 45 * 1024 * 1024
      });
    }
    const totalHugeZipBuf = buildSyntheticZipBuffer(totalHugeSpecs);
    const totalHugeRes = await uploadZipBufferToEndpoint(totalHugeZipBuf, 'total-huge.flowden.zip', token);
    record(
      'Total uncompressed size exceeding 250 MB (270 MB) rejected with ARCHIVE_TOTAL_UNCOMPRESSED_TOO_LARGE',
      totalHugeRes.status === 422 &&
        totalHugeRes.data.valid === false &&
        totalHugeRes.data.errors.some(e => e.code === 'ARCHIVE_TOTAL_UNCOMPRESSED_TOO_LARGE')
    );

    // Also verify compressed archive limit via service call with custom maxCompressedBytes
    const tmpCompLimPath = path.join(UPLOAD_TEMP_DIR, `fkp_inspect_complim_${Date.now()}.zip`);
    fs.writeFileSync(tmpCompLimPath, refZipBuf);
    const compLimReport = await inspectKnowledgePackage({
      zipFilePath: tmpCompLimPath,
      originalFilename: 'over-compressed-limit.flowden.zip',
      userId: testUserId,
      limits: { maxCompressedBytes: 1024 }
    });
    fs.unlinkSync(tmpCompLimPath);
    record(
      'Compressed archive exceeding maxCompressedBytes rejected with ARCHIVE_COMPRESSED_TOO_LARGE',
      compLimReport.valid === false &&
        compLimReport.validation.errors.some(e => e.code === 'ARCHIVE_COMPRESSED_TOO_LARGE')
    );

    // -------------------------------------------------------------------------
    // 11. Compression Ratio Violation (> 100:1) — Central Dir & Streaming Bomb
    // -------------------------------------------------------------------------
    const zeroPayload = Buffer.alloc(250 * 1024, 0); // 250 KB of zeros compresses to ~260 bytes (~960:1 ratio)
    const ratioBombBuf = buildSyntheticZipBuffer([
      { name: 'notes/bomb.md', data: zeroPayload, method: 8 }
    ]);
    const ratioBombRes = await uploadZipBufferToEndpoint(ratioBombBuf, 'ratio-bomb.flowden.zip', token);
    record(
      'Compression ratio violation (> 100:1) rejected at Central Directory check',
      ratioBombRes.status === 422 &&
        ratioBombRes.data.valid === false &&
        ratioBombRes.data.errors.some(e => e.code === 'ARCHIVE_COMPRESSION_RATIO_EXCEEDED')
    );

    // Spoofed Central Directory header claiming uncompressedSize = 500 bytes while actual Deflate stream expands to 250 KB
    const spoofedBombBuf = buildSyntheticZipBuffer([
      {
        name: 'notes/spoofed-bomb.md',
        data: zeroPayload,
        method: 8,
        overrideCdUncompressedSize: 500,
        overrideLfhUncompressedSize: 500
      }
    ]);
    const spoofedBombRes = await uploadZipBufferToEndpoint(spoofedBombBuf, 'spoofed-bomb.flowden.zip', token);
    record(
      'Spoofed header ZIP bomb caught during streaming decompression by live byte/ratio guard',
      spoofedBombRes.status === 422 &&
        spoofedBombRes.data.valid === false &&
        spoofedBombRes.data.errors.some(e => e.code === 'ARCHIVE_COMPRESSION_RATIO_EXCEEDED')
    );

    // -------------------------------------------------------------------------
    // 12. Disguised Executable Assets Rejected
    // -------------------------------------------------------------------------
    // 12a. Direct executable file extension in archive
    const exeEntryZip = buildSyntheticZipBuffer([
      { name: 'assets/malware.exe', data: 'MZ_FAKE_PE' }
    ]);
    const exeEntryRes = await uploadZipBufferToEndpoint(exeEntryZip, 'exe-entry.flowden.zip', token);
    record(
      'Executable file extension in archive (assets/malware.exe) rejected with ARCHIVE_DANGEROUS_FILE_TYPE',
      exeEntryRes.status === 422 &&
        exeEntryRes.data.valid === false &&
        exeEntryRes.data.errors.some(e => e.code === 'ARCHIVE_DANGEROUS_FILE_TYPE')
    );

    // 12b. Disguised PE executable (MZ magic bytes) renamed to architecture-diagram.png with matching SHA-256 in manifest
    const disguisedMap = loadReferencePackageMap();
    const fakePePayload = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00]), // Windows MZ PE header disguised as .png
      Buffer.from('This program cannot be run in DOS mode.', 'utf8')
    ]);
    disguisedMap.set('assets/architecture-diagram.png', fakePePayload);
    const disguisedManifest = JSON.parse(disguisedMap.get('manifest.json').toString('utf8'));
    disguisedManifest.entities.assets[0].size_bytes = fakePePayload.length;
    disguisedManifest.entities.assets[0].sha256 = crypto.createHash('sha256').update(fakePePayload).digest('hex');
    disguisedMap.set('manifest.json', Buffer.from(JSON.stringify(disguisedManifest, null, 2), 'utf8'));

    const disguisedRes = await uploadZipBufferToEndpoint(
      buildZipFromMap(disguisedMap),
      'disguised-exe.flowden.zip',
      token
    );
    record(
      'Disguised executable (MZ header inside .png) rejected by SecurityService.validateUploadedFile',
      disguisedRes.status === 422 &&
        disguisedRes.data.valid === false &&
        disguisedRes.data.errors.some(e => e.code === 'DISGUISED_OR_INVALID_ASSET')
    );

    // -------------------------------------------------------------------------
    // 13. Invalid JSON Schema Rejected
    // -------------------------------------------------------------------------
    const badSchemaMap = loadReferencePackageMap();
    const badLinks = JSON.parse(badSchemaMap.get('relationships/links.json').toString('utf8'));
    badLinks.links[0].link_type = 'invented_invalid_relationship_type';
    badSchemaMap.set('relationships/links.json', Buffer.from(JSON.stringify(badLinks, null, 2), 'utf8'));

    const badSchemaRes = await uploadZipBufferToEndpoint(
      buildZipFromMap(badSchemaMap),
      'bad-schema.flowden.zip',
      token
    );
    record(
      'Invalid JSON Schema (unsupported link_type enum) rejected with SCHEMA_VALIDATION_ERROR',
      badSchemaRes.status === 422 &&
        badSchemaRes.data.valid === false &&
        badSchemaRes.data.errors.some(e => e.code === 'SCHEMA_VALIDATION_ERROR')
    );

    // -------------------------------------------------------------------------
    // 14. Duplicate Package IDs Rejected
    // -------------------------------------------------------------------------
    const dupIdMap = loadReferencePackageMap();
    const dupIdManifest = JSON.parse(dupIdMap.get('manifest.json').toString('utf8'));
    dupIdManifest.entities.notes[1].id = 'note-example-01'; // Collides with notes[0].id
    dupIdMap.set('manifest.json', Buffer.from(JSON.stringify(dupIdManifest, null, 2), 'utf8'));

    const dupIdRes = await uploadZipBufferToEndpoint(buildZipFromMap(dupIdMap), 'dup-id.flowden.zip', token);
    record(
      'Duplicate package-local Note IDs rejected with DUPLICATE_NOTE_ID & DUPLICATE_PACKAGE_ID',
      dupIdRes.status === 422 &&
        dupIdRes.data.valid === false &&
        dupIdRes.data.errors.some(e => e.code === 'DUPLICATE_NOTE_ID' || e.code === 'DUPLICATE_PACKAGE_ID')
    );

    // -------------------------------------------------------------------------
    // 15. Missing Relationship Targets Rejected
    // -------------------------------------------------------------------------
    const missingRelMap = loadReferencePackageMap();
    const missingRelLinks = JSON.parse(missingRelMap.get('relationships/links.json').toString('utf8'));
    missingRelLinks.links[0].target_id = 'src-nonexistent-999';
    missingRelMap.set('relationships/links.json', Buffer.from(JSON.stringify(missingRelLinks, null, 2), 'utf8'));

    const missingRelRes = await uploadZipBufferToEndpoint(
      buildZipFromMap(missingRelMap),
      'missing-rel.flowden.zip',
      token
    );
    record(
      'Missing relationship target (src-nonexistent-999) rejected with MISSING_RELATIONSHIP_TARGET',
      missingRelRes.status === 422 &&
        missingRelRes.data.valid === false &&
        missingRelRes.data.errors.some(e => e.code === 'MISSING_RELATIONSHIP_TARGET')
    );

    // -------------------------------------------------------------------------
    // 16. Missing Assets Rejected
    // -------------------------------------------------------------------------
    const missingAssetMap = loadReferencePackageMap();
    missingAssetMap.delete('assets/architecture-diagram.png');

    const missingAssetRes = await uploadZipBufferToEndpoint(
      buildZipFromMap(missingAssetMap),
      'missing-asset.flowden.zip',
      token
    );
    record(
      'Missing declared asset (assets/architecture-diagram.png) rejected with MISSING_ASSET_FILE',
      missingAssetRes.status === 422 &&
        missingAssetRes.data.valid === false &&
        missingAssetRes.data.errors.some(e => e.code === 'MISSING_ASSET_FILE' || e.code === 'MISSING_ASSET_REFERENCE')
    );

    // -------------------------------------------------------------------------
    // 17. Invalid WikiLink IDs Rejected
    // -------------------------------------------------------------------------
    const badWikiMap = loadReferencePackageMap();
    let note1Text = badWikiMap.get('notes/note-example-01.md').toString('utf8');
    note1Text += '\n\nBroken reference: [[fkf:note-nonexistent-ghost|Ghost Note]]\n';
    const note1Buf = Buffer.from(note1Text, 'utf8');
    badWikiMap.set('notes/note-example-01.md', note1Buf);

    const badWikiManifest = JSON.parse(badWikiMap.get('manifest.json').toString('utf8'));
    badWikiManifest.entities.notes[0].sha256 = crypto.createHash('sha256').update(note1Buf).digest('hex');
    badWikiMap.set('manifest.json', Buffer.from(JSON.stringify(badWikiManifest, null, 2), 'utf8'));

    const badWikiRes = await uploadZipBufferToEndpoint(
      buildZipFromMap(badWikiMap),
      'bad-wikilink.flowden.zip',
      token
    );
    record(
      'Unresolved inline WikiLink ([[fkf:note-nonexistent-ghost|Ghost Note]]) rejected with INVALID_WIKILINK_ID',
      badWikiRes.status === 422 &&
        badWikiRes.data.valid === false &&
        badWikiRes.data.errors.some(e => e.code === 'INVALID_WIKILINK_ID')
    );

    // -------------------------------------------------------------------------
    // 17b. Unsupported Major FKF Version, Unknown Optional Module, Missing Required File, Circular Folders, SSRF Source URL
    // -------------------------------------------------------------------------
    const majorVerMap = loadReferencePackageMap();
    const majorVerManifest = JSON.parse(majorVerMap.get('manifest.json').toString('utf8'));
    majorVerManifest.fkf_version = '2.0.0';
    majorVerMap.set('manifest.json', Buffer.from(JSON.stringify(majorVerManifest, null, 2), 'utf8'));
    const majorVerRes = await uploadZipBufferToEndpoint(buildZipFromMap(majorVerMap), 'v2-major.flowden.zip', token);
    record(
      'Unsupported major fkf_version (2.0.0) rejected with UNSUPPORTED_FKF_MAJOR_VERSION',
      majorVerRes.status === 422 &&
        majorVerRes.data.valid === false &&
        majorVerRes.data.errors.some(e => e.code === 'UNSUPPORTED_FKF_MAJOR_VERSION') &&
        majorVerRes.data.unsupported_features.includes('fkf_version:2.0.0')
    );

    const unknownOptMap = loadReferencePackageMap();
    unknownOptMap.set('optional/flashcards.json', Buffer.from('{"cards":[]}', 'utf8'));
    const unknownOptRes = await uploadZipBufferToEndpoint(buildZipFromMap(unknownOptMap), 'unknown-opt.flowden.zip', token);
    record(
      'Unrecognized optional module (optional/flashcards.json) reported in warnings & unsupported_features while preserving valid core',
      unknownOptRes.status === 200 &&
        unknownOptRes.data.valid === true &&
        unknownOptRes.data.warnings.some(w => w.code === 'UNKNOWN_OPTIONAL_MODULE') &&
        unknownOptRes.data.unsupported_features.includes('optional_module:optional/flashcards.json'),
      JSON.stringify({ status: unknownOptRes.status, errors: unknownOptRes.data.errors, warnings: unknownOptRes.data.warnings, unsupported: unknownOptRes.data.unsupported_features })
    );

    const missingCoreMap = loadReferencePackageMap();
    missingCoreMap.delete('folders.json');
    const missingCoreRes = await uploadZipBufferToEndpoint(buildZipFromMap(missingCoreMap), 'missing-core.flowden.zip', token);
    record(
      'Missing required core file (folders.json) rejected with MISSING_REQUIRED_FILE',
      missingCoreRes.status === 422 &&
        missingCoreRes.data.valid === false &&
        missingCoreRes.data.errors.some(e => e.code === 'MISSING_REQUIRED_FILE')
    );

    const cycleFoldersMap = loadReferencePackageMap();
    const cycleFolders = JSON.parse(cycleFoldersMap.get('folders.json').toString('utf8'));
    cycleFolders.folders[0].parent_id = 'fld-roofing-systems'; // Creates 2-node cycle with fld-roofing-systems -> fld-empirical-models
    cycleFoldersMap.set('folders.json', Buffer.from(JSON.stringify(cycleFolders, null, 2), 'utf8'));
    const cycleFoldersRes = await uploadZipBufferToEndpoint(buildZipFromMap(cycleFoldersMap), 'cycle-folders.flowden.zip', token);
    record(
      'Circular folder hierarchy in folders.json rejected with FOLDER_HIERARCHY_CYCLE',
      cycleFoldersRes.status === 422 &&
        cycleFoldersRes.data.valid === false &&
        cycleFoldersRes.data.errors.some(e => e.code === 'FOLDER_HIERARCHY_CYCLE')
    );

    const ssrfUrlMap = loadReferencePackageMap();
    const ssrfSources = JSON.parse(ssrfUrlMap.get('sources/index.json').toString('utf8'));
    ssrfSources.sources[0].source_url = 'http://127.0.0.1:8080/internal-admin';
    ssrfUrlMap.set('sources/index.json', Buffer.from(JSON.stringify(ssrfSources, null, 2), 'utf8'));
    const ssrfUrlRes = await uploadZipBufferToEndpoint(buildZipFromMap(ssrfUrlMap), 'ssrf-url.flowden.zip', token);
    record(
      'Loopback/private source_url flagged by SecurityService.validateExternalUrl with INVALID_OR_BLOCKED_SOURCE_URL warning',
      ssrfUrlRes.data.warnings.some(w => w.code === 'INVALID_OR_BLOCKED_SOURCE_URL')
    );

    // -------------------------------------------------------------------------
    // 18. Staging & Startup Cleanup Verification + Zero Database Import Proof
    // -------------------------------------------------------------------------
    const remainingStagingDirs = fs.existsSync(STAGING_BASE_DIR)
      ? fs.readdirSync(STAGING_BASE_DIR).filter(f => f.startsWith('fkp_inspect_'))
      : [];
    const remainingUploadFiles = fs.existsSync(UPLOAD_TEMP_DIR)
      ? fs.readdirSync(UPLOAD_TEMP_DIR).filter(f => f.startsWith('fkp_inspect_'))
      : [];
    record(
      'All inspection staging directories and temp uploads cleaned up after valid & failed runs',
      remainingStagingDirs.length === 0 && remainingUploadFiles.length === 0,
      `staging=${remainingStagingDirs.length}, uploads=${remainingUploadFiles.length}`
    );

    // Simulate a crashed leftover staging directory and verify startup cleanup removes it
    const simulatedOrphanDir = path.join(STAGING_BASE_DIR, 'fkp_inspect_simulated_crash_001');
    fs.mkdirSync(simulatedOrphanDir, { recursive: true });
    fs.writeFileSync(path.join(simulatedOrphanDir, 'orphan.txt'), 'leftover');
    const cleanedOrphans = cleanupStaleStagingDirs(0);
    record(
      'Startup cleanup hook (cleanupStaleStagingDirs) removes simulated interrupted staging directories',
      cleanedOrphans >= 1 && !fs.existsSync(simulatedOrphanDir)
    );

    // Verify ZERO entities were imported or modified in the database across all inspections
    const countsAfter = await getTableCounts();
    const diffTables = Object.keys(countsBefore).filter(t => countsBefore[t] !== countsAfter[t]);
    record(
      'Zero Projects, Notes, Folders, Sources, Excerpts, Tasks, Boards, Graph Links, or File Uploads created during Phase 2A inspection',
      diffTables.length === 0,
      `diffTables=${JSON.stringify(diffTables)}`
    );

    console.log(`\n================================================================`);
    console.log(`  PHASE 2A TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`================================================================\n`);
  } finally {
    try {
      await db.query("DELETE FROM security_audit_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'phase2a_inspector_%@flowden.test')");
      await db.query("DELETE FROM users WHERE email LIKE 'phase2a_inspector_%@flowden.test'");
    } catch (_) {}
    server.close();
    process.exit(failed === 0 ? 0 : 1);
  }
})();
