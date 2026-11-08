const db = require('../config/database');

const VALID_RELATIONSHIPS = ['related_to', 'supports', 'contradicts', 'inspired_by', 'depends_on'];
const VALID_TYPES = ['note', 'research', 'task', 'project'];

class Connection {
  static async findAll(userId, { source_type = null, source_id = null } = {}) {
    let sql = 'SELECT * FROM smart_connections WHERE user_id = ?';
    const params = [userId];

    if (source_type && source_id) {
      sql += ' AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))';
      params.push(source_type, source_id, source_type, source_id);
    }

    sql += ' ORDER BY id DESC';
    return db.query(sql, params);
  }

  static async create(userId, { source_type, source_id, target_type, target_id, relationship = 'related_to' }) {
    if (!VALID_TYPES.includes(source_type) || !VALID_TYPES.includes(target_type)) {
      throw new Error(`Invalid source or target entity type. Must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (!VALID_RELATIONSHIPS.includes(relationship)) {
      throw new Error(`Invalid relationship type. Must be one of: ${VALID_RELATIONSHIPS.join(', ')}`);
    }

    // Check duplicate
    const existing = await db.query(
      'SELECT id FROM smart_connections WHERE user_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relationship = ? LIMIT 1',
      [userId, source_type, source_id, target_type, target_id, relationship]
    );

    if (existing && existing.length > 0) {
      return existing[0];
    }

    const result = await db.query(
      'INSERT INTO smart_connections (user_id, source_type, source_id, target_type, target_id, relationship) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, source_type, source_id, target_type, target_id, relationship]
    );

    // Sync to canonical entity_links
    const mappedLinkType = relationship === 'related_to' ? 'relates_to' : relationship;
    try {
      await db.query(`
        INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE link_type = VALUES(link_type), deleted_at = NULL, updated_at = NOW()
      `, [userId, source_type, source_id, target_type, target_id, mappedLinkType]);
    } catch (e) {
      // Table entity_links sync best-effort if types match enum
    }

    const rows = await db.query('SELECT * FROM smart_connections WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  }

  static async delete(id, userId) {
    const existing = await db.query('SELECT * FROM smart_connections WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
    if (!existing || existing.length === 0) throw new Error('Connection not found or unauthorized');

    const sc = existing[0];
    await db.query('DELETE FROM smart_connections WHERE id = ? AND user_id = ?', [id, userId]);

    try {
      await db.query(`
        DELETE FROM entity_links
        WHERE user_id = ?
          AND (
            (source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?)
            OR (source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?)
          )
      `, [userId, sc.source_type, sc.source_id, sc.target_type, sc.target_id, sc.target_type, sc.target_id, sc.source_type, sc.source_id]);
    } catch (e) {}

    return true;
  }
}

module.exports = Connection;

