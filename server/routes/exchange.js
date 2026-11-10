const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../config/database');
const Project = require('../models/Project');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');
const {
  UPLOAD_TEMP_DIR,
  MAX_COMPRESSED_ARCHIVE_BYTES,
  inspectKnowledgePackage
} = require('../services/packageInspectionService');
const KnowledgeExchangeService = require('../services/knowledgeExchangeService');

const router = express.Router();

if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
      fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
    }
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '.zip';
    const token = crypto.randomBytes(8).toString('hex');
    cb(null, `fkp_inspect_upload_${Date.now()}_${token}${safeExt}`);
  }
});

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_COMPRESSED_ARCHIVE_BYTES,
    files: 1
  }
});

// Fixed, allowlisted specification and reference resources for download
const ALLOWED_RESOURCES = {
  'research-spec': {
    filename: 'FLOWDEN_RESEARCH_SPEC.md',
    mimeType: 'text/markdown; charset=utf-8',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'FLOWDEN_RESEARCH_SPEC.md')
  },
  'package-schema': {
    filename: 'flowden-package.schema.json',
    mimeType: 'application/schema+json; charset=utf-8',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'flowden-package.schema.json')
  },
  'schema-v2': {
    filename: 'flowden-knowledge-format-v2.schema.json',
    mimeType: 'application/schema+json; charset=utf-8',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'flowden-knowledge-format-v2.schema.json')
  },
  'flowden-knowledge-format-v2.schema.json': {
    filename: 'flowden-knowledge-format-v2.schema.json',
    mimeType: 'application/schema+json; charset=utf-8',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'flowden-knowledge-format-v2.schema.json')
  },
  'flowden-knowledge-format.schema.json': {
    filename: 'flowden-knowledge-format-v2.schema.json',
    mimeType: 'application/schema+json; charset=utf-8',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'flowden-knowledge-format-v2.schema.json')
  },
  'reference-package': {
    filename: 'flowden-reference-package.flowden.zip',
    mimeType: 'application/zip',
    filePath: path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'examples', 'flowden-reference-package.flowden.zip')
  }
};

/**
 * GET /api/v1/exchange/resources/:resourceKey
 * Serves fixed, allowlisted specification artifacts and reference archives.
 * Valid keys: 'research-spec', 'package-schema', 'schema-v2', 'reference-package'.
 */
router.get('/resources/:resourceKey', (req, res) => {
  const resource = ALLOWED_RESOURCES[req.params.resourceKey];
  if (!resource || !fs.existsSync(resource.filePath)) {
    return res.status(404).json({ error: 'Requested specification resource not found.' });
  }

  res.setHeader('Content-Type', resource.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${resource.filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(resource.filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read resource file.' });
    }
  });
  stream.pipe(res);
});

// All stateful / mutation Knowledge Exchange endpoints require authentication
router.use(authenticateToken);

/**
 * POST /api/v1/exchange/inspect
 * Safely inspects and validates a .flowden.zip package, computes SHA-256,
 * stores the validated archive in server staging, and issues an expiring inspection token.
 */
