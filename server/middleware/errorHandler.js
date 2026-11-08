function errorHandler(err, req, res, next) {
  console.error('[Flowden-Error]', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  const statusCode = err.status || err.statusCode || 500;
  const response = {
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;

