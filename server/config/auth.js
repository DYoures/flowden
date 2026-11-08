module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'flowden-spatial-workspace-secret-key-2026-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: 'flowden_token',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

