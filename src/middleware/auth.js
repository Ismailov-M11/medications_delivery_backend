const jwt = require('jsonwebtoken')

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' })
  }
  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // { id, role, isSuperAdmin?, permissions? }
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }
    next()
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next()
    if (!req.user?.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ success: false, message: `Missing permission: ${permission}` })
    }
    next()
  }
}

function superAdminOnly(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Super admin access required' })
  }
  next()
}

module.exports = { auth, requireRole, requirePermission, superAdminOnly }
