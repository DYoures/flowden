// server/services/boardService.js
const { canManageSql } = require('../utils/authPredicates');

async function deleteBoard(pool, userId, boardId) {
  const conn = await pool.getConnection();
  let destroy = false;
  try {
    await conn.beginTransaction();
    const ts = new Date();
    const auth = canManageSql('b', userId, 'board');

    // 1) Soft-delete root board with authorization and affectedRows check
    const [p] = await conn.query(
      `UPDATE boards b SET b.deleted_at = ?
        WHERE b.id = ? AND b.deleted_at IS NULL AND ${auth.sql}`,
      [ts, boardId, ...auth.params]
    );
    if (p.affectedRows !== 1) {
      throw new Error('NOT_FOUND_OR_FORBIDDEN');
    }

    // Resolve canonical entities row for root board
    const [eRows] = await conn.query(
      'SELECT id AS eid FROM entities WHERE entity_type = "board" AND entity_id = ?',
      [boardId]
    );
    const rootEid = eRows && eRows[0] ? eRows[0].eid : null;
    if (rootEid) {
      await conn.query(
        'UPDATE entities SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
        [ts, rootEid]
      );
    }

    // 2) Find active descendant boards (traversal stops at already-deleted children)
    // Collect active descendant board IDs into a JS array
    const activeDescendants = [];
    let queue = [boardId];
    while (queue.length > 0) {
      const currentParentId = queue.shift();
      const [children] = await conn.query(
        'SELECT id FROM boards WHERE parent_board_id = ? AND deleted_at IS NULL',
        [currentParentId]
      );
      for (const child of children) {
        activeDescendants.push(child.id);
        queue.push(child.id);
      }
    }

    const allAffectedBoardIds = [boardId, ...activeDescendants];

    // Mark active descendant boards with provenance marker = boardId
    if (activeDescendants.length > 0) {
      await conn.query(
        `UPDATE boards SET deleted_at = ?, cascade_deleted_by = ?
          WHERE id IN (?) AND deleted_at IS NULL`,
        [ts, boardId, activeDescendants]
      );

      // Soft-delete corresponding entities for descendant boards
      if (rootEid) {
        await conn.query(
          `UPDATE entities SET deleted_at = ?, cascade_deleted_by = ?
            WHERE entity_type = 'board' AND entity_id IN (?) AND deleted_at IS NULL`,
          [ts, rootEid, activeDescendants]
        );
      }
    }

    // 3) Board items on all affected boards:
    // - NATIVE cards (reference_id IS NULL): soft-delete in board_items AND entities (if registered)
    // - PROJECTED notes/tasks (reference_id IS NOT NULL): ONLY the board_items projection row goes to Trash;
    //   underlying entities row stays ACTIVE!
    for (const bId of allAffectedBoardIds) {
      // Mark active board_items with cascade_deleted_by = boardId
      await conn.query(
        `UPDATE board_items SET deleted_at = ?, cascade_deleted_by = ?
          WHERE board_id = ? AND deleted_at IS NULL`,
        [ts, boardId, bId]
      );

      // If native cards had an entities row, soft delete it; for projected items (note, task), DO NOT touch entities!
      await conn.query(
        `UPDATE entities e JOIN board_items bi ON bi.reference_type = 'board_card' AND bi.id = e.entity_id AND e.entity_type = 'board_card'
            SET e.deleted_at = ?, e.cascade_deleted_by = ?
          WHERE bi.board_id = ? AND bi.cascade_deleted_by = ? AND e.deleted_at IS NULL`,
        [ts, rootEid || boardId, bId, boardId]
      );
    }

    await conn.commit();
    return { success: true };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      destroy = true;
    }
    throw e;
  } finally {
    if (destroy) {
      conn.destroy();
    } else {
      conn.release();
    }
  }
}

async function restoreBoard(pool, userId, boardId) {
  const conn = await pool.getConnection();
  let destroy = false;
  try {
    await conn.beginTransaction();
    const auth = canManageSql('b', userId, 'board');

    // Reject restoring a board whose parent_board_id is still in Trash
    const [bRows] = await conn.query(
      'SELECT id, parent_board_id FROM boards WHERE id = ?',
      [boardId]
    );
    if (!bRows || bRows.length === 0) {
      throw new Error('NOT_FOUND_OR_FORBIDDEN');
    }
    const currentBoard = bRows[0];
    if (currentBoard.parent_board_id) {
      const [parentRows] = await conn.query(
        'SELECT id, deleted_at FROM boards WHERE id = ?',
        [currentBoard.parent_board_id]
      );
      if (parentRows && parentRows[0] && parentRows[0].deleted_at !== null) {
        throw new Error('CANNOT_RESTORE_PARENT_IN_TRASH');
      }
    }

    // 1) Restore root board
    const [p] = await conn.query(
      `UPDATE boards b SET b.deleted_at = NULL, b.cascade_deleted_by = NULL
        WHERE b.id = ? AND b.deleted_at IS NOT NULL AND ${auth.sql}`,
      [boardId, ...auth.params]
    );
    if (p.affectedRows !== 1) {
      throw new Error('NOT_FOUND_OR_FORBIDDEN');
    }

    // Restore canonical entities row for root board
    const [eRows] = await conn.query(
      'SELECT id AS eid FROM entities WHERE entity_type = "board" AND entity_id = ?',
      [boardId]
    );
    const rootEid = eRows && eRows[0] ? eRows[0].eid : null;
    if (rootEid) {
      await conn.query(
        'UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
        [rootEid]
      );
    }

    // 2) Restore descendant boards carrying this board's marker
    await conn.query(
      `UPDATE boards SET deleted_at = NULL, cascade_deleted_by = NULL
        WHERE cascade_deleted_by = ?`,
      [boardId]
    );

    if (rootEid) {
      await conn.query(
        `UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL
          WHERE entity_type = 'board' AND cascade_deleted_by = ?`,
        [rootEid]
      );
    }

    // 3) Restore board items carrying this board's marker
    await conn.query(
      `UPDATE board_items SET deleted_at = NULL, cascade_deleted_by = NULL
        WHERE cascade_deleted_by = ?`,
      [boardId]
    );

    // Native cards in entities
    if (rootEid) {
      await conn.query(
        `UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL
          WHERE entity_type = 'board_card' AND cascade_deleted_by = ?`,
        [rootEid]
      );
    }

    await conn.commit();
    return { success: true };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      destroy = true;
    }
    throw e;
  } finally {
    if (destroy) {
      conn.destroy();
    } else {
      conn.release();
    }
  }
}

module.exports = {
  deleteBoard,
  restoreBoard
};

