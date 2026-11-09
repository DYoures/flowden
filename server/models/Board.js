const db = require('../config/database');

function stripMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/^#+\s+/gm, '') // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code blocks / inline
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // wikilinks
    .replace(/^\s*[-*+]\s+/gm, '') // bullet lists
    .replace(/^\s*\d+\.\s+/gm, '') // numbered lists
    .replace(/^\s*>\s+/gm, '') // blockquotes
    .replace(/\s+/g, ' ')
    .trim();
}

class Board {
  static async getBoardAccess(boardId, userId, dbOrConn = null) {
    const executor = dbOrConn || db;
    const uid = Number(userId);
    const bid = Number(boardId);
    if (!uid || !bid) return { allowed: false, canMutate: false, role: 'none', board: null };

    const rows = await executor.query('SELECT * FROM boards WHERE id = ? LIMIT 1', [bid]);
    if (!rows || rows.length === 0) {
      return { allowed: false, canMutate: false, role: 'none', board: null };
    }
    const board = rows[0];

    // Personal board (project_id IS NULL)
    if (!board.project_id) {
      if (Number(board.user_id) === uid) {
        return { allowed: true, canMutate: true, role: 'owner', board };
      }
      return { allowed: false, canMutate: false, role: 'none', board: null };
    }

    // Project board
    const projRows = await executor.query(
      `SELECT p.id, p.user_id AS owner_id, pm.role, pm.revoked_at
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE p.id = ? LIMIT 1`,
      [uid, board.project_id]
    );

    if (!projRows || projRows.length === 0) {
      return { allowed: false, canMutate: false, role: 'none', board: null };
    }

    const proj = projRows[0];
    const isOwner = Number(proj.owner_id) === uid || proj.role === 'owner';
    const isEditor = proj.role === 'editor';
    const isViewer = proj.role === 'viewer';

    if (isOwner) {
      return { allowed: true, canMutate: true, role: 'owner', board };
    }
    if (isEditor) {
      return { allowed: true, canMutate: true, role: 'editor', board };
    }
    if (isViewer) {
      return { allowed: true, canMutate: false, role: 'viewer', board };
    }

    return { allowed: false, canMutate: false, role: 'none', board: null };
  }

