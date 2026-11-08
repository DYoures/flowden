const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const SecurityService = require('../services/securityService');

const router = express.Router();

function signToken(user, tokenVersion = 1) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      token_version: Number(tokenVersion) || 1
    },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn }
  );
}

function sanitizeUserResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url || null,
    role: user.role,
    theme_preference: user.theme_preference || 'dark',
    created_at: user.created_at
  };
}

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const rate = SecurityService.checkRateLimit('auth_register', req.ip || 'local', 20, 15 * 60 * 1000);
    if (!rate.allowed) {
      await SecurityService.logSecurityEvent({
        eventType: 'AUTH_REGISTER_RATE_LIMITED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'auth',
        details: { retryAfterSeconds: rate.retryAfterSeconds }
      });
      res.set('Retry-After', String(rate.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many registration attempts. Please try again shortly.',
        retryAfterSeconds: rate.retryAfterSeconds
      });
    }

    const { email, password, display_name, username } = req.body || {};
    const finalDisplayName = (display_name || username || '').trim();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters in length.' });
    }
    if (!finalDisplayName) {
      return res.status(400).json({ error: 'Display name is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Hash password with 12 salt rounds
    const password_hash = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      email: cleanEmail,
      password_hash,
      display_name: finalDisplayName.slice(0, 100)
    });

    const tokenVersion = await SecurityService.getUserTokenVersion(newUser.id);
    const token = signToken(newUser, tokenVersion);

    await SecurityService.logSecurityEvent({
      userId: newUser.id,
      eventType: 'AUTH_REGISTER_SUCCESS',
      severity: 'info',
      ip: req.ip,
      targetType: 'user',
      targetId: String(newUser.id),
      details: { email: newUser.email, display_name: newUser.display_name }
    });

    res.status(201).json({
      message: 'Your account has been created successfully. Please log in to access your Flowden workspace.',
      user: sanitizeUserResponse(newUser),
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const limitStatus = SecurityService.checkLoginRateLimit(req.ip, cleanEmail);
    if (!limitStatus.allowed) {
      await SecurityService.logSecurityEvent({
        eventType: 'AUTH_LOGIN_RATE_LIMITED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'auth',
        targetId: cleanEmail,
        details: { retryAfterSeconds: limitStatus.retryAfterSeconds, attempts: limitStatus.attempts }
      });
      res.set('Retry-After', String(limitStatus.retryAfterSeconds));
      return res.status(429).json({
        error: `Too many failed login attempts. Temporary cooldown active for ${limitStatus.retryAfterSeconds}s.`,
        retryAfterSeconds: limitStatus.retryAfterSeconds
      });
    }

    const user = await User.findByEmail(cleanEmail);
    if (!user) {
      SecurityService.recordLoginFailure(req.ip, cleanEmail);
      await SecurityService.logSecurityEvent({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'auth',
        targetId: cleanEmail,
        details: { reason: 'invalid_credentials' }
      });
      return res.status(401).json({ error: 'Invalid email or password credentials.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      SecurityService.recordLoginFailure(req.ip, cleanEmail);
      await SecurityService.logSecurityEvent({
        userId: user.id,
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        ip: req.ip,
        targetType: 'user',
        targetId: String(user.id),
        details: { reason: 'invalid_credentials' }
      });
      return res.status(401).json({ error: 'Invalid email or password credentials.' });
    }

    SecurityService.clearLoginFailures(req.ip, cleanEmail);
    const tokenVersion = await SecurityService.getUserTokenVersion(user.id);
    const token = signToken(user, tokenVersion);
    res.cookie(authConfig.cookieName, token, authConfig.cookieOptions);

    await SecurityService.logSecurityEvent({
      userId: user.id,
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'info',
      ip: req.ip,
      targetType: 'user',
      targetId: String(user.id),
      details: { email: user.email }
    });

    res.json({
      message: 'Authentication successful.',
      user: sanitizeUserResponse(user),
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res) => {
  let token = req.cookies && req.cookies[authConfig.cookieName];
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7).trim();
  }
  if (token) {
    SecurityService.revokeSpecificToken(token);
  }
  res.clearCookie(authConfig.cookieName, authConfig.cookieOptions);
  await SecurityService.logSecurityEvent({
    eventType: 'AUTH_LOGOUT',
    severity: 'info',
    ip: req.ip,
    targetType: 'session'
  });
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/v1/auth/revoke-sessions
router.post('/revoke-sessions', authenticateToken, async (req, res, next) => {
  try {
    if (req.authToken) {
      SecurityService.revokeSpecificToken(req.authToken);
    }
    const newVersion = await SecurityService.revokeAllUserSessions(req.user.id);
    res.clearCookie(authConfig.cookieName, authConfig.cookieOptions);

    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'AUTH_SESSIONS_REVOKED',
      severity: 'high',
      ip: req.ip,
      targetType: 'user',
      targetId: String(req.user.id),
      details: { new_token_version: newVersion }
    });

    res.json({
      success: true,
      message: 'All active sessions and tokens for this account have been revoked.',
      token_version: newVersion
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      display_name: req.user.display_name,
      avatar_url: req.user.avatar_url,
      role: req.user.role,
      theme_preference: req.user.theme_preference,
      settings_json: req.user.settings_json,
      created_at: req.user.created_at
    }
  });
});

module.exports = router;
