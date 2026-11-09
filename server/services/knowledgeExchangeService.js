/**
 * Flowden Knowledge Exchange Service — Phase 2B
 * Transactional Knowledge Importer & Crash-Safe Commit Pipeline
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/database');
const SecurityService = require('./securityService');
const EntitySyncService = require('./entitySyncService');
const Project = require('../models/Project');
const Note = require('../models/Note');
const {
  inspectKnowledgePackage,
  parseMarkdownFrontmatter,
  cleanupStaleStagingDirs,
  STAGING_BASE_DIR,
  UPLOAD_TEMP_DIR,
  MAX_COMPRESSED_ARCHIVE_BYTES
} = require('./packageInspectionService');
const { extractValidatedZipToStaging } = require('../utils/zipSafeInspector');
const {
  stripYamlFrontmatter,
  parseFkfDocument,
  stageCanonicalPackage
} = require('../utils/fkfCanonicalParser');

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

function derivePlaintextExcerpt(markdownText, maxLen = 150) {
  if (!markdownText) return '';
  const text = String(markdownText)
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/^\s*>\s*/gm, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '...';
}

const JOURNAL_DIR = path.resolve(__dirname, '..', '..', 'temp', 'fkp_journals');
const VAULT_UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'vault');
const RESEARCH_UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'research');