  static async enrichItem(item, userId, boardProjectId = null) {
    if (!item) return item;
    const uid = Number(userId);

    if (item.reference_type === 'note' && item.reference_id) {
      const nRows = await db.query(
        `SELECT n.id, n.title, n.content, n.project_id, n.user_id
         FROM notes n
         LEFT JOIN project_members pm ON pm.project_id = n.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE n.id = ? AND n.deleted_at IS NULL AND (n.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [uid, item.reference_id, uid]
      );

      if (nRows && nRows[0]) {
        const note = nRows[0];
        if (boardProjectId && note.project_id && Number(note.project_id) !== Number(boardProjectId) && Number(note.user_id) !== uid) {
          item.title = 'Unavailable Reference';
          item.content = 'Referenced content is unavailable or private.';
          item.is_projection = true;
          item.is_available = false;
        } else {
          item.title = note.title;
          item.content = stripMarkdown(note.content).slice(0, 200);
          item.is_projection = true;
          item.is_available = true;
        }
      } else {
        item.title = 'Unavailable Reference';
        item.content = 'Referenced content is unavailable or private.';
        item.is_projection = true;
        item.is_available = false;
      }
    } else if (item.reference_type === 'task' && item.reference_id) {
      const tRows = await db.query(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.project_id, t.user_id
         FROM tasks t
         LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE t.id = ? AND (t.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [uid, item.reference_id, uid]
      );

      if (tRows && tRows[0]) {
        const task = tRows[0];
        if (boardProjectId && task.project_id && Number(task.project_id) !== Number(boardProjectId) && Number(task.user_id) !== uid) {
          item.title = 'Unavailable Reference';
          item.content = 'Referenced content is unavailable or private.';
          item.is_projection = true;
          item.is_available = false;
        } else {
          item.title = task.title;
          item.content = stripMarkdown(task.description).slice(0, 200);
          item.status = task.status;
          item.priority = task.priority;
          item.is_projection = true;
          item.is_available = true;
        }
      } else {
        item.title = 'Unavailable Reference';
        item.content = 'Referenced content is unavailable or private.';
        item.is_projection = true;
        item.is_available = false;
      }
    } else if (item.reference_type === 'research' && item.reference_id) {
      const rRows = await db.query(
        `SELECT r.id, r.title, r.summary, r.content_text, r.project_id, r.user_id
         FROM research_documents r
         LEFT JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE r.id = ? AND r.deleted_at IS NULL AND (r.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [uid, item.reference_id, uid]
      );

      if (rRows && rRows[0]) {
        const doc = rRows[0];
        if (boardProjectId && doc.project_id && Number(doc.project_id) !== Number(boardProjectId) && Number(doc.user_id) !== uid) {
          item.title = 'Unavailable Reference';
          item.content = 'Referenced content is unavailable or private.';
          item.is_projection = true;
          item.is_available = false;
        } else {
          item.title = doc.title;
          item.content = stripMarkdown(doc.summary || doc.content_text).slice(0, 200);
          item.is_projection = true;
          item.is_available = true;
        }
      } else {
        item.title = 'Unavailable Reference';
        item.content = 'Referenced content is unavailable or private.';
        item.is_projection = true;
        item.is_available = false;
      }
    }
    return item;
  }

  static async findByProject(projectId, userId) {
    const uid = Number(userId);
    const pid = Number(projectId);
    if (!uid || !pid) return [];

    const projRows = await db.query(
      `SELECT p.id
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE p.id = ? AND (p.user_id = ? OR pm.id IS NOT NULL)
       LIMIT 1`,
      [uid, pid, uid]
    );

    if (!projRows || projRows.length === 0) {
      return [];
    }

    return db.query(
      'SELECT * FROM boards WHERE project_id = ? ORDER BY id ASC',
      [pid]
    );
  }

  static async findById(id, userId) {
    const access = await this.getBoardAccess(id, userId);
    if (!access.allowed) return null;

    const board = access.board;
    const items = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY z_index ASC, id ASC',
      [id]
    );

    for (const item of (items || [])) {
      await this.enrichItem(item, userId, board.project_id);
    }

    const groups = await db.query('SELECT * FROM board_groups WHERE board_id = ? ORDER BY id ASC', [id]);
    const connections = await db.query('SELECT * FROM board_item_connections WHERE board_id = ? ORDER BY id ASC', [id]);

    return {
      ...board,
      can_mutate: access.canMutate,
      user_role: access.role,
      items: items || [],
      groups: groups || [],
      connections: connections || []
    };
  }

