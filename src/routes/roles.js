const express = require('express')
const prisma = require('../config/db')
const { auth, superAdminOnly } = require('../middleware/auth')

const router = express.Router()
router.use(auth)
router.use(superAdminOnly)

// GET /api/admin/roles
router.get('/', async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    })
    res.json({ success: true, data: { roles } })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/roles
router.post('/', async (req, res, next) => {
  try {
    const { name, permissions } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' })
    }
    const role = await prisma.role.create({
      data: {
        name: name.trim(),
        permissions: Array.isArray(permissions) ? permissions : [],
      },
    })
    res.status(201).json({ success: true, data: role })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Role name already exists' })
    }
    next(err)
  }
})

// PUT /api/admin/roles/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, permissions, isActive } = req.body
    const data = {}
    if (name !== undefined && name.trim()) data.name = name.trim()
    if (permissions !== undefined) data.permissions = Array.isArray(permissions) ? permissions : []
    if (isActive !== undefined) data.isActive = Boolean(isActive)
    const role = await prisma.role.update({ where: { id: req.params.id }, data })
    res.json({ success: true, data: role })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Role name already exists' })
    }
    next(err)
  }
})

// DELETE /api/admin/roles/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.role.delete({ where: { id: req.params.id } })
    res.json({ success: true, message: 'Role deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
