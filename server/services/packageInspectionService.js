const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SecurityService = require('./securityService');
const {
  MAX_ARCHIVE_ENTRIES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_SINGLE_FILE_BYTES,
  MAX_COMPRESSED_ARCHIVE_BYTES,
  MAX_COMPRESSION_RATIO,
  inspectZipCentralDirectory,
  extractValidatedZipToStaging
} = require('../utils/zipSafeInspector');
const { validateFkfDocument } = require('../utils/fkfSchemaValidator');
const {
  parseFkfDocument,
  stageCanonicalPackage,
  stripYamlFrontmatter,
  computeDeterministicSha256
} = require('../utils/fkfCanonicalParser');

const STAGING_BASE_DIR = path.resolve(__dirname, '..', '..', 'temp', 'fkp_inspect_staging');
const UPLOAD_TEMP_DIR = path.resolve(__dirname, '..', '..', 'temp', 'fkp_inspect_uploads');

function isFkfJsonFile(filePath, filename) {
  const ext = path.extname(filename || filePath || '').toLowerCase();
  if (ext === '.fkf' || ext === '.json') {
    return true;
  }
  try {
    if (fs.existsSync(filePath)) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      fs.closeSync(fd);
      const head = buf.slice(0, bytesRead).toString('utf8').trim();
      if (head.startsWith('{')) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

const REQUIRED_CORE_FILES = [
  'manifest.json',
  'project/overview.md',
  'folders.json',
  'sources/index.json',
  'relationships/links.json'
];

/**
 * Safely clean up stale inspection staging directories and temp upload files.
 * Default maxAgeMs = 3600000 (1 hour). Staging directories with an active lock
 * or belonging to an in-flight operation are never removed.
 */
function cleanupStaleStagingDirs(maxAgeMs = 3600000) {
  let removedCount = 0;
  const now = Date.now();

  for (const baseDir of [STAGING_BASE_DIR, UPLOAD_TEMP_DIR]) {
    try {
      if (!fs.existsSync(baseDir)) continue;
      const items = fs.readdirSync(baseDir);
      for (const item of items) {
        if (!item.startsWith('fkp_inspect_') && !item.startsWith('fkp_stage_')) continue;
        const fullPath = path.join(baseDir, item);
        try {
          const stat = fs.statSync(fullPath);
          const age = now - stat.mtimeMs;

          // Never delete active operations: protect directories with .active.lock
          const lockFile = path.join(fullPath, '.active.lock');
          if (fs.existsSync(lockFile) && age < 3600000) {
            continue;
          }

          if (maxAgeMs <= 0 || age >= maxAgeMs) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            removedCount += 1;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  return removedCount;
}

/**
 * Parse YAML frontmatter from a Markdown string.
 * Returns { hasFrontmatter, validFrontmatter, fields, body }.
 */
function parseMarkdownFrontmatter(markdownText) {
  const text = String(markdownText || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { hasFrontmatter: false, validFrontmatter: false, fields: {}, body: text };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { hasFrontmatter: true, validFrontmatter: false, fields: {}, body: text };
  }

  const rawYaml = match[1];
  const body = match[2];
  const fields = {};
  for (const line of rawYaml.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      let val = kv[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      } else if (val === 'null' || val === '~') {
        val = null;
      } else if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      }
      fields[kv[1]] = val;
    }
  }

  return { hasFrontmatter: true, validFrontmatter: true, fields, body };
}

/**
 * Extract all [[fkf:...]] WikiLink occurrences from Markdown text without modifying them.
 */
function extractFkfWikiLinks(markdownText) {
  const text = String(markdownText || '');
  const results = [];
  const regex = /\[\[fkf:([^\]]*)\]\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawToken = match[0];
    const inner = match[1];
    const pipeIdx = inner.indexOf('|');
    const targetId = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
    const label = pipeIdx === -1 ? null : inner.slice(pipeIdx + 1).trim();
    const validSyntax = /^[a-z][a-z0-9_-]{2,63}$/.test(targetId) && (label === null || label.length > 0);
    results.push({
      rawToken,
      targetId,
      label,
      validSyntax
    });
  }
  return results;
}

/**
 * Extract relative asset links (e.g., ../assets/foo.png or assets/foo.png) from Markdown.
 */
function extractMarkdownAssetPaths(markdownText) {
  const text = String(markdownText || '');
  const paths = [];
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = linkRe.exec(text)) !== null) {
    const rawTarget = match[1].trim();
    if (/^(https?:|mailto:|#)/i.test(rawTarget)) continue;
    if (rawTarget.startsWith('../assets/') || rawTarget.startsWith('assets/') || rawTarget.startsWith('./assets/')) {
      const normalized = rawTarget.replace(/^(\.\.\/|\.\/)+/, '');
      paths.push({ rawTarget, normalizedPath: normalized });
    }
  }
  return paths;
}

/**
 * Validate folder hierarchy for missing parents, cycles, and maximum depth (8).
 */
function validateFolderHierarchy(folders) {
  const errors = [];
  const folderMap = new Map();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  for (const f of folders) {
    if (f.parent_id !== null && f.parent_id !== undefined) {
      if (!folderMap.has(f.parent_id)) {
        errors.push({
          code: 'MISSING_FOLDER_PARENT',
          file: 'folders.json',
          entityId: f.id,
          message: `Folder "${f.id}" references non-existent parent_id "${f.parent_id}".`
        });
      }
    }
  }

  // Check cycles and depth
  for (const f of folders) {
    const visited = new Set([f.id]);
    let cur = f;
    let depth = 1;
    while (cur && cur.parent_id) {
      if (visited.has(cur.parent_id)) {
        errors.push({
          code: 'FOLDER_HIERARCHY_CYCLE',
          file: 'folders.json',
          entityId: f.id,
          message: `Circular folder hierarchy detected involving folder "${f.id}" and "${cur.parent_id}".`
        });
        break;
      }
      visited.add(cur.parent_id);
      cur = folderMap.get(cur.parent_id);
      depth += 1;
      if (depth > 8) {
        errors.push({
          code: 'FOLDER_DEPTH_EXCEEDED',
          file: 'folders.json',
          entityId: f.id,
          message: `Folder "${f.id}" exceeds maximum hierarchy depth of 8.`
        });
        break;
      }
    }
  }

  return errors;
}

/**
 * Inspect and validate an uploaded .flowden.zip package safely without importing any data.
 */
async function inspectKnowledgePackage({
  zipFilePath,
  originalFilename = 'package.flowden.zip',
  userId = null,
  ip = null,
  limits = {}
}) {
  const operationId = `fkp_inspect_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const stagingDir = path.join(STAGING_BASE_DIR, operationId);

  const errors = [];
  const warnings = [];
  const unsupportedFeatures = [];

  let archiveSha256 = null;
  try {
    if (fs.existsSync(zipFilePath)) {
      archiveSha256 = crypto.createHash('sha256').update(fs.readFileSync(zipFilePath)).digest('hex');
    }
  } catch (_) {}

  let packageMeta = {
    package_name: path.basename(originalFilename || 'package.flowden.zip'),
    package_id: null,
    format: null,
    fkf_version: null,
    sha256: archiveSha256
  };
  let projectMeta = null;
  let counts = {
    folders: 0,
    notes: 0,
    sources: 0,
    excerpts: 0,
    relationships: 0,
    assets: 0,
    tasks: 0,
    board_items: 0
  };
  let optionalModulesPresent = {
    tasks: false,
    spatial_board: false,
    research_report_pdf: false
  };
  let previewSummary = {
    folders: [],
    notes: [],
    sources: [],
    relationships: [],
    assets: []
  };
  let stagingCleanedUp = false;

  try {
    // Check if package is an FKF 2.0 single-file JSON/text document
    if (isFkfJsonFile(zipFilePath, originalFilename)) {
      let rawFkfText = '';
      try {
        rawFkfText = fs.readFileSync(zipFilePath, 'utf8');
      } catch (readErr) {
        errors.push({
          code: 'FILE_READ_ERROR',
          file: originalFilename || 'package.fkf',
          message: `Failed to read FKF file: ${readErr.message}`
        });
        return buildInspectionResponse();
      }

      const parseRes = parseFkfDocument(rawFkfText);
      if (!parseRes.valid) {
        errors.push(...parseRes.errors);
        warnings.push(...parseRes.warnings);
        await SecurityService.logSecurityEvent({
          userId,
          eventType: 'EXCHANGE_PACKAGE_ARCHIVE_REJECTED',
          severity: 'high',
          ip,
          targetType: 'exchange_package',
          targetId: operationId,
          details: { originalFilename, errorCodes: errors.map(e => e.code) }
        });
        return buildInspectionResponse();
      }

      const canonical = parseRes.canonical;
      archiveSha256 = canonical.sha256;
      packageMeta = {
        package_name: path.basename(originalFilename || 'package.fkf'),
        package_id: canonical.package_id,
        format: canonical.format,
        fkf_version: canonical.fkf_version,
        sha256: archiveSha256
      };
      projectMeta = canonical.project;
      counts = {
        folders: canonical.folders.length,
        notes: canonical.notes.length,
        sources: canonical.sources.length,
        excerpts: canonical.sources.reduce((sum, s) => sum + (s.excerpts ? s.excerpts.length : 0), 0),
        relationships: canonical.relationships.length,
        assets: 0,
        tasks: (canonical.optional_modules.tasks && canonical.optional_modules.tasks.tasks) ? canonical.optional_modules.tasks.tasks.length : 0,
        board_items: (canonical.optional_modules.spatial_board && canonical.optional_modules.spatial_board.board && canonical.optional_modules.spatial_board.board.items) ? canonical.optional_modules.spatial_board.board.items.length : 0
      };
      optionalModulesPresent = {
        tasks: counts.tasks > 0,
        spatial_board: Boolean(canonical.optional_modules.spatial_board && canonical.optional_modules.spatial_board.board),
        research_report_pdf: false
      };

      previewSummary = {
        folders: canonical.folders.slice(0, 10).map(f => ({ id: f.id, name: f.name, parent_id: f.parent_id })),
        notes: canonical.notes.slice(0, 10).map(n => ({
          id: n.id,
          title: n.title,
          folder_id: n.folder_id,
          word_count: n.content_markdown ? n.content_markdown.split(/\s+/).filter(Boolean).length : 0
        })),
        sources: canonical.sources.slice(0, 10).map(s => ({
          id: s.id,
          title: s.title,
          source_type: s.source_type,
          excerpt_count: s.excerpts ? s.excerpts.length : 0
        })),
        relationships: canonical.relationships.slice(0, 10).map(r => ({
          source_id: r.source_id,
          target_id: r.target_id,
          link_type: r.link_type
        })),
        assets: []
      };

      const folderErrors = validateFolderHierarchy(canonical.folders);
      if (folderErrors.length > 0) {
        errors.push(...folderErrors);
      }

      // Check board reference projections if spatial board present
      if (canonical.optional_modules.spatial_board && canonical.optional_modules.spatial_board.board) {
        const b = canonical.optional_modules.spatial_board.board;
        const validEntityIds = new Set([
          ...canonical.notes.map(n => n.id),
          ...canonical.sources.map(s => s.id),
          ...(canonical.optional_modules.tasks && canonical.optional_modules.tasks.tasks ? canonical.optional_modules.tasks.tasks.map(t => t.id) : [])
        ]);
        for (const itm of b.items || []) {
          if (itm.reference_package_id && !validEntityIds.has(itm.reference_package_id)) {
            errors.push({
              code: 'MISSING_RELATIONSHIP_TARGET',
              file: 'spatial-board',
              entityId: itm.id,
              message: `Board item "${itm.id}" projects non-existent reference_package_id "${itm.reference_package_id}".`
            });
          }
        }
      }

      stageCanonicalPackage(canonical, stagingDir);

      await SecurityService.logSecurityEvent({
        userId,
        eventType: errors.length === 0 ? 'EXCHANGE_PACKAGE_INSPECTED_VALID' : 'EXCHANGE_PACKAGE_INSPECTED_INVALID',
        severity: errors.length === 0 ? 'info' : 'warning',
        ip,
        targetType: 'exchange_package',
        targetId: packageMeta.package_id || operationId,
        details: {
          operationId,
          originalFilename,
          valid: errors.length === 0,
          errorCount: errors.length,
          warningCount: warnings.length
        }
      });

      return buildInspectionResponse();
    }

    // =========================================================================
    // STAGE 1: CENTRAL DIRECTORY INSPECTION (PRE-EXTRACTION)
    // =========================================================================
    const cdResult = inspectZipCentralDirectory(zipFilePath, limits);
    if (!cdResult.valid) {
      errors.push(...cdResult.errors);
      await SecurityService.logSecurityEvent({
        userId,
        eventType: 'EXCHANGE_PACKAGE_ARCHIVE_REJECTED',
        severity: 'high',
        ip,
        targetType: 'exchange_package',
        targetId: operationId,
        details: {
          originalFilename,
          errorCodes: cdResult.errors.map(e => e.code)
        }
      });
      return buildInspectionResponse();
    }

    // =========================================================================
    // STAGE 2: STREAMING EXTRACTION WITH LIVE DECOMPRESSED-BYTE & RATIO GUARDS
    // =========================================================================
    const extractResult = await extractValidatedZipToStaging(zipFilePath, stagingDir, cdResult, limits);
    if (!extractResult.valid) {
      errors.push(...extractResult.errors);
      await SecurityService.logSecurityEvent({
        userId,
        eventType: 'EXCHANGE_PACKAGE_EXTRACTION_REJECTED',
        severity: 'high',
        ip,
        targetType: 'exchange_package',
        targetId: operationId,
        details: {
          originalFilename,
          errorCodes: extractResult.errors.map(e => e.code)
        }
      });
      return buildInspectionResponse();
    }

    const extractedFiles = extractResult.extractedFiles;

    // =========================================================================
    // STAGE 3: REQUIRED CORE FILES & MANIFEST VERSION CHECK
    // =========================================================================
    for (const reqFile of REQUIRED_CORE_FILES) {
      if (!extractedFiles.has(reqFile)) {
        errors.push({
          code: 'MISSING_REQUIRED_FILE',
          file: reqFile,
          message: `Required core package file "${reqFile}" is missing from the archive.`
        });
      }
    }

    if (errors.length > 0) {
      return buildInspectionResponse();
    }

    const parsedJson = {};
    const coreJsonFiles = [
      { path: 'manifest.json', schemaDef: 'ManifestDocument' },
      { path: 'folders.json', schemaDef: 'FoldersFile' },
      { path: 'sources/index.json', schemaDef: 'SourcesIndexFile' },
      { path: 'relationships/links.json', schemaDef: 'RelationshipsFile' }
    ];

    for (const jf of coreJsonFiles) {
      const entry = extractedFiles.get(jf.path);
      try {
        const rawText = fs.readFileSync(entry.diskPath, 'utf8');
        if (rawText.includes('\0')) {
          errors.push({
            code: 'MALFORMED_JSON_FILE',
            file: jf.path,
            message: `JSON file "${jf.path}" contains illegal null bytes.`
          });
          continue;
        }
        parsedJson[jf.path] = JSON.parse(rawText);
      } catch (err) {
        errors.push({
          code: 'MALFORMED_JSON_FILE',
          file: jf.path,
          message: `Failed to parse JSON in "${jf.path}": ${err.message}`
        });
      }
    }

    if (errors.length > 0) {
      return buildInspectionResponse();
    }

    const manifest = parsedJson['manifest.json'];
    packageMeta.package_id = manifest.package_id || null;
    packageMeta.format = manifest.format || null;
    packageMeta.fkf_version = manifest.fkf_version || null;

    if (manifest.format !== 'flowden-knowledge-package') {
      errors.push({
        code: 'UNSUPPORTED_PACKAGE_FORMAT',
        file: 'manifest.json',
        message: `Unsupported package format "${manifest.format}"; expected "flowden-knowledge-package".`
      });
    }

    if (typeof manifest.fkf_version === 'string') {
      const verMatch = manifest.fkf_version.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!verMatch) {
        errors.push({
          code: 'INVALID_FKF_VERSION',
          file: 'manifest.json',
          message: `Invalid fkf_version "${manifest.fkf_version}".`
        });
      } else {
        const major = parseInt(verMatch[1], 10);
        const minor = parseInt(verMatch[2], 10);
        if (major !== 1) {
          unsupportedFeatures.push(`fkf_version:${manifest.fkf_version}`);
          errors.push({
            code: 'UNSUPPORTED_FKF_MAJOR_VERSION',
            file: 'manifest.json',
            message: `Unsupported FKF major version (${manifest.fkf_version}); this inspector supports FKF 1.x.`
          });
        } else if (minor > 0) {
          warnings.push({
            code: 'NEWER_FKF_MINOR_VERSION',
            file: 'manifest.json',
            message: `Package uses newer minor version ${manifest.fkf_version}; unknown additive optional fields will be ignored.`
          });
        }
      }
    }

    // =========================================================================
    // STAGE 4: JSON SCHEMA VALIDATION (Draft 2020-12)
    // =========================================================================
    for (const jf of coreJsonFiles) {
      const schemaErrs = validateFkfDocument(parsedJson[jf.path], jf.schemaDef, jf.path);
      errors.push(...schemaErrs);
    }

    // Inspect optional modules declarations and unknown optional files
    const knownOptionalFiles = new Set(['optional/tasks.json', 'optional/spatial-board.json']);
    for (const [extPath] of extractedFiles.entries()) {
      if (extPath.startsWith('optional/') && !knownOptionalFiles.has(extPath)) {
        unsupportedFeatures.push(`optional_module:${extPath}`);
        warnings.push({
          code: 'UNKNOWN_OPTIONAL_MODULE',
          file: extPath,
          message: `Unrecognized optional module "${extPath}" is not supported in FKF v1.0.0 and will be skipped.`
        });
      }
    }

    const optMod = manifest.optional_modules || {};
    if (optMod.tasks && optMod.tasks.enabled) {
      optionalModulesPresent.tasks = true;
      const tasksPath = optMod.tasks.file || 'optional/tasks.json';
      if (!extractedFiles.has(tasksPath)) {
        errors.push({
          code: 'MISSING_OPTIONAL_MODULE_FILE',
          file: tasksPath,
          message: `Optional module "tasks" is enabled in manifest.json, but "${tasksPath}" is missing.`
        });
      } else {
        try {
          parsedJson[tasksPath] = JSON.parse(fs.readFileSync(extractedFiles.get(tasksPath).diskPath, 'utf8'));
          errors.push(...validateFkfDocument(parsedJson[tasksPath], 'OptionalTasksFile', tasksPath));
        } catch (err) {
          errors.push({
            code: 'MALFORMED_JSON_FILE',
            file: tasksPath,
            message: `Failed to parse "${tasksPath}": ${err.message}`
          });
        }
      }
    }

    if (optMod.spatial_board && optMod.spatial_board.enabled) {
      optionalModulesPresent.spatial_board = true;
      const boardPath = optMod.spatial_board.file || 'optional/spatial-board.json';
      if (!extractedFiles.has(boardPath)) {
        errors.push({
          code: 'MISSING_OPTIONAL_MODULE_FILE',
          file: boardPath,
          message: `Optional module "spatial_board" is enabled in manifest.json, but "${boardPath}" is missing.`
        });
      } else {
        try {
          parsedJson[boardPath] = JSON.parse(fs.readFileSync(extractedFiles.get(boardPath).diskPath, 'utf8'));
          errors.push(...validateFkfDocument(parsedJson[boardPath], 'OptionalSpatialBoardFile', boardPath));
        } catch (err) {
          errors.push({
            code: 'MALFORMED_JSON_FILE',
            file: boardPath,
            message: `Failed to parse "${boardPath}": ${err.message}`
          });
        }
      }
    }

    if (optMod.research_report_pdf && optMod.research_report_pdf.enabled) {
      optionalModulesPresent.research_report_pdf = true;
      const pdfPath = optMod.research_report_pdf.file;
      if (!pdfPath || !extractedFiles.has(pdfPath)) {
        errors.push({
          code: 'MISSING_OPTIONAL_MODULE_FILE',
          file: pdfPath || 'exports/research-report.pdf',
          message: `Optional module "research_report_pdf" is enabled in manifest.json, but file "${pdfPath}" is missing.`
        });
      } else {
        const pdfEntry = extractedFiles.get(pdfPath);
        const pdfCheck = SecurityService.validateUploadedFile(pdfEntry.diskPath, path.posix.basename(pdfPath), 'application/pdf');
        if (!pdfCheck.valid) {
          errors.push({
            code: 'DISGUISED_OR_INVALID_ASSET',
            file: pdfPath,
            message: `Companion PDF "${pdfPath}" failed magic-byte validation: ${pdfCheck.reason}`
          });
        }
      }
    }

    if (errors.length > 0) {
      return buildInspectionResponse();
    }

    // =========================================================================
    // STAGE 5: PACKAGE-LOCAL ID UNIQUENESS & CROSS-FILE REFERENCE VALIDATION
    // =========================================================================
    const idRegistry = new Map();
    const noteIdSet = new Set();

    function registerPackageId(id, entityType, sourceFile) {
      if (!id || typeof id !== 'string') return;
      if (entityType === 'note') {
        if (noteIdSet.has(id)) {
          errors.push({
            code: 'DUPLICATE_NOTE_ID',
            file: sourceFile,
            entityId: id,
            message: `Duplicate Note package-local ID "${id}" detected in ${sourceFile}.`
          });
        }
        noteIdSet.add(id);
      }

      if (idRegistry.has(id)) {
        const prev = idRegistry.get(id);
        errors.push({
          code: 'DUPLICATE_PACKAGE_ID',
          file: sourceFile,
          entityId: id,
          message: `Duplicate package-local ID "${id}" in ${sourceFile} collides with ${prev.entityType} in ${prev.sourceFile}.`
        });
      } else {
        idRegistry.set(id, { id, entityType, sourceFile });
      }
    }

    registerPackageId(manifest.package_id, 'package', 'manifest.json');
    if (manifest.project) {
      registerPackageId(manifest.project.id, 'project', 'manifest.json');
      projectMeta = {
        id: manifest.project.id,
        title: manifest.project.title,
        summary: manifest.project.summary,
        overview_file: manifest.project.overview_file,
        color: manifest.project.color || '#6366f1',
        icon: manifest.project.icon || 'folder',
        tags: manifest.project.tags || []
      };
    }

    const folders = parsedJson['folders.json'].folders || [];
    counts.folders = folders.length;
    for (const f of folders) {
      registerPackageId(f.id, 'folder', 'folders.json');
      previewSummary.folders.push({
        id: f.id,
        name: f.name,
        parent_id: f.parent_id,
        sort_order: f.sort_order
      });
    }
    errors.push(...validateFolderHierarchy(folders));

    const manifestNotes = (manifest.entities && manifest.entities.notes) || [];
    counts.notes = manifestNotes.length;
    for (const n of manifestNotes) {
      registerPackageId(n.id, 'note', 'manifest.json');
    }

    const manifestAssets = (manifest.entities && manifest.entities.assets) || [];
    counts.assets = manifestAssets.length;
    const assetPathMap = new Map();
    for (const a of manifestAssets) {
      registerPackageId(a.id, 'asset', 'manifest.json');
      assetPathMap.set(a.path, a);
    }

    const sources = parsedJson['sources/index.json'].sources || [];
    counts.sources = sources.length;
    for (const s of sources) {
      registerPackageId(s.id, 'research', 'sources/index.json');
      const excerpts = s.excerpts || [];
      counts.excerpts += excerpts.length;
      for (const exc of excerpts) {
        registerPackageId(exc.id, 'excerpt', 'sources/index.json');
      }
    }

    const relationships = parsedJson['relationships/links.json'].links || [];
    counts.relationships = relationships.length;
    for (const rel of relationships) {
      registerPackageId(rel.id, 'relationship', 'relationships/links.json');
    }

    const tasks = parsedJson['optional/tasks.json'] ? (parsedJson['optional/tasks.json'].tasks || []) : [];
    counts.tasks = tasks.length;
    for (const t of tasks) {
      registerPackageId(t.id, 'task', 'optional/tasks.json');
    }

    const boardObj = parsedJson['optional/spatial-board.json'] ? parsedJson['optional/spatial-board.json'].board : null;
    if (boardObj) {
      registerPackageId(boardObj.id, 'board', 'optional/spatial-board.json');
      for (const g of boardObj.groups || []) {
        registerPackageId(g.id, 'board_group', 'optional/spatial-board.json');
      }
      for (const item of boardObj.items || []) {
        registerPackageId(item.id, 'board_item', 'optional/spatial-board.json');
      }
      counts.board_items = (boardObj.items || []).length;
      for (const conn of boardObj.connections || []) {
        registerPackageId(conn.id, 'board_connection', 'optional/spatial-board.json');
      }
    }

    // Check Generator Synthetic Sources Flag
    if (manifest.generator && manifest.generator.contains_synthetic_sources) {
      warnings.push({
        code: 'SYNTHETIC_SOURCES_PRESENT',
        file: 'manifest.json',
        message: 'Package generator declares synthetic demonstration sources (contains_synthetic_sources: true).'
      });
    }

    // Validate project/overview.md WikiLinks and Asset references
    const overviewEntry = extractedFiles.get('project/overview.md');
    if (overviewEntry) {
      const overviewText = fs.readFileSync(overviewEntry.diskPath, 'utf8');
      const overviewWikiLinks = extractFkfWikiLinks(overviewText);
      for (const wl of overviewWikiLinks) {
        if (!wl.validSyntax || !idRegistry.has(wl.targetId)) {
          errors.push({
            code: 'INVALID_WIKILINK_ID',
            file: 'project/overview.md',
            token: wl.rawToken,
            message: `WikiLink "${wl.rawToken}" in project/overview.md references unknown or invalid package ID "${wl.targetId}".`
          });
        }
      }
    }

    // Validate Notes (files, frontmatter, SHA-256, folder_id, asset_ids, WikiLinks, asset links)
    const declaredNoteFiles = new Set();
    const seenNoteTitles = new Map();

    for (const noteMeta of manifestNotes) {
      declaredNoteFiles.add(noteMeta.file);

      if (seenNoteTitles.has(noteMeta.title)) {
        warnings.push({
          code: 'DUPLICATE_NOTE_DISPLAY_TITLE',
          file: noteMeta.file,
          entityId: noteMeta.id,
          message: `Note "${noteMeta.id}" shares display title "${noteMeta.title}" with "${seenNoteTitles.get(noteMeta.title)}". Package-local IDs remain distinct.`
        });
      } else {
        seenNoteTitles.set(noteMeta.title, noteMeta.id);
      }

      if (noteMeta.folder_id !== null && noteMeta.folder_id !== undefined) {
        const folderRef = idRegistry.get(noteMeta.folder_id);
        if (!folderRef || folderRef.entityType !== 'folder') {
          errors.push({
            code: 'MISSING_NOTE_FOLDER',
            file: 'manifest.json',
            entityId: noteMeta.id,
            message: `Note "${noteMeta.id}" references non-existent folder_id "${noteMeta.folder_id}".`
          });
        }
      }

      for (const assetId of noteMeta.asset_ids || []) {
        const assetRef = idRegistry.get(assetId);
        if (!assetRef || assetRef.entityType !== 'asset') {
          errors.push({
            code: 'MISSING_ASSET_REFERENCE',
            file: 'manifest.json',
            entityId: noteMeta.id,
            message: `Note "${noteMeta.id}" references non-existent asset_id "${assetId}".`
          });
        }
      }

      const extractedNote = extractedFiles.get(noteMeta.file);
      if (!extractedNote) {
        errors.push({
          code: 'MISSING_NOTE_FILE',
          file: noteMeta.file,
          entityId: noteMeta.id,
          message: `Note file "${noteMeta.file}" declared for "${noteMeta.id}" is missing from the archive.`
        });
        continue;
      }

      if (noteMeta.sha256 && extractedNote.sha256 !== noteMeta.sha256) {
        errors.push({
          code: 'NOTE_INTEGRITY_MISMATCH',
          file: noteMeta.file,
          entityId: noteMeta.id,
          message: `SHA-256 hash mismatch for "${noteMeta.file}" (expected ${noteMeta.sha256}, actual ${extractedNote.sha256}).`
        });
      }

      const rawNoteText = fs.readFileSync(extractedNote.diskPath, 'utf8');
      const fm = parseMarkdownFrontmatter(rawNoteText);
      if (!fm.hasFrontmatter || !fm.validFrontmatter) {
        errors.push({
          code: 'MALFORMED_NOTE_FRONTMATTER',
          file: noteMeta.file,
          entityId: noteMeta.id,
          message: `Note file "${noteMeta.file}" is missing a valid YAML frontmatter block.`
        });
      } else if (fm.fields.id && fm.fields.id !== noteMeta.id) {
        errors.push({
          code: 'NOTE_FRONTMATTER_ID_MISMATCH',
          file: noteMeta.file,
          entityId: noteMeta.id,
          message: `Frontmatter id "${fm.fields.id}" in "${noteMeta.file}" does not match manifest id "${noteMeta.id}".`
        });
      }

      const noteWikiLinks = extractFkfWikiLinks(fm.body);
      for (const wl of noteWikiLinks) {
        if (!wl.validSyntax || !idRegistry.has(wl.targetId)) {
          errors.push({
            code: 'INVALID_WIKILINK_ID',
            file: noteMeta.file,
            entityId: noteMeta.id,
            token: wl.rawToken,
            message: `WikiLink "${wl.rawToken}" in "${noteMeta.file}" references unknown or invalid package ID "${wl.targetId}".`
          });
        }
      }

      const mdAssetPaths = extractMarkdownAssetPaths(fm.body);
      for (const ap of mdAssetPaths) {
        if (!assetPathMap.has(ap.normalizedPath) || !extractedFiles.has(ap.normalizedPath)) {
          errors.push({
            code: 'MISSING_ASSET_REFERENCE',
            file: noteMeta.file,
            entityId: noteMeta.id,
            message: `Note "${noteMeta.file}" links to asset "${ap.rawTarget}" ("${ap.normalizedPath}") which is missing from manifest.json or assets/.`
          });
        }
      }

      previewSummary.notes.push({
        id: noteMeta.id,
        title: noteMeta.title,
        disambiguation_hint: noteMeta.disambiguation_hint || null,
        file: noteMeta.file,
        folder_id: noteMeta.folder_id,
        tags: noteMeta.tags || [],
         preserved_wikilinks: noteWikiLinks.map(w => w.rawToken)
      });
    }

    // Check for undeclared files in notes/
    for (const [extPath] of extractedFiles.entries()) {
      if (extPath.startsWith('notes/') && !declaredNoteFiles.has(extPath)) {
        errors.push({
          code: 'UNDECLARED_NOTE_FILE',
          file: extPath,
          message: `Archive contains note file "${extPath}" that is not declared in manifest.json.`
        });
      }
    }

    // Validate Assets (existence, undeclared binaries, size_bytes, sha256, and SecurityService magic-byte check)
    const declaredAssetPaths = new Set();
    for (const assetMeta of manifestAssets) {
      declaredAssetPaths.add(assetMeta.path);
      const extractedAsset = extractedFiles.get(assetMeta.path);
      if (!extractedAsset) {
        errors.push({
          code: 'MISSING_ASSET_FILE',
          file: assetMeta.path,
          entityId: assetMeta.id,
          message: `Declared asset "${assetMeta.id}" ("${assetMeta.path}") is missing from the archive.`
        });
        continue;
      }

      if (extractedAsset.sizeBytes !== assetMeta.size_bytes) {
        errors.push({
          code: 'ASSET_INTEGRITY_MISMATCH',
          file: assetMeta.path,
          entityId: assetMeta.id,
          message: `Asset "${assetMeta.id}" size (${extractedAsset.sizeBytes} bytes) does not match manifest size_bytes (${assetMeta.size_bytes}).`
        });
      }

      if (extractedAsset.sha256 !== assetMeta.sha256) {
        errors.push({
          code: 'ASSET_INTEGRITY_MISMATCH',
          file: assetMeta.path,
          entityId: assetMeta.id,
          message: `Asset "${assetMeta.id}" SHA-256 (${extractedAsset.sha256}) does not match manifest sha256 (${assetMeta.sha256}).`
        });
      }

      // Magic-byte inspection via SecurityService.validateUploadedFile
      const secValidation = SecurityService.validateUploadedFile(
        extractedAsset.diskPath,
        assetMeta.filename,
        assetMeta.mime_type
      );

      if (!secValidation.valid) {
        errors.push({
          code: 'DISGUISED_OR_INVALID_ASSET',
          file: assetMeta.path,
          entityId: assetMeta.id,
          securityCode: secValidation.code,
          message: `Asset "${assetMeta.path}" failed magic-byte security inspection (${secValidation.code}): ${secValidation.reason}`
        });
      } else {
        previewSummary.assets.push({
          id: assetMeta.id,
          filename: assetMeta.filename,
          path: assetMeta.path,
          mime_type: assetMeta.mime_type,
          size_bytes: assetMeta.size_bytes
        });
      }
    }

    for (const [extPath] of extractedFiles.entries()) {
      if (extPath.startsWith('assets/') && !declaredAssetPaths.has(extPath)) {
        errors.push({
          code: 'UNDECLARED_ASSET_FILE',
          file: extPath,
          message: `Archive contains undeclared file "${extPath}" in assets/.`
        });
      }
    }

    // Validate Research Sources & External URLs
    const declaredSourceFiles = new Set(['sources/index.json']);
    for (const src of sources) {
      declaredSourceFiles.add(src.content_file);
      if (!extractedFiles.has(src.content_file)) {
        errors.push({
          code: 'MISSING_SOURCE_CONTENT_FILE',
          file: src.content_file,
          entityId: src.id,
          message: `Source "${src.id}" content_file "${src.content_file}" is missing from the archive.`
        });
      }

      if (src.source_url !== null && src.source_url !== undefined) {
        const urlCheck = await SecurityService.validateExternalUrl(src.source_url, { allowHttp: true });
        if (!urlCheck.valid) {
          warnings.push({
            code: 'INVALID_OR_BLOCKED_SOURCE_URL',
            file: 'sources/index.json',
            entityId: src.id,
            message: `Source "${src.id}" URL "${src.source_url}" was flagged by SecurityService.validateExternalUrl (${urlCheck.reason}).`
          });
        }
      }

      previewSummary.sources.push({
        id: src.id,
        title: src.title,
        source_type: src.source_type,
        verification_status: src.verification_status,
        is_synthetic_example: Boolean(src.is_synthetic_example),
        excerpt_count: (src.excerpts || []).length
      });
    }

    for (const [extPath] of extractedFiles.entries()) {
      if (extPath.startsWith('sources/') && !declaredSourceFiles.has(extPath)) {
        errors.push({
          code: 'UNDECLARED_SOURCE_FILE',
          file: extPath,
          message: `Archive contains undeclared file "${extPath}" in sources/.`
        });
      }
    }

    // Validate Semantic Relationships (must resolve by package-local ID and match declared entity types)
    for (const rel of relationships) {
      const srcTarget = idRegistry.get(rel.source_id);
      if (!srcTarget) {
        errors.push({
          code: 'MISSING_RELATIONSHIP_TARGET',
          file: 'relationships/links.json',
          entityId: rel.id,
          message: `Relationship "${rel.id}" source_id "${rel.source_id}" does not exist in the package.`
        });
      } else if (srcTarget.entityType !== rel.source_type) {
        errors.push({
          code: 'RELATIONSHIP_TYPE_MISMATCH',
          file: 'relationships/links.json',
          entityId: rel.id,
          message: `Relationship "${rel.id}" declares source_type "${rel.source_type}" for "${rel.source_id}", but entity is of type "${srcTarget.entityType}".`
        });
      }

      const tgtTarget = idRegistry.get(rel.target_id);
      if (!tgtTarget) {
        errors.push({
          code: 'MISSING_RELATIONSHIP_TARGET',
          file: 'relationships/links.json',
          entityId: rel.id,
          message: `Relationship "${rel.id}" target_id "${rel.target_id}" does not exist in the package.`
        });
      } else if (tgtTarget.entityType !== rel.target_type) {
        errors.push({
          code: 'RELATIONSHIP_TYPE_MISMATCH',
          file: 'relationships/links.json',
          entityId: rel.id,
          message: `Relationship "${rel.id}" declares target_type "${rel.target_type}" for "${rel.target_id}", but entity is of type "${tgtTarget.entityType}".`
        });
      }

      previewSummary.relationships.push({
        id: rel.id,
        source_type: rel.source_type,
        source_id: rel.source_id,
        target_type: rel.target_type,
        target_id: rel.target_id,
        link_type: rel.link_type
      });
    }

    // Validate Optional Tasks cross-references
    for (const task of tasks) {
      if (task.due_date !== null && task.due_date !== undefined) {
        warnings.push({
          code: 'TASK_EXPLICIT_DUE_DATE_PRESENT',
          file: 'optional/tasks.json',
          entityId: task.id,
          message: `Task "${task.id}" specifies due_date "${task.due_date}"; verify this deadline was user-supplied and not AI-invented.`
        });
      }
      for (const relId of task.related_entity_ids || []) {
        if (!idRegistry.has(relId)) {
          errors.push({
            code: 'MISSING_RELATIONSHIP_TARGET',
            file: 'optional/tasks.json',
            entityId: task.id,
            message: `Task "${task.id}" references non-existent related_entity_id "${relId}".`
          });
        }
      }
    }

    // Validate Optional Spatial Board cross-references
    if (boardObj) {
      const boardGroupIds = new Set((boardObj.groups || []).map(g => g.id));
      const boardItemIds = new Set((boardObj.items || []).map(i => i.id));

      for (const item of boardObj.items || []) {
        if (item.group_id !== null && item.group_id !== undefined && !boardGroupIds.has(item.group_id)) {
          errors.push({
            code: 'MISSING_BOARD_GROUP_TARGET',
            file: 'optional/spatial-board.json',
            entityId: item.id,
            message: `Board item "${item.id}" references non-existent group_id "${item.group_id}".`
          });
        }
        if (item.reference_package_id !== null && item.reference_package_id !== undefined) {
          const refEntity = idRegistry.get(item.reference_package_id);
          if (!refEntity) {
            errors.push({
              code: 'MISSING_RELATIONSHIP_TARGET',
              file: 'optional/spatial-board.json',
              entityId: item.id,
              message: `Board item "${item.id}" projects non-existent reference_package_id "${item.reference_package_id}".`
            });
          } else if (item.reference_type && refEntity.entityType !== item.reference_type) {
            errors.push({
              code: 'BOARD_PROJECTION_TYPE_MISMATCH',
              file: 'optional/spatial-board.json',
              entityId: item.id,
              message: `Board item "${item.id}" declares reference_type "${item.reference_type}", but "${item.reference_package_id}" is of type "${refEntity.entityType}".`
            });
          }
        }
      }

      for (const conn of boardObj.connections || []) {
        if (!boardItemIds.has(conn.source_item_id) || !boardItemIds.has(conn.target_item_id)) {
          errors.push({
            code: 'MISSING_BOARD_CONNECTION_ENDPOINT',
            file: 'optional/spatial-board.json',
            entityId: conn.id,
            message: `Board connection "${conn.id}" references missing board_item (${conn.source_item_id} -> ${conn.target_item_id}).`
          });
        }
      }
    }

    await SecurityService.logSecurityEvent({
      userId,
      eventType: errors.length === 0 ? 'EXCHANGE_PACKAGE_INSPECTED_VALID' : 'EXCHANGE_PACKAGE_INSPECTED_INVALID',
      severity: errors.length === 0 ? 'info' : 'warning',
      ip,
      targetType: 'exchange_package',
      targetId: packageMeta.package_id || operationId,
      details: {
        operationId,
        originalFilename,
        valid: errors.length === 0,
        errorCount: errors.length,
        warningCount: warnings.length
      }
    });

    return buildInspectionResponse();
  } finally {
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      stagingCleanedUp = !fs.existsSync(stagingDir);
    } catch (_) {
      stagingCleanedUp = false;
    }
  }

  function cleanupThisStagingDir() {
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      stagingCleanedUp = !fs.existsSync(stagingDir);
    } catch (_) {
      stagingCleanedUp = false;
    }
  }

  function buildInspectionResponse() {
    cleanupThisStagingDir();
    const isValid = errors.length === 0;
    return {
      valid: isValid,
      operation_id: operationId,
      package: {
        name: packageMeta.package_name,
        package_id: packageMeta.package_id,
        format: packageMeta.format,
        fkf_version: packageMeta.fkf_version,
        sha256: archiveSha256
      },
      package_sha256: archiveSha256,
      project: projectMeta,
      counts: {
        folders: counts.folders,
        notes: counts.notes,
        sources: counts.sources,
        excerpts: counts.excerpts,
        relationships: counts.relationships,
        assets: counts.assets,
        tasks: counts.tasks,
        board_items: counts.board_items
      },
      optional_modules: optionalModulesPresent,
      validation: {
        valid: isValid,
        error_count: errors.length,
        warning_count: warnings.length,
        errors,
        warnings,
        unsupported_features: unsupportedFeatures
      },
      preview: previewSummary,
      staging_cleaned_up: stagingCleanedUp,
      phase2b_preconditions: {
        markdown_storage_discrepancy:
          'PRECONDITION FOR PHASE 2B: Current live database and Note.js use notes.content (LONGTEXT), whereas Blueprint V2 identified notes.content_markdown as a target. Phase 2A does not write Notes; Phase 2B must formally reconcile this before Note persistence.',
        wikilink_identity_durability:
          'PRECONDITION FOR PHASE 2B: Phase 2A preserves stable [[fkf:<id>|Label]] tokens without rewriting them into title-only WikiLinks. Phase 2B must implement a rename-safe WikiLink/note_links synchronization strategy before importing Notes.',
        crash_recovery_scope:
          'PRECONDITION FOR PHASE 2B: Phase 2A performs stateless inspection and cleans up its own staging directories on exit and startup. Persistent import journaling, transactional DB commit, file promotion, and orphan reconciliation belong to Phase 2B.'
      }
    };
  }
}

module.exports = {
  STAGING_BASE_DIR,
  UPLOAD_TEMP_DIR,
  MAX_ARCHIVE_ENTRIES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_SINGLE_FILE_BYTES,
  MAX_COMPRESSED_ARCHIVE_BYTES,
  MAX_COMPRESSION_RATIO,
  cleanupStaleStagingDirs,
  inspectKnowledgePackage
};
