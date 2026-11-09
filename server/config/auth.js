const crypto = require('crypto');

const OLD_KNOWN_DEFAULT = 'flowden-spatial-workspace-secret-key-2026-production';
const MIN_SECRET_BYTES = 32;

/**
 * Resolves the JWT secret with strict production security invariants:
 * 1. In production (NODE_ENV=production), JWT_SECRET is strictly required.
 *    Missing, empty, short (< 32 bytes), or legacy default values throw immediately.
 * 2. In development and test environments, an explicit valid secret is preferred.
 *    If unset, empty, or set to the legacy default, a process-local cryptographically
 *    random secret is generated to avoid any static default leakage across environments.
 * 3. Secret values are never printed or logged.
 */
function resolveJwtSecret(customEnv = process.env) {
  const envSecret = customEnv.JWT_SECRET ? String(customEnv.JWT_SECRET).trim() : '';
  const isProduction = customEnv.NODE_ENV === 'production';

  if (isProduction) {
    if (!envSecret) {
      throw new Error('[SECURITY CRITICAL] JWT_SECRET environment variable is missing or empty in production.');
    }
    if (envSecret === OLD_KNOWN_DEFAULT) {
      throw new Error('[SECURITY CRITICAL] JWT_SECRET must not use the insecure legacy default value in production. Set a secure, unique secret.');
    }
    if (Buffer.byteLength(envSecret, 'utf8') < MIN_SECRET_BYTES) {
      throw new Error(`[SECURITY CRITICAL] JWT_SECRET must provide at least ${MIN_SECRET_BYTES} bytes of entropy in production.`);
    }
    return envSecret;
  }

  // Development and Test environments
  if (envSecret && envSecret !== OLD_KNOWN_DEFAULT) {
    return envSecret;
  }

  // If unset, empty, or equal to the insecure legacy default, generate a process-local random secret
  if (!global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__) {
    global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__ = crypto.randomBytes(32).toString('hex');
  }
  return global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__;
}

module.exports = {
  get jwtSecret() {
    return resolveJwtSecret();
  },
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: 'flowden_token',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  _resolveJwtSecret: resolveJwtSecret,
  _OLD_KNOWN_DEFAULT: OLD_KNOWN_DEFAULT,
  _MIN_SECRET_BYTES: MIN_SECRET_BYTES
};
