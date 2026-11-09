const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const Project = require('../models/Project');
const Note = require('../models/Note');
const authenticateToken = require('../middleware/auth');
const EntitySyncService = require('../services/entitySyncService');
const SecurityService = require('../services/securityService');
const researchService = require('../services/researchService');

const router = express.Router();
router.use(authenticateToken);

// Setup storage directory for research documents
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'research');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'doc';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ['.md', '.txt', '.pdf', '.docx'];
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported formats are .md, .txt, .pdf, .docx`));
    }
  }
});

// Helper for text extraction
async function extractDocumentText(filePath, ext) {
  try {
    if (ext === '.md' || ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }

    if (ext === '.pdf') {
      let parser = null;
      try {
        const pdfModule = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        if (pdfModule && pdfModule.PDFParse) {
          parser = new pdfModule.PDFParse({ data: new Uint8Array(dataBuffer) });
          const result = await parser.getText();
          return (result && typeof result.text === 'string' ? result.text : '') || '';
        } else if (typeof pdfModule === 'function') {
          const data = await pdfModule(dataBuffer);
          return (data && typeof data.text === 'string' ? data.text : '') || '';
        }
        return '';
      } catch (pdfErr) {
        return '';
      } finally {
        if (parser && typeof parser.destroy === 'function') {
          try {
            await parser.destroy();
          } catch (_) {}
        }
      }
    }

    if (ext === '.docx') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '';
      } catch (docxErr) {
        return '';
      }
    }

    return '';
  } catch (err) {
    return '';
  }
}

// GET /api/v1/research - List active research documents (owned + shared project access)
router.get('/', async (req, res, next) => {
  try {
    const { project_id, file_type, search } = req.query;
    let sql = `
      SELECT DISTINCT r.*
      FROM research_documents r
      LEFT JOIN project_entities pe ON pe.entity_type = 'research' AND pe.entity_id = r.id
      LEFT JOIN project_members pm ON (pm.project_id = r.project_id OR pm.project_id = pe.project_id)
        AND pm.user_id = ? AND pm.revoked_at IS NULL
      WHERE r.deleted_at IS NULL
        AND ((r.project_id IS NULL AND r.user_id = ?) OR pm.id IS NOT NULL)
    `;
    const params = [req.user.id, req.user.id];

    if (project_id) {
      sql += ' AND (r.project_id = ? OR pe.project_id = ?)';
      params.push(parseInt(project_id, 10), parseInt(project_id, 10));
    }
    if (file_type) {
      sql += ' AND r.file_type = ?';
      params.push(file_type.toLowerCase());
    }

    sql += ' ORDER BY r.created_at DESC';
    let documents = await db.query(sql, params);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      documents = documents.filter(d =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.summary && d.summary.toLowerCase().includes(q)) ||
        (d.content_text && d.content_text.toLowerCase().includes(q))
      );
    }

    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/research/trash - List soft-deleted research documents accessible to user
router.get('/trash', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT DISTINCT r.* FROM research_documents r
       WHERE r.deleted_at IS NOT NULL
         AND (
           (r.project_id IS NULL AND r.user_id = ?)
           OR (r.project_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM project_members pm
             WHERE pm.project_id = r.project_id
               AND pm.user_id = ?
               AND pm.role IN ('owner', 'editor')
               AND pm.revoked_at IS NULL
           ))
         )
       ORDER BY r.deleted_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json({ documents: rows || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/research/:id - Single active research document
router.get('/:id', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT DISTINCT r.*
       FROM research_documents r
       LEFT JOIN project_entities pe ON pe.entity_type = 'research' AND pe.entity_id = r.id
       LEFT JOIN project_members pm ON (pm.project_id = r.project_id OR pm.project_id = pe.project_id)
         AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ? AND r.deleted_at IS NULL
         AND ((r.project_id IS NULL AND r.user_id = ?) OR pm.id IS NOT NULL)
       LIMIT 1`,
      [req.user.id, req.params.id, req.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Research document not found' });
    }
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/research/import & POST /api/v1/research/upload - Import files (.md, .txt, .pdf, .docx)
const handleResearchUpload = [
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Research import upload rejected' });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
      if (files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
      }

      const { project_id, source_url } = req.body || {};
      let resolvedProjectId = null;
      if (project_id !== null && project_id !== undefined && project_id !== '') {
        const auth = await Project.validateWriteAccess(project_id, req.user.id);
        if (!auth.valid) {
          for (const file of files) {
            try { fs.unlinkSync(file.path); } catch (_) {}
          }
          return res.status(auth.status).json({ error: auth.error });
        }
        resolvedProjectId = auth.projectId;
      }
      const importedDocs = [];

      for (const file of files) {
        const validation = SecurityService.validateUploadedFile(
          file.path,
          file.originalname,
          file.mimetype,
          { allowedExtensions: new Set(['.md', '.txt', '.pdf', '.docx']), allowArchives: false }
        );

        if (!validation.valid) {
          try { fs.unlinkSync(file.path); } catch (_) {}
          await SecurityService.logSecurityEvent({
            userId: req.user.id,
            eventType: 'RESEARCH_UPLOAD_BLOCKED',
            severity: 'warn',
            ipAddress: req.ip,
            targetType: 'research_upload',
            details: { originalName: file.originalname, reason: validation.reason }
          });
          return res.status(400).json({ error: validation.reason });
        }

        const ext = path.extname(file.originalname).toLowerCase();
        const rawExt = ext.replace('.', '');
        const initialTitle = path.basename(file.originalname, ext).replace(/[_-]/g, ' ');
        const extractedText = await extractDocumentText(file.path, ext);
        const cleanSnippet = extractedText.replace(/\s+/g, ' ').trim().slice(0, 250);
        const summary = cleanSnippet ? (cleanSnippet + (extractedText.length > 250 ? '...' : '')) : 'Document imported into Research Bridge.';

        const conn = await db.getConnection();
        let committed = false;
        let insertedDocId = null;
        const relativeUrl = `/uploads/research/${file.filename}`;

        try {
          await conn.beginTransaction();

          const result = await conn.query(
            `INSERT INTO research_documents 
              (user_id, project_id, title, original_filename, file_name, file_path, file_type, file_size, content_text, summary, source_url, tags_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.user.id,
              resolvedProjectId,
              initialTitle,
              file.originalname || file.filename,
              file.filename,
              file.path,
              rawExt,
              file.size,
              extractedText,
              summary,
              source_url || null,
              JSON.stringify([rawExt.toUpperCase(), 'Literature'])
            ]
          );

          insertedDocId = result.insertId;

          await SecurityService.registerUploadedFile({
            userId: req.user.id,
            projectId: resolvedProjectId,
            entityType: 'research',
            entityId: insertedDocId,
            filename: file.filename,
            originalName: file.originalname,
            filePath: relativeUrl,
            mimeType: validation.detectedMime || file.mimetype,
            fileSize: file.size
          }, conn);

          await EntitySyncService.syncResearchEntity(conn, insertedDocId, req.user.id);

          await conn.commit();
          committed = true;
        } catch (txErr) {
          try { await conn.rollback(); } catch (_) {}
          if (!committed && fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (_) {}
          }
          throw txErr;
        } finally {
          conn.release();
        }

        const rows = await db.query('SELECT * FROM research_documents WHERE id = ? LIMIT 1', [insertedDocId]);
        if (rows && rows.length > 0) {
          importedDocs.push({
            ...rows[0],
            file_url: relativeUrl
          });
        }
      }

      res.status(201).json({
        message: `Successfully imported ${importedDocs.length} document(s).`,
        document: importedDocs[0] || null,
        documents: importedDocs
      });
    } catch (err) {
      next(err);
    }
  }
];

router.post('/import', ...handleResearchUpload);
router.post('/upload', ...handleResearchUpload);

// PUT /api/v1/research/:id - Update metadata
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await db.query(
      `SELECT r.id, r.user_id, r.project_id
       FROM research_documents r
       LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ? AND r.deleted_at IS NULL
         AND ((r.project_id IS NULL AND r.user_id = ?) OR pm.id IS NOT NULL)
       LIMIT 1`,
      [req.user.id, req.params.id, req.user.id]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Research document not found' });
    }
    const currentDoc = existing[0];
    if (currentDoc.project_id) {
      const canMutate = await Project.hasWriteAccess(currentDoc.project_id, req.user.id);
      if (!canMutate) {
        return res.status(403).json({ error: 'Forbidden: Viewers cannot modify research documents' });
      }
    } else if (Number(currentDoc.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden: You do not own this research document' });
    }

    const { title, summary, source_url, project_id, tags_json } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (summary !== undefined) { updates.push('summary = ?'); params.push(summary); }
    if (source_url !== undefined) { updates.push('source_url = ?'); params.push(source_url); }
    if (project_id !== undefined) {
      let resolvedProjectId = null;
      if (project_id !== null && project_id !== '') {
        const auth = await Project.validateWriteAccess(project_id, req.user.id);
        if (!auth.valid) {
          return res.status(auth.status).json({ error: auth.error });
        }
        resolvedProjectId = auth.projectId;
      }
      updates.push('project_id = ?');
      params.push(resolvedProjectId);
    }
    if (tags_json !== undefined) { updates.push('tags_json = ?'); params.push(typeof tags_json === 'string' ? tags_json : JSON.stringify(tags_json)); }

    if (updates.length > 0) {
      params.push(req.params.id);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`UPDATE research_documents SET ${updates.join(', ')} WHERE id = ?`, params);
        await EntitySyncService.syncResearchEntity(conn, req.params.id, req.user.id);
        await conn.commit();
      } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        throw err;
      } finally {
        conn.release();
      }
    }

    const rows = await db.query('SELECT * FROM research_documents WHERE id = ? LIMIT 1', [req.params.id]);
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/research/:id - Soft-delete (default) or hard-delete (permanent=true)
router.delete('/:id', async (req, res, next) => {
  try {
    const isPermanent = req.query.permanent === 'true';

    // Verify existing document and authorization
    const existing = await db.query(
      `SELECT r.id, r.user_id, r.project_id, r.file_path
       FROM research_documents r
       LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ?
         AND ((r.project_id IS NULL AND r.user_id = ?) OR pm.id IS NOT NULL)
       LIMIT 1`,
      [req.user.id, req.params.id, req.user.id]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Research document not found or unauthorized' });
    }
    const currentDoc = existing[0];
    if (currentDoc.project_id) {
      const canMutate = await Project.hasWriteAccess(currentDoc.project_id, req.user.id);
      if (!canMutate) {
        return res.status(403).json({ error: 'Forbidden: Viewers cannot delete research documents' });
      }
    } else if (Number(currentDoc.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden: You do not own this research document' });
    }

    if (isPermanent) {
      const researchId = Number(req.params.id);
      const filePath = currentDoc.file_path;
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // 1. Load the Research document and associated Excerpt IDs within the transaction
        const docRows = await conn.query(
          'SELECT id, user_id, project_id, file_path FROM research_documents WHERE id = ? FOR UPDATE',
          [researchId]
        );
        if (!docRows || docRows.length === 0) {
          throw new Error('NOT_FOUND_OR_FORBIDDEN');
        }

        const excerptRows = await conn.query(
          'SELECT id FROM research_excerpts WHERE research_id = ?',
          [researchId]
        );
        const excerptIds = (excerptRows || []).map(r => r.id).filter(Boolean);

        // 2. Identify Board projection items referencing Research or Excerpts
        let projectionItems = [];
        if (excerptIds.length > 0) {
          const excPlaceholders = excerptIds.map(() => '?').join(',');
          projectionItems = await conn.query(
            `SELECT id FROM board_items
             WHERE ((reference_type = 'research' OR item_type = 'research_ref') AND reference_id = ?)
                OR (reference_type = 'excerpt' AND reference_id IN (${excPlaceholders}))`,
            [researchId, ...excerptIds]
          );
        } else {
          projectionItems = await conn.query(
            `SELECT id FROM board_items
             WHERE (reference_type = 'research' OR item_type = 'research_ref') AND reference_id = ?`,
            [researchId]
          );
        }
        const projectionItemIds = (projectionItems || []).map(r => r.id).filter(Boolean);

        // 3. Remove connections attached to projection items that must be removed
        if (projectionItemIds.length > 0) {
          const itemPlaceholders = projectionItemIds.map(() => '?').join(',');
          await conn.query(
            `DELETE FROM board_item_connections
             WHERE source_item_id IN (${itemPlaceholders}) OR target_item_id IN (${itemPlaceholders})`,
            [...projectionItemIds, ...projectionItemIds]
          );

          // 4. Remove obsolete projection items without deleting unrelated Board items or Boards
          await conn.query(
            `DELETE FROM board_items WHERE id IN (${itemPlaceholders})`,
            projectionItemIds
          );
        }

        // 5. Remove semantic entity_links referencing Research or Excerpts on either source or target side
        await conn.query(
          `DELETE FROM entity_links
           WHERE (source_type = 'research' AND source_id = ?)
              OR (target_type = 'research' AND target_id = ?)`,
          [researchId, researchId]
        );
        if (excerptIds.length > 0) {
          const excPlaceholders = excerptIds.map(() => '?').join(',');
          await conn.query(
            `DELETE FROM entity_links
             WHERE (source_type = 'excerpt' AND source_id IN (${excPlaceholders}))
                OR (target_type = 'excerpt' AND target_id IN (${excPlaceholders}))`,
            [...excerptIds, ...excerptIds]
          );
        }

        // 6. Remove project_entities associations for Research document and Excerpts
        await conn.query(
          "DELETE FROM project_entities WHERE entity_type = 'research' AND entity_id = ?",
          [researchId]
        );
        if (excerptIds.length > 0) {
          const excPlaceholders = excerptIds.map(() => '?').join(',');
          await conn.query(
            `DELETE FROM project_entities WHERE entity_type = 'excerpt' AND entity_id IN (${excPlaceholders})`,
            excerptIds
          );
        }

        // 7. Remove canonical entities records for Research document and Excerpts
        await conn.query(
          "DELETE FROM entities WHERE entity_type = 'research' AND entity_id = ?",
          [researchId]
        );
        if (excerptIds.length > 0) {
          const excPlaceholders = excerptIds.map(() => '?').join(',');
          await conn.query(
            `DELETE FROM entities WHERE entity_type = 'excerpt' AND entity_id IN (${excPlaceholders})`,
            excerptIds
          );
        }

        // 8. Remove research_excerpts records
        await conn.query('DELETE FROM research_excerpts WHERE research_id = ?', [researchId]);

        // 9. Remove file_uploads record associated with Research document
        await conn.query("DELETE FROM file_uploads WHERE entity_type = 'research' AND entity_id = ?", [researchId]);

        // 10. Remove research_documents record
        await conn.query('DELETE FROM research_documents WHERE id = ?', [researchId]);

        await conn.commit();
      } catch (txErr) {
        try { await conn.rollback(); } catch (_) {}
        throw txErr;
      } finally {
        conn.release();
      }

      // ONLY unlink physical file from disk AFTER database transaction successfully commits
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn('[Research] Could not unlink file:', unlinkErr.message);
        }
      }

      return res.json({ success: true, message: 'Document permanently deleted.' });
    }

    // Soft-delete using researchService (cascades active excerpts and projections)
    await researchService.deleteResearchDoc(db, req.user.id, req.params.id);
    res.json({ success: true, message: 'Document moved to trash.' });
  } catch (err) {
    if (err.message === 'NOT_FOUND_OR_FORBIDDEN') {
      return res.status(404).json({ error: 'Research document not found or unauthorized' });
    }
    next(err);
  }
});

// POST /api/v1/research/:id/restore - Restore soft-deleted research document
router.post('/:id/restore', async (req, res, next) => {
  try {
    const existing = await db.query(
      `SELECT r.id, r.user_id, r.project_id
       FROM research_documents r
       LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ? AND r.deleted_at IS NOT NULL
         AND ((r.project_id IS NULL AND r.user_id = ?) OR (pm.id IS NOT NULL AND pm.role IN ('owner', 'editor')))
       LIMIT 1`,
      [req.user.id, req.params.id, req.user.id]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Research document not found or unauthorized' });
    }
    await researchService.restoreResearchDoc(db, req.user.id, req.params.id);
    res.json({ success: true, message: 'Document restored successfully.' });
  } catch (err) {
    if (err.message === 'NOT_FOUND_OR_FORBIDDEN') {
      return res.status(404).json({ error: 'Research document not found or unauthorized' });
    }
    next(err);
  }
});

// POST /api/v1/research/:id/bridge - Create Vault Note from research document with confirmed link
router.post('/:id/bridge', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT r.* FROM research_documents r
       LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ? AND (r.user_id = ? OR pm.id IS NOT NULL) AND r.deleted_at IS NULL
       LIMIT 1`,
      [req.user.id, req.params.id, req.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Research document not found or unauthorized' });
    }
    const doc = rows[0];

    // Check if an active bridged note already exists in entity_links
    const existingLinks = await db.query(
      `SELECT el.source_id as note_id
       FROM entity_links el
       JOIN notes n ON n.id = el.source_id AND n.deleted_at IS NULL
       WHERE el.source_type = 'note'
         AND el.target_type = 'research'
         AND el.target_id = ?
         AND el.deleted_at IS NULL
       ORDER BY el.id ASC LIMIT 1`,
      [doc.id]
    );

    if (existingLinks && existingLinks.length > 0) {
      const existingNote = await Note.findById(existingLinks[0].note_id, req.user.id);
      if (existingNote) {
        return res.status(200).json({
          success: true,
          message: 'Research already bridged to Vault Note.',
          note: existingNote,
          link: {
            source_type: 'note',
            source_id: existingNote.id,
            target_type: 'research',
            target_id: doc.id,
            link_type: 'references'
          }
        });
      }
    }

    // Build seeded note content
    const noteTitle = doc.title ? `Research: ${doc.title}` : 'Research Note';
    const sourceRef = doc.original_filename || doc.file_name || doc.source_url || 'Internal Research Library';
    const noteContent = `# ${doc.title}\n\n> Source Document: ${sourceRef}\n\n## Abstract\n${doc.summary || 'No summary available.'}\n\n## Notes & Synthesis\n\n- Key finding:\n- Reference citation: ${doc.source_url || sourceRef}\n`;

    // Perform bridging atomically in a transaction
    const conn = await db.getConnection();
    let createdNote = null;
    try {
      await conn.beginTransaction();

      // Note.create within transaction
      createdNote = await Note.create({
        user_id: req.user.id,
        project_id: doc.project_id || null,
        title: noteTitle,
        content: noteContent,
        tags: ['research', 'literature']
      }, {}, conn);

      // Create confirmed semantic relationship link in entity_links
      await conn.query(
        `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
         VALUES (?, 'note', ?, 'research', ?, 'references', 'manual', 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE is_confirmed = 1, deleted_at = NULL, updated_at = NOW()`,
        [req.user.id, createdNote.id, doc.id]
      );

      await conn.commit();
    } catch (bridgeErr) {
      try { await conn.rollback(); } catch (_) {}
      throw bridgeErr;
    } finally {
      conn.release();
    }

    res.status(201).json({
      success: true,
      message: 'Research bridged to Vault Note successfully.',
      note: createdNote,
      link: {
        source_type: 'note',
        source_id: createdNote.id,
        target_type: 'research',
        target_id: doc.id,
        link_type: 'references'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.extractDocumentText = extractDocumentText;
module.exports = router;