router.post('/inspect', (req, res) => {
  const rate = SecurityService.checkRateLimit('exchange_inspect', String(req.user.id), 100, 60 * 1000);
  if (!rate.allowed) {
    return res.status(429).json({
      valid: false,
      error: 'Inspection rate limit exceeded. Please wait before inspecting more packages.',
      retryAfterSeconds: rate.retryAfterSeconds
    });
  }

  uploadMiddleware.single('file')(req, res, async (uploadErr) => {
    const uploadedPath = req.file ? req.file.path : null;

    try {
      if (uploadErr) {
        await SecurityService.logSecurityEvent({
          userId: req.user ? req.user.id : null,
          eventType: 'EXCHANGE_UPLOAD_REJECTED',
          severity: 'warning',
          ip: req.ip,
          targetType: 'exchange_package',
          details: { error: uploadErr.message, code: uploadErr.code }
        });

        const isSizeErr = uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE';
        return res.status(isSizeErr ? 413 : 400).json({
          valid: false,
          error: isSizeErr
            ? `Compressed package exceeds maximum allowed upload limit (${Math.round(MAX_COMPRESSED_ARCHIVE_BYTES / (1024 * 1024))} MB).`
            : (uploadErr.message || 'Package upload failed.'),
          errors: [{
            code: isSizeErr ? 'ARCHIVE_COMPRESSED_TOO_LARGE' : 'UPLOAD_ERROR',
            message: uploadErr.message
          }]
        });
      }

      if (!req.file || !uploadedPath) {
        return res.status(400).json({
          valid: false,
          error: 'No package archive file uploaded. Provide a .flowden.zip file in the "file" form field.',
          errors: [{
            code: 'MISSING_UPLOAD_FILE',
            message: 'No package archive file uploaded.'
          }]
        });
      }

      // Compute SHA-256 of uploaded package
      const packageBuf = fs.readFileSync(uploadedPath);
      const computedSha256 = crypto.createHash('sha256').update(packageBuf).digest('hex');

      // Verify destination project permission if provided
      let destinationProjectId = req.body.destination_project_id || req.query.destination_project_id || null;
      if (destinationProjectId) {
        destinationProjectId = parseInt(destinationProjectId, 10);
        const hasAccess = await Project.findById(destinationProjectId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            valid: false,
            error: 'You do not have access to the specified destination project.',
            errors: [{ code: 'PROJECT_ACCESS_DENIED', message: 'Unauthorized destination project.' }]
          });
        }
        const hasWrite = await Project.hasWriteAccess(destinationProjectId, req.user.id);
        if (!hasWrite) {
          return res.status(403).json({
            valid: false,
            error: 'You do not have permission to import into this project. Only project owners and editors can import content.',
            errors: [{ code: 'PROJECT_FORBIDDEN', message: 'Import requires owner or editor permissions.' }]
          });
        }
      }

      const report = await inspectKnowledgePackage({
        zipFilePath: uploadedPath,
        originalFilename: req.file.originalname || 'package.flowden.zip',
        userId: req.user.id,
        ip: req.ip
      });

      let inspectionToken = null;
      const expiresInSeconds = 900; // 15 minutes TTL

      if (report.valid) {
        // Keep a copy in server-controlled staging directory for commit binding
        const stagingOpId = report.operation_id || `insp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const inspectionStagingDir = path.join(UPLOAD_TEMP_DIR, `fkp_staged_${stagingOpId}`);
        if (!fs.existsSync(inspectionStagingDir)) {
          fs.mkdirSync(inspectionStagingDir, { recursive: true });
        }
        const ext = path.extname(uploadedPath).toLowerCase();
        const isMd = ext === '.md' || ext === '.markdown' || (report.package && (report.package.format === 'flowden-markdown-knowledge' || report.package.name?.endsWith('.md')));
        const isFkf = ext === '.fkf' || ext === '.json' || (report.package && (report.package.format === 'flowden-knowledge-format' || report.package.name?.endsWith('.fkf')));
        const stagedPackageName = isMd ? 'inspected_package.md' : (isFkf ? 'inspected_package.fkf' : 'inspected_package.flowden.zip');
        const stagedPackagePath = path.join(inspectionStagingDir, stagedPackageName);
        fs.copyFileSync(uploadedPath, stagedPackagePath);

        // Write active lock file preventing premature background cleanup
        fs.writeFileSync(
          path.join(inspectionStagingDir, '.active.lock'),
          JSON.stringify({
            userId: req.user.id,
            operationId: stagingOpId,
            expiresAt: Date.now() + expiresInSeconds * 1000
          }),
          'utf8'
        );

        // Generate opaque random token and store its SHA-256 hash
        const rawToken = 'fkp_tok_' + crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const ticketId = `ticket_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

        await db.query(
          `INSERT INTO knowledge_exchange_tickets (
            id, ticket_hash, operation_id, user_id, package_sha256,
            destination_project_id, staging_dir, staged_package_path,
            package_name, report_json, is_consumed, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW(), DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
          [
            ticketId,
            tokenHash,
            stagingOpId,
            req.user.id,
            computedSha256,
            destinationProjectId || null,
            inspectionStagingDir,
            stagedPackagePath,
            req.file.originalname || report.package?.name || 'package.flowden.zip',
            JSON.stringify(report)
          ]
        );

        inspectionToken = rawToken;

        await SecurityService.logSecurityEvent({
          userId: req.user.id,
          eventType: 'EXCHANGE_PACKAGE_INSPECTED',
          severity: 'info',
          ip: req.ip,
          targetType: 'exchange_ticket',
          targetId: ticketId,
          details: {
            operationId: stagingOpId,
            packageSha256: computedSha256,
            destinationProjectId
          }
        });
      }

      const responsePayload = {
        valid: report.valid,
        error: report.valid ? null : ((report.validation && report.validation.errors && report.validation.errors[0]?.message) || 'Package validation failed.'),
        inspection_token: inspectionToken,
        expires_in_seconds: report.valid ? expiresInSeconds : null,
        operation_id: report.operation_id,
        package_name: report.package.name,
        package_id: report.package.package_id,
        format: report.package.format,
        fkf_version: report.package.fkf_version,
        project: report.project,
        folder_count: report.counts.folders,
        note_count: report.counts.notes,
        source_count: report.counts.sources,
        excerpt_count: report.counts.excerpts,
        relationship_count: report.counts.relationships,
        asset_count: report.counts.assets,
        task_count: report.counts.tasks,
        board_item_count: report.counts.board_items,
        optional_modules: report.optional_modules,
        errors: report.validation.errors,
        warnings: report.validation.warnings,
        unsupported_features: report.validation.unsupported_features,
        package: report.package,
        package_sha256: computedSha256,
        counts: report.counts,
        validation: report.validation,
        preview: report.preview,
        staging_cleaned_up: report.staging_cleaned_up,
        phase2b_preconditions: report.phase2b_preconditions
      };

      return res.status(report.valid ? 200 : 422).json(responsePayload);
    } catch (err) {
      return res.status(500).json({
        valid: false,
        error: 'Internal error while inspecting package.',
        errors: [{ code: 'INTERNAL_INSPECTION_ERROR', message: err.message }]
      });
    } finally {
      if (uploadedPath) {
        try {
          if (fs.existsSync(uploadedPath)) {
            fs.unlinkSync(uploadedPath);
          }
        } catch (_) {}
      }
    }
  });
});

/**
 * POST /api/v1/exchange/inspect-json
 * Safely inspects and validates a direct FKF 2.0 JSON payload without file upload,
 * computes SHA-256, stages canonical package, and issues an inspection token.
 */
router.post('/inspect-json', express.json({ limit: '10mb' }), async (req, res) => {
  const rate = SecurityService.checkRateLimit('exchange_inspect', String(req.user.id), 100, 60 * 1000);
  if (!rate.allowed) {
    return res.status(429).json({
      valid: false,
      error: 'Inspection rate limit exceeded. Please wait before inspecting more packages.',
      retryAfterSeconds: rate.retryAfterSeconds
    });
  }

  const payload = req.body && req.body.package_json ? req.body.package_json : req.body;
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    return res.status(400).json({
      valid: false,
      error: 'Missing FKF JSON document. Provide a valid JSON object.',
      errors: [{ code: 'MISSING_JSON_PAYLOAD', message: 'No JSON payload provided.' }]
    });
  }

  const token = crypto.randomBytes(8).toString('hex');
  const tempFkfPath = path.join(UPLOAD_TEMP_DIR, `fkp_inspect_json_${Date.now()}_${token}.fkf`);
  try {
    fs.writeFileSync(tempFkfPath, JSON.stringify(payload), 'utf8');

    let destinationProjectId = req.body.destination_project_id || req.query.destination_project_id || null;
    if (destinationProjectId) {
      destinationProjectId = parseInt(destinationProjectId, 10);
      const hasAccess = await Project.findById(destinationProjectId, req.user.id);
      if (!hasAccess) {
        return res.status(403).json({
          valid: false,
          error: 'You do not have access to the specified destination project.',
          errors: [{ code: 'PROJECT_ACCESS_DENIED', message: 'Unauthorized destination project.' }]
        });
      }
      const hasWrite = await Project.hasWriteAccess(destinationProjectId, req.user.id);
      if (!hasWrite) {
        return res.status(403).json({
          valid: false,
          error: 'You do not have permission to import into this project. Only project owners and editors can import content.',
          errors: [{ code: 'PROJECT_FORBIDDEN', message: 'Import requires owner or editor permissions.' }]
        });
      }
    }

    const report = await inspectKnowledgePackage({
      zipFilePath: tempFkfPath,
      originalFilename: 'package.fkf',
      userId: req.user.id,
      ip: req.ip
    });

    let inspectionToken = null;
    const expiresInSeconds = 900;

    if (report.valid) {
      const stagingOpId = report.operation_id || `insp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const inspectionStagingDir = path.join(UPLOAD_TEMP_DIR, `fkp_staged_${stagingOpId}`);
      if (!fs.existsSync(inspectionStagingDir)) {
        fs.mkdirSync(inspectionStagingDir, { recursive: true });
      }
      const stagedPackagePath = path.join(inspectionStagingDir, 'inspected_package.fkf');
      fs.copyFileSync(tempFkfPath, stagedPackagePath);

      fs.writeFileSync(
        path.join(inspectionStagingDir, '.active.lock'),
        JSON.stringify({
          userId: req.user.id,
          operationId: stagingOpId,
          expiresAt: Date.now() + expiresInSeconds * 1000
        }),
        'utf8'
      );

      const rawToken = 'fkp_tok_' + crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const ticketId = `ticket_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      await db.query(
        `INSERT INTO knowledge_exchange_tickets (
          id, ticket_hash, operation_id, user_id, package_sha256,
          destination_project_id, staging_dir, staged_package_path,
          package_name, report_json, is_consumed, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW(), DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [
          ticketId,
          tokenHash,
          stagingOpId,
          req.user.id,
          report.package.sha256,
          destinationProjectId || null,
          inspectionStagingDir,
          stagedPackagePath,
          'package.fkf',
          JSON.stringify(report)
        ]
      );

      inspectionToken = rawToken;
    }

    const responsePayload = {
      valid: report.valid,
      inspection_token: inspectionToken,
      expires_in_seconds: report.valid ? expiresInSeconds : null,
      operation_id: report.operation_id,
      package_name: report.package.name,
      package_id: report.package.package_id,
      format: report.package.format,
      fkf_version: report.package.fkf_version,
      project: report.project,
      folder_count: report.counts.folders,
      note_count: report.counts.notes,
      source_count: report.counts.sources,
      excerpt_count: report.counts.excerpts,
      relationship_count: report.counts.relationships,
      asset_count: report.counts.assets,
      task_count: report.counts.tasks,
      board_item_count: report.counts.board_items,
      optional_modules: report.optional_modules,
      errors: report.validation.errors,
      warnings: report.validation.warnings,
      unsupported_features: report.validation.unsupported_features,
      package: report.package,
      package_sha256: report.package.sha256,
      counts: report.counts,
      validation: report.validation,
      preview: report.preview,
      staging_cleaned_up: report.staging_cleaned_up,
      phase2b_preconditions: report.phase2b_preconditions
    };

    return res.status(report.valid ? 200 : 422).json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      valid: false,
      error: 'Internal error while inspecting JSON package.',
      errors: [{ code: 'INTERNAL_INSPECTION_ERROR', message: err.message }]
    });
  } finally {
    if (fs.existsSync(tempFkfPath)) {
      try { fs.unlinkSync(tempFkfPath); } catch (_) {}
    }
  }
});

