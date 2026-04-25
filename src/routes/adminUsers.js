const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../config/db')
const { auth, superAdminOnly } = require('../middleware/auth')

const router = express.Router()
router.use(auth)
router.use(superAdminOnly)

// GET /api/admin/users
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
    })
    const safe = users.map(({ password, ...u }) => ({
      ...u,
      roles: u.roles.map(ur => ur.role),
    }))
    res.json({ success: true, data: { users: safe } })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, roleIds, isActive } = req.body
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' })
    }
    if (password.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }
    const hashed = await bcrypt.hash(password.trim(), 10)
    const user = await prisma.adminUser.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashed,
        isActive: isActive !== false,
        roles: {
          create: (Array.isArray(roleIds) ? roleIds : []).map(roleId => ({ roleId })),
        },
      },
      include: {
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
    })
    const { password: _, ...safe } = user
    res.status(201).json({
      success: true,
      data: { ...safe, roles: safe.roles.map(ur => ur.role) },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Email already in use' })
    }
    next(err)
  }
})

// PUT /api/admin/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, password, roleIds, isActive } = req.body
    const data = {}
    if (name !== undefined && name.trim()) data.name = name.trim()
    if (email !== undefined && email.trim()) data.email = email.trim().toLowerCase()
    if (isActive !== undefined) data.isActive = Boolean(isActive)
    if (password !== undefined && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      }
      data.password = await bcrypt.hash(password.trim(), 10)
    }
    if (roleIds !== undefined && Array.isArray(roleIds)) {
      data.roles = {
        deleteMany: {},
        create: roleIds.map(roleId => ({ roleId })),
      }
    }
    const user = await prisma.adminUser.update({
      where: { id: req.params.id },
      data,
      include: {
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
    })
    const { password: _, ...safe } = user
    res.json({
      success: true,
      data: { ...safe, roles: safe.roles.map(ur => ur.role) },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Email already in use' })
    }
    next(err)
  }
})

// DELETE /api/admin/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.adminUser.delete({ where: { id: req.params.id } })
    res.json({ success: true, message: 'User deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
