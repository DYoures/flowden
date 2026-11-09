const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');

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
      try {
        const pdfModule = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        if (pdfModule && pdfModule.PDFParse) {
          const parser = new pdfModule.PDFParse(new Uint8Array(dataBuffer));
          const result = await parser.getText();
          return (typeof result === 'string' ? result : (result && result.text)) || '';
        } else if (typeof pdfModule === 'function') {
          const data = await pdfModule(dataBuffer);
          return data.text || '';
        }
        return '';
      } catch (pdfErr) {
        return '';
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

// GET /api/v1/research - List research documents (owned + shared project access)
router.get('/', async (req, res, next) => {
  try {
    const { project_id, file_type, search } = req.query;
    let sql = `
      SELECT DISTINCT r.*
      FROM research_documents r
      LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
      WHERE (r.user_id = ? OR pm.id IS NOT NULL)
    `;
    const params = [req.user.id, req.user.id];

    if (project_id) {
      sql += ' AND r.project_id = ?';
      params.push(parseInt(project_id, 10));
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

// GET /api/v1/research/:id - Single research document
router.get('/:id', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT r.*
       FROM research_documents r
       LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE r.id = ? AND (r.user_id = ? OR pm.id IS NOT NULL)
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

        const result = await db.query(
          `INSERT INTO research_documents 
            (user_id, project_id, title, original_filename, file_name, file_path, file_type, file_size, content_text, summary, source_url, tags_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            project_id ? parseInt(project_id, 10) : null,
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

        const relativeUrl = `/uploads/research/${file.filename}`;
        await SecurityService.registerUploadedFile({
          userId: req.user.id,
          projectId: project_id ? parseInt(project_id, 10) : null,
          entityType: 'research',
          entityId: result.insertId,
          filename: file.filename,
          originalName: file.originalname,
          filePath: relativeUrl,
          mimeType: validation.detectedMime || file.mimetype,
          fileSize: file.size
        });

        const rows = await db.query('SELECT * FROM research_documents WHERE id = ? LIMIT 1', [result.insertId]);
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
    const existing = await db.query('SELECT id FROM research_documents WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Research document not found' });
    }

    const { title, summary, source_url, project_id, tags_json } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (summary !== undefined) { updates.push('summary = ?'); params.push(summary); }
    if (source_url !== undefined) { updates.push('source_url = ?'); params.push(source_url); }
    if (project_id !== undefined) { updates.push('project_id = ?'); params.push(project_id ? parseInt(project_id, 10) : null); }
    if (tags_json !== undefined) { updates.push('tags_json = ?'); params.push(typeof tags_json === 'string' ? tags_json : JSON.stringify(tags_json)); }

    if (updates.length > 0) {
      params.push(req.user.id);
      params.push(req.params.id);
      await db.query(`UPDATE research_documents SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    }

    const rows = await db.query('SELECT * FROM research_documents WHERE id = ? LIMIT 1', [req.params.id]);
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/research/:id - Delete record and disk file
router.delete('/:id', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT file_path FROM research_documents WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Research document not found' });
    }

    const filePath = rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.warn('[Research] Could not unlink file:', unlinkErr.message);
      }
    }

    await db.query('DELETE FROM research_documents WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Document deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
