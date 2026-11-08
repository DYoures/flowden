const db = require('../config/database');

class Board {
  static async enrichItem(item, userId) {
    if (!item) return item;
    const ownerId = userId || item.user_id;
    if (item.reference_type === 'note' && item.reference_id) {
      const nRows = await db.query(
        'SELECT id, title, content FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
        [item.reference_id, ownerId]
      );
      if (nRows && nRows[0]) {
        item.title = nRows[0].title;
        item.content = nRows[0].content;
        item.is_projection = true;
      }
    } else if (item.reference_type === 'task' && item.reference_id) {
      const tRows = await db.query(
        'SELECT id, title, description, status, priority FROM tasks WHERE id = ? AND user_id = ? LIMIT 1',
        [item.reference_id, ownerId]
      );
      if (tRows && tRows[0]) {
        item.title = tRows[0].title;
        item.content = tRows[0].description;
        item.status = tRows[0].status;
        item.priority = tRows[0].priority;
        item.is_projection = true;
      }
    }
    return item;
  }

  static async findByProject(projectId, userId) {
    return db.query(
      'SELECT * FROM boards WHERE project_id = ? AND user_id = ? ORDER BY id ASC',
      [projectId, userId]
    );
  }

  static async findById(id, userId) {
    const rows = await db.query(
      'SELECT * FROM boards WHERE id = ? AND user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!rows || rows.length === 0) return null;

    const board = rows[0];
    const items = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY z_index ASC, id ASC',
      [id]
    );

    for (const item of (items || [])) {
      await this.enrichItem(item, userId);
    }

    const groups = await db.query('SELECT * FROM board_groups WHERE board_id = ? ORDER BY id ASC', [id]);
    const connections = await db.query('SELECT * FROM board_item_connections WHERE board_id = ? ORDER BY id ASC', [id]);

    return {
      ...board,
      items: items || [],
      groups: groups || [],
      connections: connections || []
    };
  }

  static async updateViewport(id, userId, { zoom_level, viewport_x, viewport_y, grid_size }) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
    if (!board || board.length === 0) return null;

    const updates = [];
    const params = [];

    if (zoom_level !== undefined) {
      updates.push('zoom_level = ?');
      params.push(parseFloat(zoom_level));
    }
    if (viewport_x !== undefined) {
      updates.push('viewport_x = ?');
      params.push(parseFloat(viewport_x));
    }
    if (viewport_y !== undefined) {
      updates.push('viewport_y = ?');
      params.push(parseFloat(viewport_y));
    }
    if (grid_size !== undefined) {
      updates.push('grid_size = ?');
      params.push(parseInt(grid_size, 10));
    }

    if (updates.length === 0) return this.findById(id, userId);