// Ensure required directories exist
for (const dir of [JOURNAL_DIR, VAULT_UPLOADS_DIR, RESEARCH_UPLOADS_DIR, STAGING_BASE_DIR, UPLOAD_TEMP_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

const JOB_STATES = {
  VALIDATING: 'validating',
  FAILED_VALIDATION: 'failed_validation',
  STAGED: 'staged',
  COMMITTING_FILES: 'committing_files',
  COMMITTING_DB: 'committing_db',
  COMMITTED: 'committed',
  ROLLBACK_PENDING: 'rollback_pending',
  ROLLED_BACK: 'rolled_back',
  RECOVERY_REQUIRED: 'recovery_required'
};

/**
 * Atomic write-ahead journal utility
 */
async function writeAheadJournal(journalPath, data) {
  const tmpPath = `${journalPath}.tmp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, journalPath);
}

function removeFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

function removeDirIfExists(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (_) {}
}

/**
 * Topologically sort folder tree from roots to leaves
 */
function topologicalSortFolders(folders) {
  const result = [];
  const visited = new Set();
  const folderMap = new Map(folders.map(f => [f.id, f]));

  function visit(folderId, pathSet = new Set()) {
    if (visited.has(folderId)) return;
    if (pathSet.has(folderId)) {
      throw new Error(`Circular folder hierarchy detected at folder ID: ${folderId}`);
    }
    pathSet.add(folderId);
    const folder = folderMap.get(folderId);
    if (!folder) return;

    if (folder.parent_id && folderMap.has(folder.parent_id)) {
      visit(folder.parent_id, new Set(pathSet));
    }
    visited.add(folderId);
    result.push(folder);
  }

  for (const f of folders) {
    if (!visited.has(f.id)) {
      visit(f.id);
    }
  }

  return result;
}

/**
 * Calculate word count
 */
function countWords(str) {
  if (!str) return 0;
  return (str.match(/\S+/g) || []).length;
}

/**
 * Main Knowledge Exchange Importer Service
 */
class KnowledgeExchangeService {
  /**
   * Resolves folder import according to conflict resolution policies:
   * - link_to_existing: reuses existing matching folder
   * - skip: skips folder creation and re-maps to parent
   * - disambiguate: generates a unique name if collision exists
   */
  static async resolveFolderConflict(dbOrConn, {
    userId,
    targetProjectId,
    parentDbId,
    folderName,
    conflictResolution = 'disambiguate',
    sortOrder = 0
  }) {
    const cleanName = String(folderName || '').trim();
    const normalizedProjectId = (targetProjectId !== undefined && targetProjectId !== null) ? parseInt(targetProjectId, 10) : null;

    // Check for existing matching folder strictly within the target project scope and parent hierarchy
    const existingFolders = await dbOrConn.query(
      `SELECT id, name FROM note_folders 
       WHERE user_id = ? 
         AND (project_id <=> ?)
         AND (parent_folder_id <=> ?)
         AND LOWER(name) = LOWER(?)
       LIMIT 1`,
      [userId, normalizedProjectId, parentDbId, cleanName]
    );

    if (existingFolders && existingFolders.length > 0) {
      if (conflictResolution === 'link_to_existing') {
        const ef = existingFolders[0];
        return {
          action: 'link_to_existing',
          folderDbId: ef.id,
          finalFolderName: ef.name,
          created: false
        };
      } else if (conflictResolution === 'skip') {
        return {
          action: 'skip',
          folderDbId: parentDbId,
          finalFolderName: 'Skipped',
          created: false
        };
      }
    }

    // Default: disambiguate name if conflict exists within the exact project scope
    let finalFolderName = cleanName;
    if (existingFolders && existingFolders.length > 0) {
      let suffix = 1;
      while (true) {
        const candidate = `${cleanName} (${suffix})`;
        const collision = await dbOrConn.query(
          `SELECT id FROM note_folders 
           WHERE user_id = ? 
             AND (project_id <=> ?)
             AND (parent_folder_id <=> ?)
             AND LOWER(name) = LOWER(?)
           LIMIT 1`,
          [userId, normalizedProjectId, parentDbId, candidate]
        );
        if (!collision || collision.length === 0) {
          finalFolderName = candidate;
          break;
        }
        suffix++;
      }
    }

    const fIns = await dbOrConn.query(
      `INSERT INTO note_folders (user_id, project_id, parent_folder_id, name, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, normalizedProjectId, parentDbId, finalFolderName, sortOrder]
    );
    const folderDbId = fIns.insertId || (fIns[0] && fIns[0].insertId);

    return {
      action: existingFolders && existingFolders.length > 0 ? 'disambiguate' : 'create',
      folderDbId,
      finalFolderName,
      created: true
    };
  }

  /**
   * Imports semantic relationships from package links into entity_links.
   * Invariant: origin 'ai_suggested' must have is_confirmed = 0.
   * Semantic links NEVER insert into note_links.
   */
  static async importRelationships(dbOrConn, { userId, links, packageIdMap }) {
    let createdCount = 0;
    if (!links || !Array.isArray(links)) return { relationshipCount: 0 };

    for (const link of links) {
      const source = packageIdMap.get(link.source_id);
      const target = packageIdMap.get(link.target_id);

      if (source && target) {
        const validLinkTypes = [
          'references', 'embeds', 'cites', 'derived_from', 'supports',
          'contradicts', 'inspired_by', 'depends_on', 'blocks', 'relates_to'
        ];
        const finalLinkType = validLinkTypes.includes(link.link_type) ? link.link_type : 'relates_to';
        const validOrigins = [
          'manual', 'ai_suggested', 'citation', 'rule_engine', 'system_event', 'template_seed', 'graph_inference', 'task_sync'
        ];
        const origin = link.origin && validOrigins.includes(link.origin) ? link.origin : (link.link_type === 'cites' ? 'citation' : 'ai_suggested');
        const isConfirmed = origin === 'ai_suggested' ? 0 : (link.is_confirmed !== undefined ? (link.is_confirmed ? 1 : 0) : 1);
        const contextSnippet = link.context_snippet ? String(link.context_snippet).slice(0, 500) : null;

        await dbOrConn.query(
          `INSERT INTO entity_links (
            user_id, source_type, source_id, target_type, target_id,
            link_type, origin, context_snippet, is_confirmed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE 
            context_snippet = COALESCE(VALUES(context_snippet), entity_links.context_snippet),
            updated_at = NOW()`,
          [
            userId,
            source.entityType,
            source.dbId,
            target.entityType,
            target.dbId,
            finalLinkType,
            origin,
            contextSnippet,
            isConfirmed
          ]
        );
        createdCount += 1;
      }
    }
    return { relationshipCount: createdCount };
  }

  /**
   * Strictly verifies package file existence, 64-hex SHA-256 format,
   * and raw byte-for-byte SHA-256 match. Rejects missing, empty, canonical,
   * or altered package bytes.
   */
  static verifyPackageIntegrity({
    packageSha256,
    zipFilePath,
    userId = null,
    ip = '127.0.0.1'
  }) {
    if (!zipFilePath || !fs.existsSync(zipFilePath)) {
      const err = new Error('Archive file does not exist on disk.');
      err.code = 'ARCHIVE_FILE_MISSING';
      err.status = 400;
      throw err;
    }

    // Reject empty, null, undefined, or non-64-character hex strings
    if (!packageSha256 || typeof packageSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(packageSha256.trim())) {
      if (userId) {
        SecurityService.logSecurityEvent({
          userId,
          eventType: 'EXCHANGE_COMMIT_INVALID_HASH_FORMAT',
          severity: 'high',
          ip,
          targetType: 'exchange_package',
          details: { packageSha256 }
        }).catch(() => {});
      }
      const err = new Error('Package SHA-256 is required and must be a valid 64-character hex string.');
      err.code = 'INVALID_PACKAGE_HASH';
      err.status = 400;
      throw err;
    }
    const expectedSha = packageSha256.trim().toLowerCase();

    // Compute actual archive raw bytes SHA-256
    const zipBuffer = fs.readFileSync(zipFilePath);
    const computedRawSha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex').toLowerCase();

    // Strict byte-for-byte integrity comparison (canonical hash cannot substitute raw hash)
    if (expectedSha !== computedRawSha256) {
      if (userId) {
        SecurityService.logSecurityEvent({
          userId,
          eventType: 'EXCHANGE_COMMIT_HASH_MISMATCH',
          severity: 'high',
          ip,
          targetType: 'exchange_package',
          details: { expected: expectedSha, actual: computedRawSha256 }
        }).catch(() => {});
      }
      const err = new Error('Package SHA-256 hash mismatch between inspection approval and commit package.');
      err.code = 'PACKAGE_HASH_MISMATCH';
      err.status = 422;
      throw err;
    }

    return { valid: true, computedRawSha256 };
  }

  /**
   * Safe execution of the complete 2-pass transactional import pipeline
   */
  static async executeImport({
    userId,
    operationId: requestedOpId,
    idempotencyKey,
    packageSha256,
    zipFilePath,
    originalFilename,
    destinationProjectId = null,
    conflictResolution = 'disambiguate',
    dryRunValidateOnly = false,
    ip = '127.0.0.1'
  }) {
    if (!userId) throw new Error('Authenticated user ID is required for import.');

    const operationId = requestedOpId || crypto.randomUUID();
    const journalPath = path.join(JOURNAL_DIR, `${operationId}.journal.json`);
    const stageDir = path.join(STAGING_BASE_DIR, `fkp_stage_${operationId}`);

    // Verify raw package bytes integrity strictly
    const { computedRawSha256 } = KnowledgeExchangeService.verifyPackageIntegrity({
      packageSha256,
      zipFilePath,
      userId,
      ip
    });
    const computedSha256 = computedRawSha256;

    if (dryRunValidateOnly) {
      return {
        success: true,
        dryRun: true,
        packageSha256: computedSha256,
        operationId
      };
    }

    // ------------------------------------------------------------------------
    // Step 1: Race-Safe Idempotency & Concurrency Check
    // ------------------------------------------------------------------------
    if (idempotencyKey || operationId) {
      let existingJobs = [];
      try {
        if (idempotencyKey) {
          existingJobs = await db.query(
            'SELECT * FROM knowledge_import_jobs WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
            [userId, idempotencyKey]
          );
        } else {
          existingJobs = await db.query(
            'SELECT * FROM knowledge_import_jobs WHERE operation_id = ? LIMIT 1',
            [operationId]
          );
        }
      } catch (_) {}

      const existingJob = existingJobs && existingJobs[0];
      if (existingJob) {
        // Enforce hash consistency: same key cannot be reused for different package bytes
        if (existingJob.package_sha256 && existingJob.package_sha256 !== computedSha256) {
          const err = new Error('Idempotency key has already been used with a different package hash.');
          err.code = 'IDEMPOTENCY_KEY_REUSED_DIFFERENT_HASH';
          err.status = 409;
          throw err;
        }

        if (existingJob.state === JOB_STATES.COMMITTED) {
          const summary = typeof existingJob.summary_json === 'string'
            ? JSON.parse(existingJob.summary_json)
            : (existingJob.summary_json || {});
          return {
            success: true,
            idempotent_replay: true,
            operation_id: existingJob.operation_id,
            state: JOB_STATES.COMMITTED,
            created_project_id: existingJob.created_project_id,
            counts: summary.counts || {},
            summary
          };
        }

        // Active job in progress
        const activeStates = [
          JOB_STATES.VALIDATING,
          JOB_STATES.STAGED,
          JOB_STATES.COMMITTING_FILES,
          JOB_STATES.COMMITTING_DB,
          JOB_STATES.ROLLBACK_PENDING
        ];
        if (activeStates.includes(existingJob.state)) {
          const err = new Error('An import operation with this idempotency key is currently in progress.');
          err.code = 'IMPORT_IN_PROGRESS';
          err.status = 409;
          throw err;
        }
      }
    }

    // Atomic insert reservation (no ON DUPLICATE KEY UPDATE)
    const jobId = `job_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    try {
      await db.query(
        `INSERT INTO knowledge_import_jobs (
          id, operation_id, idempotency_key, user_id, destination_project_id,
          package_name, package_sha256, state, staging_dir, journal_path,
          started_at, heartbeat_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'validating', ?, ?, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [
          jobId,
          operationId,
          idempotencyKey || null,
          userId,
          destinationProjectId ? parseInt(destinationProjectId, 10) : null,
          originalFilename || 'package.flowden.zip',
          computedSha256,
          stageDir,
          journalPath
        ]
      );
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY' || (insertErr.message && insertErr.message.includes('Duplicate entry'))) {
        // Handle race-condition collision on atomic unique constraint
        if (idempotencyKey) {
          const [existing] = await db.query(
            'SELECT * FROM knowledge_import_jobs WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
            [userId, idempotencyKey]
          );
          if (existing) {
            if (existing.package_sha256 && existing.package_sha256 !== computedSha256) {
              const err = new Error('Idempotency key has already been used with a different package hash.');
              err.code = 'IDEMPOTENCY_KEY_REUSED_DIFFERENT_HASH';
              err.status = 409;
              throw err;
            }
            if (existing.state === JOB_STATES.COMMITTED) {
              const summary = typeof existing.summary_json === 'string'
                ? JSON.parse(existing.summary_json)
                : (existing.summary_json || {});
              return {
                success: true,
                idempotent_replay: true,
                operation_id: existing.operation_id,
                state: JOB_STATES.COMMITTED,
                created_project_id: existing.created_project_id,
                counts: summary.counts || {},
                summary
              };
            }
          }
        }
        const err = new Error('An import operation for this package or idempotency key is already in progress.');
        err.code = 'IMPORT_IN_PROGRESS';
        err.status = 409;
        throw err;
      }
      throw insertErr;
    }

    // ------------------------------------------------------------------------
    // Step 2: Safe Inspection & Staging Extraction
    // ------------------------------------------------------------------------
    const inspectionReport = await inspectKnowledgePackage({
      zipFilePath,
      originalFilename: originalFilename || 'package.flowden.zip',
      userId,
      ip
    });

    if (!inspectionReport.valid) {
      await db.query(
        `UPDATE knowledge_import_jobs
         SET state = 'failed_validation', error_details_json = ?
         WHERE operation_id = ?`,
        [JSON.stringify(inspectionReport.validation.errors), operationId]
      );

      const err = new Error('Package failed safe archive and schema validation.');
      err.code = 'PACKAGE_VALIDATION_FAILED';
      err.status = 422;
      err.errors = inspectionReport.validation.errors;
      throw err;
    }

    // Extract archive to dedicated import staging dir
    if (!fs.existsSync(stageDir)) {
      fs.mkdirSync(stageDir, { recursive: true });
    }
    // Write active lock file to prevent concurrent deletion
    fs.writeFileSync(
      path.join(stageDir, '.active.lock'),
      JSON.stringify({ pid: process.pid, operationId, startedAt: Date.now() }),
      'utf8'
    );

    let centralDir = null;
    if (isFkfJsonFile(zipFilePath, originalFilename)) {
      const rawFkf = fs.readFileSync(zipFilePath, 'utf8');
      const parseRes = parseFkfDocument(rawFkf);
      if (!parseRes.valid) {
        const err = new Error('FKF JSON package failed validation.');
        err.code = 'PACKAGE_VALIDATION_FAILED';
        err.errors = parseRes.errors;
        throw err;
      }
      stageCanonicalPackage(parseRes.canonical, stageDir);
    } else {
      centralDir = await extractValidatedZipToStaging(zipFilePath, stageDir);
    }

    // Initialize Write-Ahead Journal
    const journalData = {
      operation_id: operationId,
      user_id: userId,
      idempotency_key: idempotencyKey || null,
      package_sha256: computedSha256,
      state: JOB_STATES.STAGED,
      staging_dir: stageDir,
      promoted_files: [],
      created_project_id: null,
      started_at: new Date().toISOString()
    };
    await writeAheadJournal(journalPath, journalData);

    await db.query(
      `UPDATE knowledge_import_jobs SET state = 'staged', heartbeat_at = NOW() WHERE operation_id = ?`,
      [operationId]
    );

    // ------------------------------------------------------------------------
    // Step 3: Destination Project Authorization & Conflict Resolution
    // ------------------------------------------------------------------------
    let targetProjectId = destinationProjectId ? parseInt(destinationProjectId, 10) : null;
    let targetProjectTitle = inspectionReport.project.title;

    if (targetProjectId) {
      const allowed = await Project.findById(targetProjectId, userId);
      if (!allowed) {
        await SecurityService.logSecurityEvent({
          userId,
          eventType: 'EXCHANGE_COMMIT_UNAUTHORIZED_PROJECT',
          severity: 'warning',
          ip,
          targetType: 'project',
          targetId: String(targetProjectId)
        });
        await db.query(
          `UPDATE knowledge_import_jobs SET state = 'rolled_back', error_details_json = ? WHERE operation_id = ?`,
          [JSON.stringify({ error: 'Unauthorized destination project' }), operationId]
        );
        removeFileIfExists(journalPath);
        removeDirIfExists(stageDir);

        const err = new Error('You do not have permission to import into the requested destination project.');
        err.code = 'PROJECT_ACCESS_DENIED';
        err.status = 403;
        throw err;
      }

      const hasWrite = await Project.hasWriteAccess(targetProjectId, userId);
      if (!hasWrite) {
        await SecurityService.logSecurityEvent({
          userId,
          eventType: 'EXCHANGE_COMMIT_FORBIDDEN_PROJECT',
          severity: 'warning',
          ip,
          targetType: 'project',
          targetId: String(targetProjectId)
        });
        await db.query(
          `UPDATE knowledge_import_jobs SET state = 'rolled_back', error_details_json = ? WHERE operation_id = ?`,
          [JSON.stringify({ error: 'Write permission required to import into project' }), operationId]
        );
        removeFileIfExists(journalPath);
        removeDirIfExists(stageDir);

        const err = new Error('You do not have write permission to import into the requested destination project. Only owners and editors can import.');
        err.code = 'PROJECT_FORBIDDEN';
        err.status = 403;
        throw err;
      }

      const pRows = await db.query('SELECT title FROM projects WHERE id = ? LIMIT 1', [targetProjectId]);
      if (pRows && pRows[0]) {
        targetProjectTitle = pRows[0].title;
      }
    } else {
      // Disambiguate project name if user already has an active project with this title
      const existingSameTitle = await db.query(
        'SELECT id FROM projects WHERE user_id = ? AND title = ? LIMIT 1',
        [userId, targetProjectTitle]
      );
      if (existingSameTitle && existingSameTitle.length > 0 && conflictResolution === 'disambiguate') {
        const dStr = new Date().toISOString().slice(0, 10);
        targetProjectTitle = `${targetProjectTitle} (Imported ${dStr})`;
      }
    }

    // Read manifest & core files from staging
    const manifestRaw = fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const foldersRaw = fs.readFileSync(path.join(stageDir, 'folders.json'), 'utf8');
    const foldersDoc = JSON.parse(foldersRaw);
    const sourcesRaw = fs.readFileSync(path.join(stageDir, 'sources', 'index.json'), 'utf8');
    const sourcesDoc = JSON.parse(sourcesRaw);
    const linksRaw = fs.readFileSync(path.join(stageDir, 'relationships', 'links.json'), 'utf8');
    const linksDoc = JSON.parse(linksRaw);

    let tasksDoc = null;
    const tasksPath = path.join(stageDir, 'optional', 'tasks.json');
    if (fs.existsSync(tasksPath)) {
      try {
        tasksDoc = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      } catch (_) {}
    }

    let boardDoc = null;
    const boardPath = path.join(stageDir, 'optional', 'spatial-board.json');
    if (fs.existsSync(boardPath)) {
      try {
        boardDoc = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
      } catch (_) {}
    }

    // ------------------------------------------------------------------------
    // Step 4: Asset Promotion (Phase 1 / committing_files)
    // ------------------------------------------------------------------------
    journalData.state = JOB_STATES.COMMITTING_FILES;
    await writeAheadJournal(journalPath, journalData);
    await db.query(
      `UPDATE knowledge_import_jobs SET state = 'committing_files', heartbeat_at = NOW() WHERE operation_id = ?`,
      [operationId]
    );

    const promotedAssets = [];
    const packageAssetMap = new Map(); // packageAssetId -> promoted asset object

    if (manifest.entities && Array.isArray(manifest.entities.assets)) {
      for (const assetMeta of manifest.entities.assets) {
        const assetRelPath = assetMeta.path || `assets/${assetMeta.filename}`;
        const cleanRelPath = assetRelPath.replace(/^\/+/, '');
        const assetStagePath = path.resolve(stageDir, cleanRelPath);

        if (!fs.existsSync(assetStagePath)) {
          throw new Error(`Package asset declared in manifest is missing from staging: ${assetRelPath}`);
        }

        const assetBuffer = fs.readFileSync(assetStagePath);
        const actualSha = crypto.createHash('sha256').update(assetBuffer).digest('hex');
        if (assetMeta.sha256 && assetMeta.sha256.toLowerCase() !== actualSha.toLowerCase()) {
          throw new Error(`Asset SHA-256 hash mismatch for ${assetMeta.filename}`);
        }

        // Validate magic bytes & security
        const validation = SecurityService.validateUploadedFile(
          assetStagePath,
          assetMeta.filename,
          assetMeta.mime_type
        );
        if (!validation.valid) {
          throw new Error(`Asset security validation failed for ${assetMeta.filename}: ${validation.reason || validation.code}`);
        }

        const safeExt = path.extname(assetMeta.filename).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
        const uniqueToken = crypto.randomBytes(8).toString('hex');
        const promotedFilename = `fkp_${operationId}_${uniqueToken}${safeExt}`;
        const promotedFilePath = path.resolve(VAULT_UPLOADS_DIR, promotedFilename);

        // Pre-record intended promotion in journal before copy
        journalData.promoted_files.push(promotedFilePath);
        await writeAheadJournal(journalPath, journalData);

        // Copy asset into permanent storage
        fs.copyFileSync(assetStagePath, promotedFilePath);

        const assetRecord = {
          package_id: assetMeta.id,
          original_filename: assetMeta.filename,
          promoted_filename: promotedFilename,
          promoted_path: promotedFilePath,
          relative_url: `/uploads/vault/${promotedFilename}`,
          mime_type: assetMeta.mime_type || validation.mimeType,
          file_size: assetBuffer.length,
          sha256: actualSha,
          title: assetMeta.title || assetMeta.filename
        };

        promotedAssets.push(assetRecord);
        packageAssetMap.set(assetMeta.id, assetRecord);
        packageAssetMap.set(assetMeta.filename, assetRecord);
        packageAssetMap.set(`assets/${assetMeta.filename}`, assetRecord);
        packageAssetMap.set(`../assets/${assetMeta.filename}`, assetRecord);
      }
    }

    await db.query(
      `UPDATE knowledge_import_jobs
       SET promoted_files_json = ?, heartbeat_at = NOW()
       WHERE operation_id = ?`,
      [JSON.stringify(promotedAssets), operationId]
    );

    // ------------------------------------------------------------------------
    // Step 5: Transactional Database Commit (Phase 2 / committing_db)
    // ------------------------------------------------------------------------
    journalData.state = JOB_STATES.COMMITTING_DB;
    await writeAheadJournal(journalPath, journalData);
    await db.query(
      `UPDATE knowledge_import_jobs SET state = 'committing_db', heartbeat_at = NOW() WHERE operation_id = ?`,
      [operationId]
    );

    const conn = await db.getConnection();
    await conn.beginTransaction();

    const packageIdMap = new Map(); // packageId -> { entityType, dbId, finalTitle }
    const createdSummary = {
      project_id: null,
      folder_count: 0,
      note_count: 0,
      source_count: 0,
      excerpt_count: 0,
      relationship_count: 0,
      asset_count: promotedAssets.length,
      task_count: 0,
      board_item_count: 0,
      board_connection_count: 0
    };

    try {
      // ----------------------------------------------------------------------
      // PASS 1 — Create and Map Canonical Entities
      // ----------------------------------------------------------------------

      // 1. Project
      if (!targetProjectId) {
        const projInsert = await conn.query(
          `INSERT INTO projects (user_id, title, description, color, icon, status)
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [
            userId,
            targetProjectTitle,
            manifest.project.summary || 'Imported Knowledge Package',
            manifest.project.color || '#6366f1',
            manifest.project.icon || 'layers'
          ]
        );
        targetProjectId = projInsert.insertId || (projInsert[0] && projInsert[0].insertId);

        // Project Owner Membership
        await conn.query(
          `INSERT INTO project_members (project_id, user_id, role)
           VALUES (?, ?, 'owner')`,
          [targetProjectId, userId]
        );

        // Project Canonical Entity
        await conn.query(
          `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
           VALUES (UUID(), 'project', ?, ?, ?, ?, ?)`,
          [targetProjectId, userId, targetProjectId, targetProjectTitle, manifest.project.summary || '']
        );
      }
      createdSummary.project_id = targetProjectId;
      packageIdMap.set(manifest.project.id, {
        entityType: 'project',
        dbId: targetProjectId,
        finalTitle: targetProjectTitle
      });

      // 2. Folders (Topologically sorted and project-scoped)
      const sortedFolders = topologicalSortFolders(foldersDoc.folders || []);
      for (const f of sortedFolders) {
        const parentDbId = f.parent_id && packageIdMap.has(f.parent_id)
          ? packageIdMap.get(f.parent_id).dbId
          : null;

        const resolved = await KnowledgeExchangeService.resolveFolderConflict(conn, {
          userId,
          targetProjectId,
          parentDbId,
          folderName: f.name,
          conflictResolution,
          sortOrder: f.sort_order || 0
        });

        packageIdMap.set(f.id, {
          entityType: 'folder',
          dbId: resolved.folderDbId,
          finalTitle: resolved.finalFolderName
        });
        if (resolved.created) {
          createdSummary.folder_count += 1;
        }
      }

      // 3. Research Sources (research_documents)
      if (sourcesDoc.sources && Array.isArray(sourcesDoc.sources)) {
        for (const s of sourcesDoc.sources) {
          const contentRelPath = s.content_file || `sources/${s.id}.md`;
          const cleanRel = contentRelPath.replace(/^\/+/, '');
          const srcStagePath = path.resolve(stageDir, cleanRel);
          let rawSourceMd = '';
          const hasPhysicalFile = fs.existsSync(srcStagePath);
          if (hasPhysicalFile) {
            rawSourceMd = fs.readFileSync(srcStagePath, 'utf8');
          }

          // Prepend structured provenance header to content_text
          const provHeader = [
            `# ${s.title}`,
            `**Source Type**: ${s.source_type || 'unspecified'} | **Verification**: ${s.verification_status || 'unverified'}`,
            s.authors && s.authors.length ? `**Authors**: ${s.authors.join(', ')}` : null,
            s.publication_date ? `**Published**: ${s.publication_date}` : null,
            s.source_url ? `**URL**: ${s.source_url}` : null,
            s.summary ? `\n> ${s.summary}\n` : '\n',
            '---\n'
          ].filter(Boolean).join('\n');

          const finalSourceText = `${provHeader}\n${rawSourceMd}`.trim();
          const cleanSourceUrl = s.source_url ? s.source_url.trim().slice(0, 1000) : null;
          const tagsJson = JSON.stringify(s.tags || []);

          const originalFilename = hasPhysicalFile ? path.basename(contentRelPath) : (s.original_filename || null);
          const fileName = hasPhysicalFile ? path.basename(contentRelPath) : null;
          const filePath = hasPhysicalFile ? `/sources/${path.basename(contentRelPath)}` : null;
          const fileType = hasPhysicalFile ? (s.file_type || 'md') : (s.file_type || null);
          const fileSize = hasPhysicalFile ? Buffer.byteLength(finalSourceText, 'utf8') : 0;

          const srcIns = await conn.query(
            `INSERT INTO research_documents (
              user_id, project_id, title, original_filename, file_name, file_path,
              file_type, file_size, content_text, summary, source_url, tags_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              targetProjectId,
              s.title.trim(),
              originalFilename,
              fileName,
              filePath,
              fileType,
              fileSize,
              finalSourceText,
              s.summary || null,
              cleanSourceUrl,
              tagsJson
            ]
          );
          const srcDbId = srcIns.insertId || (srcIns[0] && srcIns[0].insertId);
          packageIdMap.set(s.id, {
            entityType: 'research',
            dbId: srcDbId,
            finalTitle: s.title.trim()
          });
          createdSummary.source_count += 1;

          // Register Research Entity & Project Entity
          await conn.query(
            `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
             VALUES (UUID(), 'research', ?, ?, ?, ?, ?)`,
            [srcDbId, userId, targetProjectId, s.title.trim(), `${s.title} ${s.summary || ''}`]
          );
          await conn.query(
            `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
             VALUES (?, 'research', ?, 'contributor', ?)`,
            [targetProjectId, srcDbId, userId]
          );

          // 4. Excerpts (research_excerpts)
          if (s.excerpts && Array.isArray(s.excerpts)) {
            for (const exc of s.excerpts) {
              const excIns = await conn.query(
                `INSERT INTO research_excerpts (
                  research_id, user_id, project_id, quoted_text, annotation, location_anchor, color
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  srcDbId,
                  userId,
                  targetProjectId,
                  exc.quoted_text,
                  exc.annotation || null,
                  exc.location_anchor || 'page-1',
                  exc.color || '#fef08a'
                ]
              );
              const excDbId = excIns.insertId || (excIns[0] && excIns[0].insertId);
              packageIdMap.set(exc.id, {
                entityType: 'excerpt',
                dbId: excDbId,
                finalTitle: exc.quoted_text.slice(0, 80)
              });
              createdSummary.excerpt_count += 1;

              // Register Excerpt Entity
              await conn.query(
                `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
                 VALUES (UUID(), 'excerpt', ?, ?, ?, ?, ?)`,
                [excDbId, userId, targetProjectId, exc.quoted_text.slice(0, 80), `${exc.quoted_text} ${exc.annotation || ''}`]
              );
              await conn.query(
                `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
                 VALUES (?, 'excerpt', ?, 'contributor', ?)`,
                [targetProjectId, excDbId, userId]
              );
            }
          }
        }
      }

      // 5. Pinned Project Overview Note (from project/overview.md)
      const overviewPath = path.join(stageDir, 'project', 'overview.md');
      let overviewContent = '';
      if (fs.existsSync(overviewPath)) {
        overviewContent = fs.readFileSync(overviewPath, 'utf8');
      } else {
        overviewContent = `# ${targetProjectTitle}\n\n${manifest.project.summary || ''}`;
      }

      const isExistingProj = Boolean(destinationProjectId);
      const overviewTitle = isExistingProj
        ? `${manifest.project.title || targetProjectTitle} — Overview (Imported ${new Date().toISOString().slice(0, 10)})`
        : `${targetProjectTitle} — Project Overview`;
      const isPinned = isExistingProj ? 0 : 1;

      const ovIns = await conn.query(
        `INSERT INTO notes (user_id, project_id, folder_id, title, content, is_pinned, word_count)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        [userId, targetProjectId, overviewTitle, overviewContent, isPinned, countWords(overviewContent)]
      );
      const overviewNoteId = ovIns.insertId || (ovIns[0] && ovIns[0].insertId);
      packageIdMap.set('__project_overview__', {
        entityType: 'note',
        dbId: overviewNoteId,
        finalTitle: overviewTitle
      });

      await conn.query(
        `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
         VALUES (UUID(), 'note', ?, ?, ?, ?, ?)`,
        [overviewNoteId, userId, targetProjectId, overviewTitle, overviewContent]
      );
      await conn.query(
        `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
         VALUES (?, 'note', ?, 'contributor', ?)`,
        [targetProjectId, overviewNoteId, userId]
      );
      await conn.query(
        `INSERT INTO note_versions (note_id, user_id, created_by, title, content_markdown, content, version_number)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [overviewNoteId, userId, userId, overviewTitle, overviewContent, overviewContent]
      );

      // 6. Notes (manifest.entities.notes)
      const importedNotes = [];
      if (manifest.entities && Array.isArray(manifest.entities.notes)) {
        for (const noteMeta of manifest.entities.notes) {
          const noteRelPath = noteMeta.file || noteMeta.path || (noteMeta.filename ? `notes/${noteMeta.filename}` : `notes/${noteMeta.id}.md`);
          const cleanNoteRel = noteRelPath.replace(/^\/+/, '');
          const noteStagePath = path.resolve(stageDir, cleanNoteRel);

          let rawNoteMd = '';
          if (fs.existsSync(noteStagePath)) {
            rawNoteMd = fs.readFileSync(noteStagePath, 'utf8');
          }

          // Strip YAML frontmatter from Note body
          const { frontmatter, body: cleanNoteMd } = stripYamlFrontmatter(rawNoteMd);

          let finalNoteTitle = (noteMeta.title || frontmatter.title || 'Untitled Note').trim();
          // Title disambiguation if user already has an active note with this exact title in destination project
          const existingNoteSameTitle = await conn.query(
            'SELECT id FROM notes WHERE user_id = ? AND (project_id = ? OR project_id IS NULL) AND title = ? AND deleted_at IS NULL LIMIT 1',
            [userId, targetProjectId, finalNoteTitle]
          );
          if (existingNoteSameTitle && existingNoteSameTitle.length > 0 && conflictResolution === 'disambiguate') {
            finalNoteTitle = `${finalNoteTitle} (Imported)`;
          }

          const targetFolderDbId = noteMeta.folder_id && packageIdMap.has(noteMeta.folder_id)
            ? packageIdMap.get(noteMeta.folder_id).dbId
            : null;

          const nIns = await conn.query(
            `INSERT INTO notes (user_id, project_id, folder_id, title, content, is_pinned, word_count)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              targetProjectId,
              targetFolderDbId,
              finalNoteTitle,
              cleanNoteMd,
              noteMeta.is_pinned ? 1 : 0,
              countWords(cleanNoteMd)
            ]
          );
          const noteDbId = nIns.insertId || (nIns[0] && nIns[0].insertId);
          packageIdMap.set(noteMeta.id, {
            entityType: 'note',
            dbId: noteDbId,
            finalTitle: finalNoteTitle
          });
          createdSummary.note_count += 1;

          // Register Note in canonical entities & project_entities
          await conn.query(
            `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
             VALUES (UUID(), 'note', ?, ?, ?, ?, ?)`,
            [noteDbId, userId, targetProjectId, finalNoteTitle, cleanNoteMd]
          );
          await conn.query(
            `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
             VALUES (?, 'note', ?, 'contributor', ?)`,
            [targetProjectId, noteDbId, userId]
          );
          await conn.query(
            `INSERT INTO note_versions (note_id, user_id, created_by, title, content_markdown, content, version_number)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [noteDbId, userId, userId, finalNoteTitle, cleanNoteMd, cleanNoteMd]
          );

          // Combined Tags from metadata and frontmatter
          const combinedTags = new Set();
          if (Array.isArray(noteMeta.tags)) {
            noteMeta.tags.forEach(t => combinedTags.add(String(t).trim()));
          }
          if (Array.isArray(frontmatter.tags)) {
            frontmatter.tags.forEach(t => combinedTags.add(String(t).trim()));
          }

          for (const cleanTag of combinedTags) {
            if (!cleanTag) continue;
            let tRows = await conn.query(
              'SELECT id FROM note_tags WHERE user_id = ? AND name = ? LIMIT 1',
              [userId, cleanTag]
            );
            let tagId;
            if (tRows && tRows.length > 0) {
              tagId = tRows[0].id;
            } else {
              const tIns = await conn.query(
                'INSERT INTO note_tags (user_id, name) VALUES (?, ?)',
                [userId, cleanTag]
              );
              tagId = tIns.insertId || (tIns[0] && tIns[0].insertId);
            }
            await conn.query(
              'INSERT IGNORE INTO note_tag_map (note_id, tag_id) VALUES (?, ?)',
              [noteDbId, tagId]
            );
          }

          importedNotes.push({
            packageId: noteMeta.id,
            dbId: noteDbId,
            rawContent: cleanNoteMd,
            title: finalNoteTitle
          });
        }
      }

      // 7. Optional Tasks
      if (tasksDoc && tasksDoc.tasks && Array.isArray(tasksDoc.tasks)) {
        for (const t of tasksDoc.tasks) {
          const validStatuses = ['planned', 'in_progress', 'done'];
          const finalStatus = validStatuses.includes(t.status) ? t.status : 'planned';
          const validPriorities = ['low', 'medium', 'high', 'urgent'];
          const finalPriority = validPriorities.includes(t.priority) ? t.priority : 'medium';
          const dueDate = t.due_date ? String(t.due_date).slice(0, 10) : null;

          const tIns = await conn.query(
            `INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_date, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              targetProjectId,
              t.title.trim(),
              t.description || null,
              finalStatus,
              finalPriority,
              dueDate,
              t.sort_order || 0
            ]
          );
          const taskDbId = tIns.insertId || (tIns[0] && tIns[0].insertId);
          packageIdMap.set(t.id, {
            entityType: 'task',
            dbId: taskDbId,
            finalTitle: t.title.trim()
          });
          createdSummary.task_count += 1;

          await conn.query(
            `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
             VALUES (UUID(), 'task', ?, ?, ?, ?, ?)`,
            [taskDbId, userId, targetProjectId, t.title.trim(), `${t.title} ${t.description || ''}`]
          );
          await conn.query(
            `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
             VALUES (?, 'task', ?, 'contributor', ?)`,
            [targetProjectId, taskDbId, userId]
          );

          // Task relationships to related notes/sources
          if (t.related_entity_ids && Array.isArray(t.related_entity_ids)) {
            for (const relId of t.related_entity_ids) {
              if (packageIdMap.has(relId)) {
                const targetEntry = packageIdMap.get(relId);
                await conn.query(
                  `INSERT INTO entity_links (
                    user_id, source_type, source_id, target_type, target_id,
                    link_type, origin, is_confirmed, created_at, updated_at
                  ) VALUES (?, 'task', ?, ?, ?, 'relates_to', 'task_sync', 1, NOW(), NOW())
                  ON DUPLICATE KEY UPDATE is_confirmed = 1, updated_at = NOW()`,
                  [userId, taskDbId, targetEntry.entityType, targetEntry.dbId]
                );
              }
            }
          }
        }
      }

      // 8. Register Promoted Assets in file_uploads
      for (const asset of promotedAssets) {
        // Link to first referencing Note or Overview Note
        const firstNoteId = importedNotes.length > 0 ? importedNotes[0].dbId : overviewNoteId;
        await conn.query(
          `INSERT INTO file_uploads (
            user_id, project_id, entity_type, entity_id, filename,
            original_name, file_path, mime_type, file_size, sha256_hash
          ) VALUES (?, ?, 'note', ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            targetProjectId,
            firstNoteId,
            asset.promoted_filename,
            asset.original_filename,
            asset.relative_url,
            asset.mime_type,
            asset.file_size,
            asset.sha256
          ]
        );
      }

      // ----------------------------------------------------------------------
      // PASS 2 — Resolve Relationships, Markdown Normalization & Board
      // ----------------------------------------------------------------------

      // 1. Markdown Normalization & WikiLink rewriting across all notes
      const allNotesToNormalize = [
        { dbId: overviewNoteId, rawContent: overviewContent },
        ...importedNotes
      ];

      for (const item of allNotesToNormalize) {
        let content = item.rawContent;

        // A. Rewrite relative asset links to promoted /uploads/vault/ URLs
        for (const asset of promotedAssets) {
          const variants = [
            `../assets/${asset.original_filename}`,
            `assets/${asset.original_filename}`,
            `fkf-asset://${asset.package_id}`
          ];
          for (const variant of variants) {
            content = content.split(variant).join(asset.relative_url);
          }
        }

        // B. Rewrite [[fkf:<package-id>|Label]] -> [[note:<dbId>|Label]]
        const fkfWikiRegex = /\[\[fkf:([a-zA-Z0-9_-]+)(?:\|(.*?))?\]\]/g;
        content = content.replace(fkfWikiRegex, (match, pkgId, label) => {
          if (packageIdMap.has(pkgId)) {
            const entry = packageIdMap.get(pkgId);
            if (entry.entityType === 'note') {
              const displayLabel = label ? label.trim() : entry.finalTitle;
              return `[[note:${entry.dbId}|${displayLabel}]]`;
            }
          }
          return label ? `[[${label.trim()}]]` : match;
        });

        // Compute note attachment JSON if assets referenced
        const noteAttachments = [];
        for (const asset of promotedAssets) {
          if (content.includes(asset.relative_url)) {
            noteAttachments.push({
              filename: asset.promoted_filename,
              original_name: asset.original_filename,
              url: asset.relative_url,
              mime_type: asset.mime_type,
              size: asset.file_size
            });
          }
        }
        const attachmentsJson = noteAttachments.length ? JSON.stringify(noteAttachments) : null;

        await conn.query(
          `UPDATE notes
           SET content = ?, word_count = ?, attachments_json = ?
           WHERE id = ?`,
          [content, countWords(content), attachmentsJson, item.dbId]
        );
        await conn.query(
          `UPDATE entities
           SET search_text = ?
           WHERE entity_type = 'note' AND entity_id = ?`,
          [content, item.dbId]
        );

        // Sync WikiLinks into note_links & entity_links
        await Note.syncWikiLinks(item.dbId, userId, content, conn);
      }

      // 2. Semantic Links (relationships/links.json)
      const relResult = await KnowledgeExchangeService.importRelationships(conn, {
        userId,
        links: linksDoc.links,
        packageIdMap
      });
      createdSummary.relationship_count += relResult.relationshipCount;

      // 3. Optional Spatial Board Projections
      if (boardDoc && boardDoc.board) {
        const b = boardDoc.board;
        // Check if project already has a board
        const existingBoards = await conn.query(
          'SELECT id FROM boards WHERE project_id = ? LIMIT 1',
          [targetProjectId]
        );
        let boardDbId;
        if (existingBoards && existingBoards.length > 0) {
          boardDbId = existingBoards[0].id;
          await conn.query(
            `UPDATE boards SET title = ?, description = ? WHERE id = ?`,
            [b.title.trim(), b.description || 'Spatial workspace board', boardDbId]
          );
        } else {
          const bIns = await conn.query(
            `INSERT INTO boards (project_id, user_id, title, description, zoom_level, viewport_x, viewport_y, grid_size)
             VALUES (?, ?, ?, ?, 1.0, 0, 0, 20)`,
            [targetProjectId, userId, b.title.trim(), b.description || 'Spatial workspace board']
          );
          boardDbId = bIns.insertId || (bIns[0] && bIns[0].insertId);
        }
        packageIdMap.set(b.id, { entityType: 'board', dbId: boardDbId, finalTitle: b.title.trim() });

        // Register board in canonical entities & project_entities
        await conn.query(
          `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
           VALUES (UUID(), 'board', ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title = VALUES(title), search_text = VALUES(search_text), updated_at = NOW()`,
          [boardDbId, userId, targetProjectId, b.title.trim(), `${b.title} ${b.description || ''}`]
        );
        await conn.query(
          `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
           VALUES (?, 'board', ?, 'contributor', ?)
           ON DUPLICATE KEY UPDATE access_role = VALUES(access_role)`,
          [targetProjectId, boardDbId, userId]
        );

        // Groups
        if (b.groups && Array.isArray(b.groups)) {
          for (const g of b.groups) {
            const gIns = await conn.query(
              `INSERT INTO board_groups (board_id, title, color, position_x, position_y, width, height)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [boardDbId, g.title.trim(), g.color || '#6366f1', g.position_x || 0, g.position_y || 0, g.width || 300, g.height || 300]
            );
            const groupDbId = gIns.insertId || (gIns[0] && gIns[0].insertId);
            packageIdMap.set(g.id, { entityType: 'board_group', dbId: groupDbId });
          }
        }

        // Items (projections of canonical Notes and Tasks)
        if (b.items && Array.isArray(b.items)) {
          for (const item of b.items) {
            let refType = null;
            let refId = null;

            if (item.reference_package_id && packageIdMap.has(item.reference_package_id)) {
              const mapped = packageIdMap.get(item.reference_package_id);
              refType = mapped.entityType;
              refId = mapped.dbId;
            }

            const groupId = item.group_id && packageIdMap.has(item.group_id)
              ? packageIdMap.get(item.group_id).dbId
              : null;

            const itemType = item.item_type || (refType === 'note' ? 'note' : refType === 'task' ? 'task' : 'idea');
            const validItemTypes = ['note', 'idea', 'image', 'link', 'research_ref', 'task', 'document'];
            const finalItemType = validItemTypes.includes(itemType) ? itemType : 'idea';

            let cardTitle = item.title || 'Board Item';
            let cardContent = item.content || null;

            if (refType === 'note' && refId) {
              // Board card is a projection: title and plain-text excerpt derived from canonical Note
              const mappedNote = importedNotes.find(n => n.dbId === refId);
              let noteBody = mappedNote ? mappedNote.rawContent : '';
              if (!noteBody) {
                const [nRow] = await conn.query('SELECT title, content FROM notes WHERE id = ? LIMIT 1', [refId]);
                if (nRow && nRow.length > 0) {
                  noteBody = nRow[0].content || '';
                  if (!item.title) cardTitle = nRow[0].title;
                }
              } else if (!item.title && mappedNote.title) {
                cardTitle = mappedNote.title;
              }
              cardContent = derivePlaintextExcerpt(noteBody, 150);
            }

            const bitmIns = await conn.query(
              `INSERT INTO board_items (
                board_id, user_id, item_type, reference_type, reference_id,
                title, content, position_x, position_y, width, height, color, z_index, group_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
              [
                boardDbId,
                userId,
                finalItemType,
                refType,
                refId,
                cardTitle,
                cardContent,
                item.position_x || 0,
                item.position_y || 0,
                item.width || 250,
                item.height || 150,
                item.color || '#1e293b',
                groupId
              ]
            );
            const itemDbId = bitmIns.insertId || (bitmIns[0] && bitmIns[0].insertId);
            packageIdMap.set(item.id, { entityType: 'board_item', dbId: itemDbId });
            createdSummary.board_item_count += 1;
          }
        }

        // Visual Connections
        if (b.connections && Array.isArray(b.connections)) {
          for (const wire of b.connections) {
            const src = packageIdMap.get(wire.source_item_id);
            const tgt = packageIdMap.get(wire.target_item_id);
            if (src && tgt) {
              await conn.query(
                `INSERT INTO board_item_connections (board_id, source_item_id, target_item_id, connection_type, label)
                 VALUES (?, ?, ?, ?, ?)`,
                [boardDbId, src.dbId, tgt.dbId, wire.connection_type || 'flow', wire.label || null]
              );
              createdSummary.board_connection_count += 1;
            }
          }
        }
      }

      // 4. Update job to COMMITTED atomically in the same transaction
      await conn.query(
        `UPDATE knowledge_import_jobs
         SET state = 'committed', created_project_id = ?, summary_json = ?, completed_at = NOW()
         WHERE operation_id = ?`,
        [targetProjectId, JSON.stringify(createdSummary), operationId]
      );

      // Commit transaction
      await conn.commit();

      // Update journal to committed
      journalData.state = JOB_STATES.COMMITTED;
      journalData.created_project_id = targetProjectId;
      await writeAheadJournal(journalPath, journalData);

      // Audit success
      await SecurityService.logSecurityEvent({
        userId,
        eventType: 'EXCHANGE_COMMIT_SUCCESS',
        severity: 'info',
        ip,
        targetType: 'project',
        targetId: String(targetProjectId),
        details: { operationId, counts: createdSummary }
      });

      // Cleanup staging directory and journal
      removeDirIfExists(stageDir);
      removeFileIfExists(journalPath);

      return {
        success: true,
        operation_id: operationId,
        state: JOB_STATES.COMMITTED,
        created_project_id: targetProjectId,
        project: {
          id: targetProjectId,
          title: targetProjectTitle
        },
        counts: createdSummary
      };
    } catch (err) {
      // Rollback database transaction
      try {
        await conn.rollback();
      } catch (_) {}

      // Mark job as rollback_pending
      try {
        await db.query(
          `UPDATE knowledge_import_jobs
           SET state = 'rollback_pending', error_details_json = ?
           WHERE operation_id = ?`,
          [JSON.stringify({ error: err.message, stack: err.stack }), operationId]
        );
      } catch (_) {}

      // Rollback promoted files: delete newly promoted files not referenced in database
      await KnowledgeExchangeService.rollbackPromotedFiles(promotedAssets, operationId);

      // Mark job as rolled_back
      try {
        await db.query(
          `UPDATE knowledge_import_jobs SET state = 'rolled_back' WHERE operation_id = ?`,
          [operationId]
        );
      } catch (_) {}

      // Clean staging and journal
      removeDirIfExists(stageDir);
      removeFileIfExists(journalPath);

      await SecurityService.logSecurityEvent({
        userId,
        eventType: 'EXCHANGE_COMMIT_FAILED',
        severity: 'high',
        ip,
        targetType: 'exchange_package',
        details: { operationId, error: err.message }
      });

      throw err;
    } finally {
      try {
        conn.release();
      } catch (_) {}
    }
  }

  /**
   * Safely roll back promoted files by checking zero matching file_uploads rows
   */
  static async rollbackPromotedFiles(promotedFilesList, operationId) {
    if (!promotedFilesList || !Array.isArray(promotedFilesList)) return;
    const opPrefix = `fkp_${operationId}_`;

    for (const asset of promotedFilesList) {
      const filePath = typeof asset === 'string' ? asset : (asset.promoted_path || '');
      const filename = path.basename(filePath);

      // Security check: Must start with fkp_<opId>_
      if (!filename.startsWith(opPrefix)) continue;

      try {
        // Verify zero database records in file_uploads before unlinking
        const rows = await db.query(
          'SELECT id FROM file_uploads WHERE filename = ? LIMIT 1',
          [filename]
        );
        if (!rows || rows.length === 0) {
          removeFileIfExists(filePath);
        }
      } catch (_) {
        // Fallback: unlink only if strict prefix matches
        removeFileIfExists(filePath);
      }
    }
  }

  /**
   * Background Crash-Recovery Reconciler for interrupted jobs
   */
  static async reconcileUnfinishedJobs(maxAgeMs = 900000) {
    let recoveredCount = 0;
    try {
      const unfinishedJobs = await db.query(
        `SELECT * FROM knowledge_import_jobs
         WHERE state IN ('committing_files', 'committing_db', 'rollback_pending', 'validating', 'staged')
           AND (heartbeat_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE) OR state = 'rollback_pending')`
      );

      if (!unfinishedJobs || !Array.isArray(unfinishedJobs)) return 0;

      for (const job of unfinishedJobs) {
        const opId = job.operation_id;
        const promotedFiles = job.promoted_files_json
          ? (typeof job.promoted_files_json === 'string' ? JSON.parse(job.promoted_files_json) : job.promoted_files_json)
          : [];

        // Roll back uncommitted promoted files
        await KnowledgeExchangeService.rollbackPromotedFiles(promotedFiles, opId);

        // Remove staging directory
        if (job.staging_dir) {
          removeDirIfExists(job.staging_dir);
        }

        // Remove journal
        if (job.journal_path) {
          removeFileIfExists(job.journal_path);
        }

        await db.query(
          `UPDATE knowledge_import_jobs
           SET state = 'rolled_back', error_details_json = ?
           WHERE id = ?`,
          [JSON.stringify({ reason: 'Reconciled stale or interrupted import job' }), job.id]
        );
        recoveredCount += 1;
      }
    } catch (recErr) {
      console.warn('[KnowledgeExchange] Crash reconciler warning:', recErr.message);
      if (process.env.NODE_ENV === 'production') {
        throw recErr;
      }
    }

    return recoveredCount;
  }
}

module.exports = KnowledgeExchangeService;
