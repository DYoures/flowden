const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const EntitySyncService = require('../services/entitySyncService');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/tasks
router.get('/', async (req, res, next) => {
  try {
    const { project_id, status, priority, search } = req.query;
    let sql = 'SELECT * FROM tasks WHERE user_id = ?';
    const params = [req.user.id];

    if (project_id) {
      sql += ' AND project_id = ?';
      params.push(parseInt(project_id, 10));
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority);
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC';
    let tasks = await db.query(sql, params);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      tasks = tasks.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks
router.post('/', async (req, res, next) => {
  try {
    const { title, description, status = 'planned', priority = 'medium', project_id = null, due_date = null } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const result = await db.query(
      'INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, project_id || null, title.trim(), description || '', status, priority, due_date || null]
    );

    await EntitySyncService.syncTaskEntity(db, result.insertId, req.user.id);
    const rows = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tasks/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, status, priority, due_date, project_id, sort_order } = req.body;
    const existing = await db.query('SELECT id FROM tasks WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Task not found or unauthorized' });

    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'done') {
        updates.push('completed_at = ?');
        params.push(new Date());
      }
    }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
    if (project_id !== undefined) { updates.push('project_id = ?'); params.push(project_id); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

    if (updates.length > 0) {
      params.push(req.user.id);
      params.push(req.params.id);
      await db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
      await EntitySyncService.syncTaskEntity(db, req.params.id, req.user.id);
    }

    const rows = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [req.params.id]);
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await db.query('SELECT id FROM tasks WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Task not found or unauthorized' });

    await db.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    await EntitySyncService.deleteTaskEntity(db, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tasks/:id/notes - Get all notes linked to this task
router.get('/:id/notes', async (req, res, next) => {
  try {
    const notes = await EntitySyncService.getLinkedNotesForTask(db, req.user.id, req.params.id);
    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/:id/notes - Connect an existing note to this task
router.post('/:id/notes', async (req, res, next) => {
  try {
    const { noteId, linkType = 'relates_to' } = req.body;
    if (!noteId) {
      return res.status(400).json({ error: 'noteId is required' });
    }

    const taskRows = await db.query('SELECT id FROM tasks WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!taskRows || taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    const noteRows = await db.query('SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1', [noteId, req.user.id]);
    if (!noteRows || noteRows.length === 0) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    const link = await EntitySyncService.linkNoteAndTask(db, req.user.id, noteId, req.params.id, linkType);
    res.status(201).json({ note: noteRows[0], link });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tasks/:id/notes/:noteId - Remove relationship between task and note
router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    await EntitySyncService.unlinkNoteAndTask(db, req.user.id, req.params.noteId, req.params.id);
    res.json({ success: true, message: 'Relationship removed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/bulk-status
router.post('/bulk-status', async (req, res, next) => {
  try {
    const { taskIds, status } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !status) {
      return res.status(400).json({ error: 'taskIds array and status are required' });
    }

    for (const id of taskIds) {
      const updates = ['status = ?'];
      const params = [status];
      if (status === 'done') {
        updates.push('completed_at = ?');
        params.push(new Date());
      }
      params.push(req.user.id);
      params.push(id);
      await db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    }

    res.json({ success: true, updatedCount: taskIds.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/bulk-delete
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: 'taskIds array is required' });
    }

    for (const id of taskIds) {
      await db.query('DELETE FROM tasks WHERE user_id = ? AND id = ?', [req.user.id, id]);
      await EntitySyncService.deleteTaskEntity(db, id);
    }

    res.json({ success: true, deletedCount: taskIds.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/reorder
router.post('/reorder', async (req, res, next) => {
  try {
    const { orderedIds, status } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (status) {
        await db.query('UPDATE tasks SET sort_order = ?, status = ? WHERE user_id = ? AND id = ?', [i, status, req.user.id, id]);
      } else {
        await db.query('UPDATE tasks SET sort_order = ? WHERE user_id = ? AND id = ?', [i, req.user.id, id]);
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

