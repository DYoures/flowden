// server/services/researchService.js
const { canManageSql } = require('../utils/authPredicates');

async function deleteResearchDoc(pool, userId, docId) {
  const conn = await pool.getConnection();
  let destroy = false;
  try {
    await conn.beginTransaction();
    const ts = new Date();
    const auth = canManageSql('d', userId, 'research');

    // 1) Parent + authorization + affectedRows
    const [p] = await conn.query(
      `UPDATE research_documents d SET d.deleted_at = ?
        WHERE d.id = ? AND d.deleted_at IS NULL AND ${auth.sql}`,
      [ts, docId, ...auth.params]
    );
    if (p.affectedRows !== 1) {
      throw new Error('NOT_FOUND_OR_FORBIDDEN');
    }

    // Resolve canonical entities row for document
    const [eRows] = await conn.query(
      'SELECT id AS eid FROM entities WHERE entity_type = "research" AND entity_id = ?',
      [docId]
    );
    const eid = eRows && eRows[0] ? eRows[0].eid : null;
    if (eid) {
      const [pe] = await conn.query(
        'UPDATE entities SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
        [ts, eid]
      );
      if (pe.affectedRows !== 1) {
        throw new Error('ENTITY_DOMAIN_MISMATCH');
      }
    }

    // 2) ACTIVE children only, with provenance marker (marker = docId / eid, reading A)
    await conn.query(
      `UPDATE research_excerpts SET deleted_at = ?, cascade_deleted_by = ?
        WHERE research_id = ? AND deleted_at IS NULL`,
      [ts, docId, docId]
    );

    if (eid) {
      await conn.query(
        `UPDATE entities e JOIN research_excerpts x ON x.id = e.entity_id AND e.entity_type = 'excerpt'
            SET e.deleted_at = ?, e.cascade_deleted_by = ?
          WHERE x.research_id = ? AND x.cascade_deleted_by = ? AND e.deleted_at IS NULL`,
        [ts, eid, docId, docId]
      );
    }

    // Projection cards in board_items (projecting excerpt references)
    await conn.query(
      `UPDATE board_items bi JOIN research_excerpts x ON bi.reference_type = 'excerpt' AND bi.reference_id = x.id
          SET bi.deleted_at = ?, bi.cascade_deleted_by = ?
        WHERE x.cascade_deleted_by = ? AND bi.deleted_at IS NULL`,
      [ts, docId, docId]
    );

    await conn.commit();
    return { success: true };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      destroy = true; // Unhealthy connection: do not reuse
    }
    throw e; // Always surface the ORIGINAL error
  } finally {
    if (destroy) {
      conn.destroy();
    } else {
      conn.release();
    }
  }
}

async function restoreResearchDoc(pool, userId, docId) {
  const conn = await pool.getConnection();
  let destroy = false;
  try {
    await conn.beginTransaction();
    const auth = canManageSql('d', userId, 'research');

    // 1) Restore root document with authorization + affectedRows
    const [p] = await conn.query(
      `UPDATE research_documents d SET d.deleted_at = NULL
        WHERE d.id = ? AND d.deleted_at IS NOT NULL AND ${auth.sql}`,
      [docId, ...auth.params]
    );
    if (p.affectedRows !== 1) {
      throw new Error('NOT_FOUND_OR_FORBIDDEN');
    }

    // Restore canonical entities row for document
    const [eRows] = await conn.query(
      'SELECT id AS eid FROM entities WHERE entity_type = "research" AND entity_id = ?',
      [docId]
    );
    const eid = eRows && eRows[0] ? eRows[0].eid : null;
    if (eid) {
      await conn.query(
        'UPDATE entities SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
        [eid]
      );
    }

    // 2) Restore only excerpts carrying the cascade marker from this document
    await conn.query(
      `UPDATE research_excerpts SET deleted_at = NULL, cascade_deleted_by = NULL
        WHERE research_id = ? AND cascade_deleted_by = ?`,
      [docId, docId]
    );

    if (eid) {
      await conn.query(
        `UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL
          WHERE entity_type = 'excerpt' AND cascade_deleted_by = ?`,
        [eid]
      );
    }

    // Restore projection cards carrying the cascade marker
    await conn.query(
      `UPDATE board_items SET deleted_at = NULL, cascade_deleted_by = NULL
        WHERE reference_type = 'excerpt' AND cascade_deleted_by = ?`,
      [docId]
    );

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
  deleteResearchDoc,
  restoreResearchDoc
};

