const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');

const router = express.Router();
router.use(authenticateToken);

// Admin role guard with audit logging
router.use(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'ADMIN_UNAUTHORIZED_ACCESS_ATTEMPT',
      severity: 'high',
      ip: req.ip,
      targetType: 'admin_endpoint',
      targetId: req.originalUrl,
      details: { role: req.user.role, method: req.method }
    });
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// GET /api/v1/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await db.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/users/:id/role
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'ADMIN_USER_ROLE_CHANGED',
      severity: 'high',
      ip: req.ip,
      targetType: 'user',
      targetId: String(req.params.id),
      details: { newRole: role }
    });
    res.json({ message: 'Role updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (parseInt(req.params.id, 10) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'ADMIN_USER_DELETED',
      severity: 'critical',
      ip: req.ip,
      targetType: 'user',
      targetId: String(req.params.id)
    });
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const users = await db.query('SELECT COUNT(*) as c FROM users');
    const projects = await db.query('SELECT COUNT(*) as c FROM projects');
    const tasks = await db.query('SELECT COUNT(*) as c FROM tasks');
    const notes = await db.query('SELECT COUNT(*) as c FROM notes');

    res.json({
      stats: {
        totalUsers: users[0]?.c || 0,
        totalProjects: projects[0]?.c || 0,
        totalTasks: tasks[0]?.c || 0,
        totalNotes: notes[0]?.c || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/audit-logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const logs = await SecurityService.getAuditLogs({
      userId: req.query.user_id || null,
      eventType: req.query.event_type || null,
      limit: req.query.limit || 100
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/security-reports
router.get('/security-reports', async (req, res, next) => {
  try {
    const reports = await db.query(
      'SELECT * FROM security_reports ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ reports: reports || [] });
  } catch (err) {
    res.json({ reports: [] });
  }
});

// PUT /api/v1/admin/security-reports/:id
router.put('/security-reports/:id', async (req, res, next) => {
  try {
    const { status, admin_notes = null } = req.body || {};
    if (!['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await db.query(
      'UPDATE security_reports SET status = ?, admin_notes = ? WHERE id = ?',
      [status, admin_notes, req.params.id]
    );
    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'ADMIN_SECURITY_REPORT_UPDATED',
      severity: 'info',
      ip: req.ip,
      targetType: 'security_report',
      targetId: String(req.params.id),
      details: { status }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
