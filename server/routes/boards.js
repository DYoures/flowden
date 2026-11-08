const express = require('express');
const Board = require('../models/Board');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/boards/project/:projectId
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const boards = await Board.findByProject(req.params.projectId, req.user.id);
    res.json({ boards });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/boards/:id
router.get('/:id', async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id, req.user.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found or unauthorized' });
    }
    res.json({ board });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/boards/:id/viewport
router.put('/:id/viewport', async (req, res, next) => {
  try {
    const { zoom_level, viewport_x, viewport_y, grid_size } = req.body;
    const updated = await Board.updateViewport(req.params.id, req.user.id, {
      zoom_level,
      viewport_x,
      viewport_y,
      grid_size
    });
    res.json({ board: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/boards/:id/items
router.post('/:id/items', async (req, res, next) => {
  try {
    const item = await Board.createItem(req.params.id, req.user.id, req.body);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/boards/:id/items/batch
router.put('/:id/items/batch', async (req, res, next) => {
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions)) {
      return res.status(400).json({ error: 'Positions array required' });
    }
    await Board.batchUpdateItemPositions(req.params.id, req.user.id, positions);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/boards/:id/items/:itemId
router.put('/:id/items/:itemId', async (req, res, next) => {
  try {
    const item = await Board.updateItem(req.params.itemId, req.params.id, req.user.id, req.body);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/boards/:id/items/:itemId
router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    await Board.deleteItem(req.params.itemId, req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/boards/:id/groups
router.post('/:id/groups', async (req, res, next) => {
  try {
    const group = await Board.createGroup(req.params.id, req.user.id, req.body);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/boards/:id/groups/:groupId
router.put('/:id/groups/:groupId', async (req, res, next) => {
  try {
    const group = await Board.updateGroup(req.params.groupId, req.params.id, req.user.id, req.body);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/boards/:id/groups/:groupId
router.delete('/:id/groups/:groupId', async (req, res, next) => {
  try {
    await Board.deleteGroup(req.params.groupId, req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/boards/:id/connections
router.post('/:id/connections', async (req, res, next) => {
  try {
    const connection = await Board.createConnection(req.params.id, req.user.id, req.body);
    res.status(201).json({ connection });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/boards/:id/connections/:connId
router.delete('/:id/connections/:connId', async (req, res, next) => {
  try {
    await Board.deleteConnection(req.params.connId, req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
