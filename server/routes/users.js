const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');

const router = express.Router();
router.use(authenticateToken);

function maskUserSecrets(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password_hash;
  if (copy.settings_json) {
    let settings = copy.settings_json;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch (_) { settings = {}; }
    } else {
      settings = JSON.parse(JSON.stringify(settings));
    }
    if (settings.mcp && settings.mcp.apiKey) {
      const rawKey = String(settings.mcp.apiKey);
      settings.mcp.apiKeyMasked = rawKey.length > 12
        ? `${rawKey.slice(0, 9)}...${rawKey.slice(-4)}`
        : 'fld_mcp_****';
      settings.mcp.hasApiKey = true;
    }
    copy.settings_json = settings;
  }
  return copy;
}

// GET /api/v1/users/me (and alias /profile)
router.get(['/me', '/profile'], async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: maskUserSecrets(user) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/users/me (and alias /profile)
router.put(['/me', '/profile'], async (req, res, next) => {
  try {
    const { display_name, username, avatar_url, theme_preference, settings_json } = req.body || {};

    let parsedSettings = settings_json;
    if (typeof settings_json === 'string') {
      try { parsedSettings = JSON.parse(settings_json); } catch (_) {}
    }

    if (parsedSettings && typeof parsedSettings === 'object' && parsedSettings.mcp) {
      if (Array.isArray(parsedSettings.mcp.enabledProjects)) {
        parsedSettings.mcp.projectFilterActive = true;
      }
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'MCP_SETTINGS_UPDATED',
        severity: 'info',
        ip: req.ip,
        targetType: 'user',
        targetId: String(req.user.id),
        details: {
          scope: parsedSettings.mcp.scope || 'read_only',
          enabledProjectsCount: Array.isArray(parsedSettings.mcp.enabledProjects)
            ? parsedSettings.mcp.enabledProjects.length
            : 0
        }
      });
    }

    const updated = await User.updateProfile(req.user.id, {
      display_name: display_name !== undefined ? display_name : username,
      avatar_url,
      theme_preference,
      settings_json: parsedSettings !== undefined ? parsedSettings : settings_json
    });

    res.json({
      message: 'Profile updated successfully.',
      user: maskUserSecrets(updated)
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/users/me/password (and alias /password)
router.put(['/me/password', '/password'], async (req, res, next) => {
  try {
    const current_password = req.body.current_password || req.body.currentPassword;
    const new_password = req.body.new_password || req.body.newPassword;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 128) {
      return res.status(400).json({ error: 'New password must be between 8 and 128 characters long.' });
    }

    const fullUser = await User.findByEmail(req.user.email);
    const valid = await bcrypt.compare(current_password, fullUser.password_hash);
    if (!valid) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'AUTH_PASSWORD_CHANGE_FAILED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'user',
        targetId: String(req.user.id),
        details: { reason: 'incorrect_current_password' }
      });
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await User.updatePassword(req.user.id, newHash);

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'AUTH_PASSWORD_CHANGED',
      severity: 'high',
      ip: req.ip,
      targetType: 'user',
      targetId: String(req.user.id)
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/mcp-key
router.post('/mcp-key', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let settings = {};
    if (user.settings_json) {
      try {
        settings = typeof user.settings_json === 'string' ? JSON.parse(user.settings_json) : user.settings_json;
      } catch (e) { settings = {}; }
    }

    if (!settings.mcp) settings.mcp = {};
    const newKey = 'fld_mcp_' + crypto.randomBytes(24).toString('hex');
    settings.mcp.apiKey = newKey;
    if (!settings.mcp.scope) settings.mcp.scope = 'read_only';
    if (!settings.mcp.enabledProjects) settings.mcp.enabledProjects = [];

    await User.updateProfile(req.user.id, { settings_json: settings });

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'MCP_API_KEY_ROTATED',
      severity: 'high',
      ip: req.ip,
      targetType: 'mcp_key',
      targetId: String(req.user.id),
      details: { keyPrefix: newKey.slice(0, 12) + '...' }
    });

    res.json({
      apiKey: newKey,
      mcp: {
        ...settings.mcp,
        apiKeyMasked: `${newKey.slice(0, 9)}...${newKey.slice(-4)}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/users/mcp-key
router.delete('/mcp-key', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let settings = {};
    if (user.settings_json) {
      try {
        settings = typeof user.settings_json === 'string' ? JSON.parse(user.settings_json) : user.settings_json;
      } catch (e) { settings = {}; }
    }
    if (!settings.mcp) settings.mcp = {};
    settings.mcp.apiKey = '';

    await User.updateProfile(req.user.id, { settings_json: settings });

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'MCP_API_KEY_REVOKED',
      severity: 'high',
      ip: req.ip,
      targetType: 'mcp_key',
      targetId: String(req.user.id)
    });

    res.json({ success: true, message: 'MCP API key has been revoked.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/security-events
router.get(['/security-events', '/me/security-events'], async (req, res, next) => {
  try {
    const events = await SecurityService.getAuditLogs({
      userId: req.user.id,
      eventType: req.query.event_type || null,
      limit: req.query.limit || 50
    });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/security-report
router.post(['/security-report', '/me/security-report'], async (req, res, next) => {
  try {
    const rate = SecurityService.checkRateLimit('security_report', String(req.user.id), 10, 60 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many security reports submitted recently. Please wait before submitting another.',
        retryAfterSeconds: rate.retryAfterSeconds
      });
    }

    const { target_type = 'workspace_entity', target_id = null, category = 'abuse', description } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return res.status(400).json({ error: 'A clear description (at least 5 characters) is required to submit a security or abuse report.' });
    }

    const allowedCategories = ['abuse', 'unauthorized_access', 'malicious_attachment', 'harmful_content', 'ai_safety', 'vulnerability', 'other'];
    const cleanCategory = allowedCategories.includes(category) ? category : 'other';
    const cleanDesc = description.trim().slice(0, 4000);

    let reportId = null;
    try {
      const result = await db.query(
        `INSERT INTO security_reports (reporter_user_id, target_type, target_id, category, description, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
        [req.user.id, String(target_type).slice(0, 64), target_id ? String(target_id).slice(0, 128) : null, cleanCategory, cleanDesc]
      );
      reportId = result && result.insertId ? result.insertId : Date.now();
    } catch (dbErr) {
      reportId = Date.now();
    }

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'SECURITY_REPORT_SUBMITTED',
      severity: 'warning',
      ip: req.ip,
      targetType: String(target_type),
      targetId: target_id ? String(target_id) : String(reportId),
      details: { reportId, category: cleanCategory, summary: cleanDesc.slice(0, 160) }
    });

    res.status(201).json({
      success: true,
      report: {
        id: reportId,
        reporter_user_id: req.user.id,
        target_type,
        target_id,
        category: cleanCategory,
        status: 'open',
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/me/export
router.get('/me/export', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [projects, boards, boardItems, notes, tasks, research, decisionLogs] = await Promise.all([
      db.query('SELECT * FROM projects WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM boards WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM board_items WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM notes WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM tasks WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM research_documents WHERE user_id = ?', [userId]),
      db.query('SELECT * FROM decision_logs WHERE user_id = ?', [userId])
    ]);

    await SecurityService.logSecurityEvent({
      userId,
      eventType: 'USER_DATA_EXPORTED',
      severity: 'info',
      ip: req.ip,
      targetType: 'user',
      targetId: String(userId)
    });

    const exportBundle = {
      product: 'Flowden',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      user: {
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.display_name
      },
      counts: {
        projects: projects.length,
        boards: boards.length,
        board_items: boardItems.length,
        notes: notes.length,
        tasks: tasks.length,
        research_documents: research.length,
        decision_logs: decisionLogs.length
      },
      data: {
        projects,
        boards,
        board_items: boardItems,
        notes,
        tasks,
        research_documents: research,
        decision_logs: decisionLogs
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="flowden-export-${Date.now()}.json"`);
    res.json(exportBundle);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
