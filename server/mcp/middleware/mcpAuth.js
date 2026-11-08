const crypto = require('crypto');
const db = require('../../config/database');
const SecurityService = require('../../services/securityService');

function safeCompareStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function mcpAuth(req, res, next) {
  try {
    const rate = SecurityService.checkRateLimit('mcp_request', req.ip || 'local', 60, 60 * 1000);
    if (!rate.allowed) {
      await SecurityService.logSecurityEvent({
        eventType: 'MCP_RATE_LIMITED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'mcp',
        details: { retryAfterSeconds: rate.retryAfterSeconds }
      });
      res.set('Retry-After', String(rate.retryAfterSeconds));
      return res.status(429).json({ error: 'MCP rate limit exceeded. Please slow down requests.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      await SecurityService.logSecurityEvent({
        eventType: 'MCP_AUTH_MISSING_TOKEN',
        severity: 'warning',
        ip: req.ip,
        targetType: 'mcp',
        targetId: req.originalUrl
      });
      return res.status(401).json({ error: 'Missing or invalid MCP Authorization Bearer token' });
    }

    const token = authHeader.slice(7).trim();
    if (!token || token.length < 16) {
      await SecurityService.logSecurityEvent({
        eventType: 'MCP_AUTH_INVALID_TOKEN',
        severity: 'warning',
        ip: req.ip,
        targetType: 'mcp'
      });
      return res.status(401).json({ error: 'Invalid MCP API key format' });
    }

    const users = await db.query('SELECT id, email, role, settings_json FROM users');
    let matchedUser = null;

    for (const u of users) {
      if (!u.settings_json) continue;
      let settings = u.settings_json;
      if (typeof settings === 'string') {
        try { settings = JSON.parse(settings); } catch (e) { continue; }
      }
      if (
        settings &&
        settings.mcp &&
        typeof settings.mcp.apiKey === 'string' &&
        settings.mcp.apiKey.length >= 16 &&
        safeCompareStrings(settings.mcp.apiKey, token)
      ) {
        matchedUser = {
          id: u.id,
          email: u.email,
          role: u.role,
          scope: settings.mcp.scope === 'read_write' ? 'read_write' : 'read_only',
          enabledProjects: Array.isArray(settings.mcp.enabledProjects)
            ? settings.mcp.enabledProjects.map(id => Number(id)).filter(Boolean)
            : [],
          projectFilterActive: true
        };
        break;
      }
    }

    if (!matchedUser) {
      await SecurityService.logSecurityEvent({
        eventType: 'MCP_AUTH_FAILED',
        severity: 'high',
        ip: req.ip,
        targetType: 'mcp',
        details: { path: req.originalUrl }
      });
      return res.status(401).json({ error: 'Invalid or revoked MCP API Key' });
    }

    req.mcpUser = matchedUser;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = mcpAuth;
