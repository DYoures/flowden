const express = require('express');
const db = require('../config/database');
const Note = require('../models/Note');
const Project = require('../models/Project');
const authenticateToken = require('../middleware/auth');
const EntitySyncService = require('../services/entitySyncService');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/quick-captures
router.get('/', async (req, res, next) => {
  try {
    const captures = await db.query(
      'SELECT * FROM quick_captures WHERE user_id = ? ORDER BY is_processed ASC, created_at DESC',
      [req.user.id]
    );
    res.json({ captures });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/quick-captures
router.post('/', async (req, res, next) => {
  try {
    const { content, capture_type = 'text', project_id = null } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    let resolvedProjectId = null;
    if (project_id !== null && project_id !== undefined && project_id !== '') {
      const auth = await Project.validateWriteAccess(project_id, req.user.id);
      if (!auth.valid) {
        return res.status(auth.status).json({ error: auth.error });
      }
      resolvedProjectId = auth.projectId;
    }

    const result = await db.query(
      'INSERT INTO quick_captures (user_id, content, capture_type, project_id, is_processed) VALUES (?, ?, ?, ?, 0)',
      [req.user.id, content.trim(), capture_type, resolvedProjectId]
    );

    const rows = await db.query('SELECT * FROM quick_captures WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ capture: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/quick-captures/:id/process
router.post('/:id/process', async (req, res, next) => {
  try {
    const { target_type, project_id, title } = req.body; // target_type: 'note' | 'task'
    const captures = await db.query('SELECT * FROM quick_captures WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!captures || captures.length === 0) return res.status(404).json({ error: 'Capture not found' });

    const capture = captures[0];
    const targetProjectId = project_id !== undefined ? project_id : capture.project_id;
    let resolvedTargetProjectId = null;
    if (targetProjectId !== null && targetProjectId !== undefined && targetProjectId !== '') {
      const auth = await Project.validateWriteAccess(targetProjectId, req.user.id);
      if (!auth.valid) {
        return res.status(auth.status).json({ error: auth.error });
      }
      resolvedTargetProjectId = auth.projectId;
    }

    let createdEntity = null;

    if (target_type === 'note') {
      createdEntity = await Note.create(req.user.id, {
        title: title || `Note from capture (${new Date().toLocaleDateString()})`,
        content: capture.content,
        project_id: resolvedTargetProjectId
      });
      await EntitySyncService.syncNoteEntity(db, createdEntity.id, req.user.id);
    } else if (target_type === 'task') {
      const ins = await db.query(
        'INSERT INTO tasks (user_id, project_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, resolvedTargetProjectId, title || capture.content.substring(0, 80), capture.content, 'planned', 'medium']
      );
      await EntitySyncService.syncTaskEntity(db, ins.insertId, req.user.id);
      const rows = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [ins.insertId]);
      createdEntity = rows[0];
    }

    // Mark processed
    await db.query('UPDATE quick_captures SET is_processed = 1 WHERE id = ?', [capture.id]);

    res.json({
      message: `Processed into ${target_type}`,
      entity: createdEntity
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/quick-captures/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM quick_captures WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