  static async updateViewport(id, userId, { zoom_level, viewport_x, viewport_y, grid_size }) {
    const access = await this.getBoardAccess(id, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

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

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE boards SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return this.findById(id, userId);
  }

  static async createItem(boardId, userId, { item_type, reference_type = null, title, content, position_x = 0, position_y = 0, width = 240, height = 160, color = null, group_id = null, reference_id = null }) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

    const board = access.board;
    let finalTitle = title ? title.trim() : 'Untitled Card';
    let finalContent = content ? stripMarkdown(content).slice(0, 200) : '';
    let safeReferenceId = reference_id;

    if (reference_type === 'note' && reference_id) {
      const nRows = await db.query(
        `SELECT n.id, n.title, n.content, n.project_id, n.user_id
         FROM notes n
         LEFT JOIN project_members pm ON pm.project_id = n.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE n.id = ? AND n.deleted_at IS NULL AND (n.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [userId, reference_id, userId]
      );
      if (nRows && nRows[0]) {
        const note = nRows[0];
        if (board.project_id && note.project_id && Number(note.project_id) !== Number(board.project_id) && Number(note.user_id) !== Number(userId)) {
          safeReferenceId = null;
        } else {
          finalTitle = note.title;
          finalContent = stripMarkdown(note.content).slice(0, 200);
        }
      } else {
        safeReferenceId = null;
      }
    } else if (reference_type === 'task' && reference_id) {
      const tRows = await db.query(
        `SELECT t.id, t.title, t.description, t.project_id, t.user_id
         FROM tasks t
         LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE t.id = ? AND (t.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [userId, reference_id, userId]
      );
      if (tRows && tRows[0]) {
        const task = tRows[0];
        if (board.project_id && task.project_id && Number(task.project_id) !== Number(board.project_id) && Number(task.user_id) !== Number(userId)) {
          safeReferenceId = null;
        } else {
          finalTitle = task.title;
          finalContent = stripMarkdown(task.description).slice(0, 200);
        }
      } else {
        safeReferenceId = null;
      }
    }

    const result = await db.query(
      'INSERT INTO board_items (board_id, user_id, item_type, reference_type, title, content, position_x, position_y, width, height, color, group_id, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [boardId, userId, item_type || (reference_type || 'note'), reference_type || null, finalTitle, finalContent, position_x, position_y, width, height, color, group_id, safeReferenceId]
    );

    const rows = await db.query('SELECT * FROM board_items WHERE id = ? LIMIT 1', [result.insertId]);
    return await this.enrichItem(rows[0], userId, board.project_id);
  }

  static async updateItem(itemId, boardId, userId, data) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

    const itemRows = await db.query('SELECT id FROM board_items WHERE id = ? AND board_id = ? LIMIT 1', [itemId, boardId]);
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
        let val = data[key];
        if (key === 'content' && typeof val === 'string') {
          val = stripMarkdown(val).slice(0, 200);
        }
        params.push(val);
      }
    }

    if (updates.length > 0) {
      params.push(boardId);
      params.push(itemId);
      await db.query(`UPDATE board_items SET ${updates.join(', ')} WHERE board_id = ? AND id = ?`, params);
    }

    const rows = await db.query('SELECT * FROM board_items WHERE id = ? LIMIT 1', [itemId]);
    return await this.enrichItem(rows[0], userId, access.board.project_id);
  }

  static async deleteItem(itemId, boardId, userId) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

    const itemRows = await db.query('SELECT id FROM board_items WHERE id = ? AND board_id = ? LIMIT 1', [itemId, boardId]);
    if (!itemRows || itemRows.length === 0) {
      const err = new Error('Item not found or unauthorized');
      err.status = 404;
      throw err;
    }

    await db.query('DELETE FROM board_item_connections WHERE source_item_id = ? OR target_item_id = ?', [itemId, itemId]);
    await db.query('DELETE FROM board_items WHERE id = ?', [itemId]);
    return true;
  }

  static async batchUpdateItemPositions(boardId, userId, positions) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
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
        params.push(pos.id);
        await db.query(`UPDATE board_items SET ${updates.join(', ')} WHERE board_id = ? AND id = ?`, params);
      }
    }
    return true;
  }

  static async createGroup(boardId, userId, { title, color = '#7c5cbf', position_x = 0, position_y = 0, width = 440, height = 320 }) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
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
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
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
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

    await db.query('UPDATE board_items SET group_id = NULL WHERE group_id = ? AND board_id = ?', [groupId, boardId]);
    await db.query('DELETE FROM board_groups WHERE id = ? AND board_id = ?', [groupId, boardId]);
    return true;
  }

  static async createConnection(boardId, userId, { source_item_id, target_item_id, connection_type = 'related_to', label = null }) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
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

    // Visual connection only - never touches entity_links
    const result = await db.query(
      'INSERT INTO board_item_connections (board_id, source_item_id, target_item_id, connection_type, label) VALUES (?, ?, ?, ?, ?)',
      [boardId, source_item_id, target_item_id, connection_type, label]
    );

    const rows = await db.query('SELECT * FROM board_item_connections WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  }

  static async deleteConnection(connId, boardId, userId) {
    const access = await this.getBoardAccess(boardId, userId);
    if (!access.allowed) {
      const err = new Error('Board not found or unauthorized');
      err.status = 404;
      throw err;
    }
    if (!access.canMutate) {
      const err = new Error('Forbidden: Insufficient permissions to modify this board');
      err.status = 403;
      throw err;
    }

    await db.query('DELETE FROM board_item_connections WHERE id = ? AND board_id = ?', [connId, boardId]);
    return true;
  }
}

module.exports = Board;