    params.push(userId);
    params.push(id);
    await db.query(`UPDATE boards SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    return this.findById(id, userId);
  }

  static async createItem(boardId, userId, { item_type, reference_type = null, title, content, position_x = 0, position_y = 0, width = 240, height = 160, color = null, group_id = null, reference_id = null }) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    let finalTitle = title ? title.trim() : 'Untitled Card';
    let finalContent = content || '';
    let safeReferenceId = reference_id;

    if (reference_type === 'note' && reference_id) {
      const nRows = await db.query(
        'SELECT title, content FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
        [reference_id, userId]
      );
      if (nRows && nRows[0]) {
        finalTitle = nRows[0].title;
        finalContent = nRows[0].content;
      } else {
        safeReferenceId = null;
      }
    } else if (reference_type === 'task' && reference_id) {
      const tRows = await db.query(
        'SELECT title, description FROM tasks WHERE id = ? AND user_id = ? LIMIT 1',
        [reference_id, userId]
      );
      if (tRows && tRows[0]) {
        finalTitle = tRows[0].title;
        finalContent = tRows[0].description;
      } else {
        safeReferenceId = null;
      }
    }

    const result = await db.query(
      'INSERT INTO board_items (board_id, user_id, item_type, reference_type, title, content, position_x, position_y, width, height, color, group_id, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [boardId, userId, item_type || (reference_type || 'note'), reference_type || null, finalTitle, finalContent, position_x, position_y, width, height, color, group_id, safeReferenceId]
    );

    const rows = await db.query('SELECT * FROM board_items WHERE id = ? LIMIT 1', [result.insertId]);
    return await this.enrichItem(rows[0], userId);
  }

  static async updateItem(itemId, boardId, userId, data) {
    const itemRows = await db.query('SELECT id FROM board_items WHERE id = ? AND board_id = ? AND user_id = ? LIMIT 1', [itemId, boardId, userId]);
    if (!itemRows || itemRows.length === 0) {
      const err = new Error('Item not found or unauthorized');
      err.status = 404;
      throw err;
    }

    const updates = [];
    const params = [];

    const allowed = ['title', 'content', 'item_type', 'reference_type', 'position_x', 'position_y', 'width', 'height', 'color', 'z_index', 'group_id', 'reference_id'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (updates.length > 0) {
      params.push(boardId);
      params.push(itemId);
      await db.query(`UPDATE board_items SET ${updates.join(', ')} WHERE board_id = ? AND id = ?`, params);
    }

    const rows = await db.query('SELECT * FROM board_items WHERE id = ? LIMIT 1', [itemId]);
    return await this.enrichItem(rows[0], userId);
  }

  static async deleteItem(itemId, boardId, userId) {
    const itemRows = await db.query('SELECT id FROM board_items WHERE id = ? AND board_id = ? AND user_id = ? LIMIT 1', [itemId, boardId, userId]);
    if (!itemRows || itemRows.length === 0) {
      const err = new Error('Item not found or unauthorized');
      err.status = 404;
      throw err;
    }

    await db.query('DELETE FROM board_item_connections WHERE source_item_id = ?', [itemId]);
    await db.query('DELETE FROM board_item_connections WHERE target_item_id = ?', [itemId]);
    await db.query('DELETE FROM board_items WHERE id = ?', [itemId]);
    return true;
  }

  static async batchUpdateItemPositions(boardId, userId, positions) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    for (const pos of positions) {
      const updates = [];
      const params = [];
      if (pos.position_x !== undefined) { updates.push('position_x = ?'); params.push(pos.position_x); }
      if (pos.position_y !== undefined) { updates.push('position_y = ?'); params.push(pos.position_y); }
      if (pos.width !== undefined) { updates.push('width = ?'); params.push(pos.width); }
      if (pos.height !== undefined) { updates.push('height = ?'); params.push(pos.height); }
      if (pos.z_index !== undefined) { updates.push('z_index = ?'); params.push(pos.z_index); }

      if (updates.length > 0) {
        params.push(boardId);
        params.push(userId);
        params.push(pos.id);
        await db.query(`UPDATE board_items SET ${updates.join(', ')} WHERE board_id = ? AND user_id = ? AND id = ?`, params);
      }
    }
    return true;
  }

  static async createGroup(boardId, userId, { title, color = '#7c5cbf', position_x = 0, position_y = 0, width = 440, height = 320 }) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    const result = await db.query(
      'INSERT INTO board_groups (board_id, title, color, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [boardId, (title || '').trim() || 'New Group', color, position_x, position_y, width, height]
    );

    const rows = await db.query('SELECT * FROM board_groups WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  }

  static async updateGroup(groupId, boardId, userId, data) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    const allowed = ['title', 'color', 'position_x', 'position_y', 'width', 'height'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (updates.length > 0) {
      params.push(boardId);
      params.push(groupId);
      await db.query(`UPDATE board_groups SET ${updates.join(', ')} WHERE board_id = ? AND id = ?`, params);
    }
    const rows = await db.query('SELECT * FROM board_groups WHERE id = ? AND board_id = ? LIMIT 1', [groupId, boardId]);
    return rows[0];
  }

  static async deleteGroup(groupId, boardId, userId) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    await db.query('UPDATE board_items SET group_id = NULL WHERE group_id = ? AND board_id = ?', [groupId, boardId]);
    await db.query('DELETE FROM board_groups WHERE id = ? AND board_id = ?', [groupId, boardId]);
    return true;
  }

  static async createConnection(boardId, userId, { source_item_id, target_item_id, connection_type = 'related_to', label = null }) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    const existing = await db.query(
      'SELECT * FROM board_item_connections WHERE board_id = ?',
      [boardId]
    );
    const existingConn = (existing || []).find(c =>
      (Number(c.source_item_id) === Number(source_item_id) && Number(c.target_item_id) === Number(target_item_id)) ||
      (Number(c.source_item_id) === Number(target_item_id) && Number(c.target_item_id) === Number(source_item_id))
    );

    if (existingConn) {
      if (label && label !== existingConn.label) {
        await db.query(
          'UPDATE board_item_connections SET label = ?, connection_type = ? WHERE id = ?',
          [label, connection_type, existingConn.id]
        );
        const updated = await db.query('SELECT * FROM board_item_connections WHERE id = ? LIMIT 1', [existingConn.id]);
        return updated[0] || existingConn;
      }
      return existingConn;
    }

    const result = await db.query(
      'INSERT INTO board_item_connections (board_id, source_item_id, target_item_id, connection_type, label) VALUES (?, ?, ?, ?, ?)',
      [boardId, source_item_id, target_item_id, connection_type, label]
    );

    const rows = await db.query('SELECT * FROM board_item_connections WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  }

  static async deleteConnection(connId, boardId, userId) {
    const board = await db.query('SELECT id FROM boards WHERE id = ? AND user_id = ? LIMIT 1', [boardId, userId]);
    if (!board || board.length === 0) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }

    await db.query('DELETE FROM board_item_connections WHERE id = ? AND board_id = ?', [connId, boardId]);
    return true;
  }
}

module.exports = Board;
