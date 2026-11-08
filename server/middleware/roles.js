function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({
        error: `Access denied. '${requiredRole}' privileges required.`,
        code: 'FORBIDDEN'
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireAdmin: requireRole('admin')
};

