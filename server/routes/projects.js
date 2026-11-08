const express = require('express');
const Project = require('../models/Project');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/projects
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const projects = await Project.findAll(req.user.id, status || null);

    const enhanced = await Promise.all(
      projects.map(p => Project.getStats(p.id, req.user.id))
    );

    res.json({ projects: enhanced.filter(Boolean) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/projects
router.post('/', async (req, res, next) => {
  try {
    const { title, description, color, icon } = req.body || {};

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Project title is required.' });
    }

    const project = await Project.create(req.user.id, {
      title,
      description,
      color,
      icon
    });

    res.status(201).json({
      message: 'Project created successfully.',
      project
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/projects/:id
router.get('/:id', async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id, req.user.id);
    if (!project) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'PROJECT_ACCESS_DENIED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'project',
        targetId: String(req.params.id)
      });
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/projects/:id/dashboard
router.get('/:id/dashboard', async (req, res, next) => {
  try {
    const dashboardData = await Project.getStats(req.params.id, req.user.id);
    if (!dashboardData) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ project: dashboardData });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/projects/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, color, icon, status, sort_order } = req.body || {};

    const own = await db.query('SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!own || own.length === 0) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'PROJECT_MUTATION_DENIED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'project',
        targetId: String(req.params.id)
      });
      return res.status(404).json({ error: 'Project not found or unauthorized.' });
    }

    const updated = await Project.update(req.params.id, req.user.id, {
      title,
      description,
      color,
      icon,
      status,
      sort_order
    });

    res.json({
      message: 'Project updated successfully.',
      project: updated
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const own = await db.query('SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!own || own.length === 0) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'PROJECT_DELETE_DENIED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'project',
        targetId: String(req.params.id)
      });
      return res.status(404).json({ error: 'Project not found or unauthorized.' });
    }

    await Project.delete(req.params.id, req.user.id);
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/projects/:id/members - Grant project membership (owner only)
router.post('/:id/members', async (req, res, next) => {
  try {
    const own = await db.query('SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!own || own.length === 0) {
      return res.status(403).json({ error: 'Only the project owner can manage members' });
    }
    const { user_id, role = 'editor' } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const safeRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'viewer';

    await db.query(
      `INSERT INTO project_members (project_id, user_id, role, revoked_at)
       VALUES (?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE role = VALUES(role), revoked_at = NULL`,
      [req.params.id, Number(user_id), safeRole]
    );

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'PROJECT_MEMBER_GRANTED',
      severity: 'info',
      ip: req.ip,
      targetType: 'project',
      targetId: String(req.params.id),
      details: { memberUserId: Number(user_id), role: safeRole }
    });

    res.status(201).json({ success: true, project_id: Number(req.params.id), user_id: Number(user_id), role: safeRole });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/projects/:id/members/:memberUserId - Revoke project membership (owner only)
router.delete('/:id/members/:memberUserId', async (req, res, next) => {
  try {
    const own = await db.query('SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (!own || own.length === 0) {
      return res.status(403).json({ error: 'Only the project owner can revoke members' });
    }

    await db.query(
      'UPDATE project_members SET revoked_at = NOW() WHERE project_id = ? AND user_id = ?',
      [req.params.id, Number(req.params.memberUserId)]
    );

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'PROJECT_MEMBER_REVOKED',
      severity: 'warning',
      ip: req.ip,
      targetType: 'project',
      targetId: String(req.params.id),
      details: { revokedUserId: Number(req.params.memberUserId) }
    });

    res.json({ success: true, message: 'Project membership revoked' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
