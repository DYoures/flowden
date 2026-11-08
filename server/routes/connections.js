const express = require('express');
const Connection = require('../models/Connection');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/connections
router.get('/', async (req, res, next) => {
  try {
    const { source_type, source_id } = req.query;
    const connections = await Connection.findAll(req.user.id, {
      source_type,
      source_id: source_id ? parseInt(source_id, 10) : null
    });
    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/connections
router.post('/', async (req, res, next) => {
  try {
    const connection = await Connection.create(req.user.id, req.body);
    res.status(201).json({ connection });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/connections/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await Connection.delete(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

