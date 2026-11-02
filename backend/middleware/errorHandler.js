function errorHandler(err, req, res, next) {
  console.error('[Error]', err);

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ detail: 'File too large. Maximum size allowed is 10MB.' });
    }
    return res.status(400).json({ detail: `Upload error: ${err.message}` });
  }

  // Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(400).json({ detail: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({ detail: messages.join(', ') });
  }

  // Status code already assigned or default 500
  const statusCode = err.statusCode || res.statusCode !== 200 ? res.statusCode : 500;
  return res.status(statusCode >= 400 ? statusCode : 500).json({
    detail: err.message || 'Internal server error. Please try again later.'
  });
}

module.exports = errorHandler;

