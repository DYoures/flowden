const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/decision-logs/project/:projectId
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const logs = await db.query(
      'SELECT * FROM decision_logs WHERE project_id = ? AND user_id = ? ORDER BY decided_at DESC, created_at DESC',
      [req.params.projectId, req.user.id]
    );
    res.json({ decision_logs: logs });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/decision-logs
router.post('/', async (req, res, next) => {
  try {
    const { project_id, title, context, decision, outcome, decided_at } = req.body;
    if (!project_id || !title || !decision) {
      return res.status(400).json({ error: 'Project ID, title, and decision text are required' });
    }

    const result = await db.query(
      'INSERT INTO decision_logs (user_id, project_id, title, context, decision, outcome, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, project_id, title.trim(), context || '', decision.trim(), outcome || '', decided_at || new Date().toISOString().split('T')[0]]
    );

    const rows = await db.query('SELECT * FROM decision_logs WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ decision_log: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/decision-logs/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, context, decision, outcome, decided_at } = req.body;
    const existing = await db.query('SELECT id FROM decision_logs WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Decision log not found or unauthorized' });

    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (context !== undefined) { updates.push('context = ?'); params.push(context); }
    if (decision !== undefined) { updates.push('decision = ?'); params.push(decision); }
    if (outcome !== undefined) { updates.push('outcome = ?'); params.push(outcome); }
    if (decided_at !== undefined) { updates.push('decided_at = ?'); params.push(decided_at); }

    if (updates.length > 0) {
      params.push(req.user.id);
      params.push(req.params.id);
      await db.query(`UPDATE decision_logs SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    }

    const rows = await db.query('SELECT * FROM decision_logs WHERE id = ? LIMIT 1', [req.params.id]);
    res.json({ decision_log: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/decision-logs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await db.query('SELECT id FROM decision_logs WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Decision log not found or unauthorized' });

    await db.query('DELETE FROM decision_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

