// server/utils/authPredicates.js

/**
 * Generates an SQL authorization predicate and parameter list
 * adhering strictly to Flowden Blueprint V2 authorization rules.
 *
 * Rules per V2 Section 6.3:
 * - Direct ownership: alias.user_id = :userId
 * - Active Project Admin/Editor/Owner in project_members
 * - access_role = 'admin' in project_entities
 *
 * @param {string} alias - table alias (e.g. 'd', 'b')
 * @param {number} userId - user performing the operation
 * @param {string} entityType - 'research' | 'board' | 'note' | 'task'
 * @returns {{ sql: string, params: any[] }}
 */
function canManageSql(alias, userId, entityType = 'research') {
  const sql = `(
    ${alias}.user_id = ?
    OR EXISTS (
      SELECT 1 FROM project_members pm
       WHERE pm.project_id = ${alias}.project_id
         AND pm.user_id = ?
         AND pm.role IN ('owner', 'editor')
         AND pm.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM project_entities pe
       WHERE pe.project_id = ${alias}.project_id
         AND pe.entity_type = ?
         AND pe.entity_id = ${alias}.id
         AND pe.access_role = 'admin'
         AND EXISTS (
           SELECT 1 FROM project_members pm2
            WHERE pm2.project_id = pe.project_id
              AND pm2.user_id = ?
              AND pm2.revoked_at IS NULL
         )
    )
  )`;

  return {
    sql,
    params: [userId, userId, entityType, userId]
  };
}

module.exports = {
  canManageSql
};

