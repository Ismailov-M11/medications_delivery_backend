const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided. Authorization denied.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded contains { id, role, iat, exp }
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token is invalid or expired.',
    });
  }
};

// Middleware that restricts to a specific role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: insufficient permissions.',
      });
    }
    next();
  };
};

module.exports = { auth, requireRole };