/**
 * POST /api/v1/exchange/commit
 * Transactionally commits a previously inspected Knowledge Exchange package.
 * Requires:
 * 1. Explicit user approval (approved: true)
 * 2. Valid, unexpired inspection token issued by POST /api/v1/exchange/inspect
 * 3. Exact matching authenticated user, destination project, and package SHA-256
 */
router.post('/commit', (req, res) => {
  const rate = SecurityService.checkRateLimit('exchange_commit', String(req.user.id), 30, 60 * 1000);
  if (!rate.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Commit rate limit exceeded. Please wait before committing more packages.',
      retryAfterSeconds: rate.retryAfterSeconds
    });
  }

  uploadMiddleware.single('file')(req, res, async (uploadErr) => {
    const uploadedPath = req.file ? req.file.path : null;

    try {
      if (uploadErr) {
        await SecurityService.logSecurityEvent({
          userId: req.user ? req.user.id : null,
          eventType: 'EXCHANGE_COMMIT_UPLOAD_REJECTED',
          severity: 'warning',
          ip: req.ip,
          targetType: 'exchange_package',
          details: { error: uploadErr.message, code: uploadErr.code }
        });

        const isSizeErr = uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE';
        return res.status(isSizeErr ? 413 : 400).json({
          success: false,
          error: isSizeErr
            ? `Compressed package exceeds maximum allowed upload limit (${Math.round(MAX_COMPRESSED_ARCHIVE_BYTES / (1024 * 1024))} MB).`
            : (uploadErr.message || 'Package upload failed.')
        });
      }

      // 1. Explicit User Approval Requirement
      const isApproved = req.body.approved === true ||
        req.body.approved === 'true' ||
        req.headers['x-flowden-approval'] === 'approved';

      if (!isApproved) {
        return res.status(400).json({
          success: false,
          error: 'Explicit user approval is required to commit package import. Set "approved": true in request body.',
          code: 'EXPLICIT_APPROVAL_REQUIRED'
        });
      }

      // 2. Server-side Inspection Token Requirement
      const inspectionToken = req.body.inspection_token || req.headers['x-flowden-inspection-token'];
      if (!inspectionToken || typeof inspectionToken !== 'string' || !inspectionToken.trim()) {
        return res.status(400).json({
          success: false,
          error: 'A valid inspection token from POST /api/v1/exchange/inspect is required to commit import.',
          code: 'INSPECTION_TOKEN_REQUIRED'
        });
      }

      // 3. Lookup Ticket
      const tokenHash = crypto.createHash('sha256').update(inspectionToken.trim()).digest('hex');
      const ticketRows = await db.query(
        'SELECT *, (expires_at < NOW()) AS is_expired FROM knowledge_exchange_tickets WHERE ticket_hash = ? LIMIT 1',
        [tokenHash]
      );
      const ticket = ticketRows && ticketRows[0];
      if (!ticket) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or unknown inspection token.',
          code: 'INVALID_INSPECTION_TOKEN'
        });
      }

      // 4. Authenticated User Binding
      if (ticket.user_id !== req.user.id) {
        await SecurityService.logSecurityEvent({
          userId: req.user.id,
          eventType: 'EXCHANGE_TOKEN_CROSS_USER_ATTEMPT',
          severity: 'warn',
          ip: req.ip,
          targetType: 'exchange_ticket',
          details: { ticketId: ticket.id, ticketOwner: ticket.user_id }
        });
        return res.status(403).json({
          success: false,
          error: 'Inspection token does not belong to the authenticated user.',
          code: 'INSPECTION_TOKEN_FORBIDDEN'
        });
      }

      // 4b. Pre-emptive Idempotency Check
      // If this exact idempotency key was already committed for this user, serve the idempotent replay
      const idempotencyKey = req.body.idempotency_key || req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      if (idempotencyKey) {
        const existingJobRows = await db.query(
          'SELECT * FROM knowledge_import_jobs WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
          [req.user.id, idempotencyKey]
        );
        const existingJob = existingJobRows && existingJobRows[0];
        if (existingJob && existingJob.state === 'committed') {
          // Reject reuse with different package hash
          if (existingJob.package_sha256 && ticket.package_sha256 && existingJob.package_sha256 !== ticket.package_sha256) {
            return res.status(409).json({
              success: false,
              error: 'Idempotency key has already been used with a different package hash.',
              code: 'IDEMPOTENCY_KEY_REUSED_DIFFERENT_HASH'
            });
          }

          const summary = typeof existingJob.summary_json === 'string'
            ? JSON.parse(existingJob.summary_json)
            : (existingJob.summary_json || {});
          return res.status(200).json({
            success: true,
            idempotent_replay: true,
            operation_id: existingJob.operation_id,
            state: 'committed',
            created_project_id: existingJob.created_project_id,
            counts: summary.counts || {},
            summary
          });
        }
      }

      // 5. Expiration Check
      if (Boolean(ticket.is_expired)) {
        return res.status(400).json({
          success: false,
          error: 'Inspection token has expired. Please re-inspect the package.',
          code: 'INSPECTION_TOKEN_EXPIRED'
        });
      }

      // 6. Already Consumed Check
      if (ticket.is_consumed) {
        return res.status(409).json({
          success: false,
          error: 'Inspection token has already been consumed and cannot be replayed.',
          code: 'INSPECTION_TOKEN_ALREADY_CONSUMED'
        });
      }

      // 7. Destination Project Binding
      const destinationProjectId = req.body.destination_project_id
        ? parseInt(req.body.destination_project_id, 10)
        : null;
      if (ticket.destination_project_id) {
        if (destinationProjectId && destinationProjectId !== ticket.destination_project_id) {
          return res.status(400).json({
            success: false,
            error: `Destination project mismatch. Token was approved for project ${ticket.destination_project_id}, but request specified ${destinationProjectId}.`,
            code: 'DESTINATION_PROJECT_MISMATCH'
          });
        }
      }
      const finalDestinationProjectId = destinationProjectId || ticket.destination_project_id || null;

      if (finalDestinationProjectId) {
        const hasAccess = await Project.findById(finalDestinationProjectId, req.user.id);
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to the specified destination project.',
            code: 'PROJECT_ACCESS_DENIED'
          });
        }
        const hasWrite = await Project.hasWriteAccess(finalDestinationProjectId, req.user.id);
        if (!hasWrite) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to import into this project. Only project owners and editors can import content.',
            code: 'PROJECT_FORBIDDEN'
          });
        }
      }

      // 8. Package Bytes & SHA-256 Binding
      let commitZipPath = null;

      if (uploadedPath) {
        // Uploaded file provided: verify SHA-256 matches inspected ticket raw hash byte-for-byte
        const uploadedBuf = fs.readFileSync(uploadedPath);
        const uploadedSha = crypto.createHash('sha256').update(uploadedBuf).digest('hex').toLowerCase();
        if (uploadedSha !== ticket.package_sha256.toLowerCase()) {
          return res.status(422).json({
            success: false,
            error: 'Uploaded package bytes do not match the inspected package hash.',
            code: 'PACKAGE_HASH_MISMATCH'
          });
        }
        commitZipPath = uploadedPath;
      } else {
        // No new file uploaded: use server-staged package from inspect
        if (!fs.existsSync(ticket.staged_package_path)) {
          return res.status(400).json({
            success: false,
            error: 'Inspected package archive is no longer available in server staging. Please upload the file again.',
            code: 'STAGED_PACKAGE_NOT_FOUND'
          });
        }
        commitZipPath = ticket.staged_package_path;
      }

      // Also verify client-supplied package_sha256 if present (must strictly match raw inspected hash)
      const reqSha = req.body.package_sha256 || req.headers['x-flowden-package-sha256'];
      if (reqSha && reqSha.trim().toLowerCase() !== ticket.package_sha256.toLowerCase()) {
        return res.status(422).json({
          success: false,
          error: 'Client-supplied package SHA-256 does not match inspected token package hash.',
          code: 'PACKAGE_HASH_MISMATCH'
        });
      }

      // 9. Atomic Consumption of Inspection Token
      const consumeResult = await db.query(
        `UPDATE knowledge_exchange_tickets
         SET is_consumed = TRUE, consumed_at = NOW(), consumed_by_operation_id = ?
         WHERE id = ? AND is_consumed = FALSE`,
        [ticket.operation_id, ticket.id]
      );
      const affected = consumeResult.affectedRows || (consumeResult[0] && consumeResult[0].affectedRows);
      if (!affected) {
        return res.status(409).json({
          success: false,
          error: 'Inspection token was already consumed by a concurrent request.',
          code: 'INSPECTION_TOKEN_ALREADY_CONSUMED'
        });
      }

      // 10. Execute Transactional Commit
      const conflictResolution = req.body.conflict_resolution || 'disambiguate';

      const result = await KnowledgeExchangeService.executeImport({
        userId: req.user.id,
        operationId: ticket.operation_id,
        idempotencyKey,
        packageSha256: ticket.package_sha256,
        zipFilePath: commitZipPath,
        originalFilename: ticket.package_name || req.file?.originalname || 'package.flowden.zip',
        destinationProjectId: finalDestinationProjectId,
        conflictResolution,
        ip: req.ip
      });

      // 11. Cleanup server-staged package directory after successful commit
      try {
        if (ticket.staging_dir && fs.existsSync(ticket.staging_dir)) {
          fs.rmSync(ticket.staging_dir, { recursive: true, force: true });
        }
      } catch (_) {}

      return res.status(200).json(result);
    } catch (err) {
      const statusCode = err.status || 500;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to commit package import.',
        code: err.code || 'IMPORT_COMMIT_ERROR',
        errors: err.errors || undefined
      });
    } finally {
      if (uploadedPath) {
        try {
          if (fs.existsSync(uploadedPath)) {
            fs.unlinkSync(uploadedPath);
          }
        } catch (_) {}
      }
    }
  });
});

module.exports = router;

