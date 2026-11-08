const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const User = require('../models/User');
const SecurityService = require('../services/securityService');

async function authenticateToken(req, res, next) {
  let token = null;
  let usedCookieAuth = false;

  if (req.cookies && req.cookies[authConfig.cookieName]) {
    token = req.cookies[authConfig.cookieName];
    usedCookieAuth = true;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7).trim();
    usedCookieAuth = false;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // CSRF Origin validation for state-mutating cookie-authenticated requests
  if (usedCookieAuth && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers['origin'];
    const host = req.headers['host'];
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          await SecurityService.logSecurityEvent({
            eventType: 'CSRF_ORIGIN_REJECTED',
            severity: 'warning',
            ip: req.ip,
            targetType: 'endpoint',
            targetId: req.originalUrl,
            details: { origin, host, method: req.method }
          });
          return res.status(403).json({
            error: 'Cross-origin state-mutating request rejected',
            code: 'CSRF_ORIGIN_REJECTED'
          });
        }
      } catch (e) {
        return res.status(403).json({ error: 'Invalid Origin header' });
      }
    }
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    const revoked = await SecurityService.isTokenRevoked(token, decoded);
    if (revoked) {
      res.clearCookie(authConfig.cookieName, authConfig.cookieOptions);
      await SecurityService.logSecurityEvent({
        userId: decoded.id,
        eventType: 'AUTH_REVOKED_TOKEN_USED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'session',
        targetId: String(decoded.id),
        details: { path: req.originalUrl }
      });
      return res.status(401).json({
        error: 'Session has been revoked or expired. Please sign in again.',
        code: 'SESSION_REVOKED'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.clearCookie(authConfig.cookieName, authConfig.cookieOptions);
      return res.status(401).json({
        error: 'User account not found',
        code: 'USER_NOT_FOUND'
      });
    }

    delete user.password_hash;
    req.user = user;
    req.authToken = token;
    next();
  } catch (err) {
    res.clearCookie(authConfig.cookieName, authConfig.cookieOptions);
    return res.status(401).json({
      error: 'Invalid or expired session',
      code: 'INVALID_TOKEN'
    });
  }
}

module.exports = authenticateToken;
