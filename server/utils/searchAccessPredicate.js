// server/utils/searchAccessPredicate.js

/**
 * Generates an authoritative access predicate SQL snippet and positional parameters.
 *
 * Enforces FLOWDEN Blueprint v2 authorization:
 * 1. Soft-delete isolation: `deleted_at IS NULL`.
 * 2. Quick capture privacy: quick captures are visible strictly to their author/owner.
 * 3. In-app access:
 *    - Caller owns the entity (`owner_user_id = userId`), OR
 *    - Caller is an active member (`pm.revoked_at IS NULL`) of a project containing the entity (via `project_entities`), OR
 *    - If entity is a project, caller has active membership in `project_members`.
 * 4. MCP tool access (`isMcp: true`):
 *    - Caller MUST have active membership (`revoked_at IS NULL`) in an enabled project (`enabledProjectIds`).
 *    - Projects NOT enabled for MCP return no entities even to active members.
 *    - Personal captures and non-enabled project entities are strictly omitted.
 * 5. Traversal rule: A link never grants access. Target and source entities must independently satisfy this predicate.
 *
 * @param {number|string} userId - The authenticated user ID
 * @param {object} [options]
 * @param {string} [options.tableAlias='e'] - Table alias for entities (e.g. 'e', 'e_src', 'e_tgt')
 * @param {boolean} [options.isMcp=false] - Whether this access check is for external MCP tools
 * @param {number[]} [options.enabledProjectIds=[]] - Array of project IDs enabled for MCP
 * @param {number|null} [options.activeProjectId=null] - Project ID to scope access to
 * @param {boolean} [options.includePersonal=true] - Whether to include caller's personal entities
 * @returns {{ sql: string, params: any[] }}
 */
function accessPredicate(userId, options = {}) {
  if (userId === undefined || userId === null) {
    throw new Error('accessPredicate requires a valid userId');
  }

  const numericUserId = parseInt(userId, 10);
  const alias = options.tableAlias || 'e';
  const isMcp = Boolean(options.isMcp);
  const activeProjectId = options.activeProjectId ? parseInt(options.activeProjectId, 10) : null;
  const includePersonal = options.includePersonal !== false;
  const enabledProjectIds = Array.isArray(options.enabledProjectIds)
    ? options.enabledProjectIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    : [];

  const params = [];

  // MCP Access Mode
  if (isMcp) {
    if (enabledProjectIds.length === 0) {
      // No projects enabled for MCP -> return no records
      return {
        sql: `(${alias}.deleted_at IS NULL AND 1 = 0)`,
        params: []
      };
    }

    const placeholders = enabledProjectIds.map(() => '?').join(', ');
    params.push(numericUserId); // for capture privacy: alias.owner_user_id = ?
    params.push(numericUserId); // for pm.user_id = ?
    params.push(...enabledProjectIds);

    let activeProjClause = '';
    if (activeProjectId) {
      activeProjClause = ' AND pe.project_id = ?';
      params.push(activeProjectId);
    }

    const sql = `(
      ${alias}.deleted_at IS NULL
      AND (${alias}.entity_type <> 'capture' OR ${alias}.owner_user_id = ?)
      AND EXISTS (
        SELECT 1 FROM project_entities pe
        JOIN project_members pm ON pm.project_id = pe.project_id
        WHERE (
          (pe.entity_type = ${alias}.entity_type AND pe.entity_id = ${alias}.entity_id)
          OR pe.entity_id = ${alias}.id
        )
          AND pm.user_id = ?
          AND pm.revoked_at IS NULL
          AND pe.project_id IN (${placeholders})
          ${activeProjClause}
      )
    )`;

    return { sql, params };
  }

  // Normal In-App Access Mode
  if (activeProjectId) {
    if (includePersonal) {
      params.push(numericUserId); // capture check
      params.push(numericUserId); // personal notes: alias.owner_user_id = ?
      params.push(activeProjectId); // project entity id
      params.push(numericUserId); // pm_p.user_id = ?
      params.push(numericUserId); // pm.user_id = ?
      params.push(activeProjectId); // pe.project_id = ?

      const sql = `(
        ${alias}.deleted_at IS NULL
        AND (${alias}.entity_type <> 'capture' OR ${alias}.owner_user_id = ?)
        AND (
          (${alias}.owner_user_id = ? AND ${alias}.primary_project_id IS NULL)
          OR (${alias}.entity_type = 'project' AND ${alias}.entity_id = ? AND EXISTS (
            SELECT 1 FROM project_members pm_p
            WHERE pm_p.project_id = ${alias}.entity_id
              AND pm_p.user_id = ?
              AND pm_p.revoked_at IS NULL
          ))
          OR EXISTS (
            SELECT 1 FROM project_entities pe
            JOIN project_members pm ON pm.project_id = pe.project_id
            WHERE (
              (pe.entity_type = ${alias}.entity_type AND pe.entity_id = ${alias}.entity_id)
              OR pe.entity_id = ${alias}.id
            )
              AND pm.user_id = ?
              AND pm.revoked_at IS NULL
              AND pe.project_id = ?
          )
        )
      )`;
      return { sql, params };
    } else {
      params.push(numericUserId); // capture check
      params.push(activeProjectId); // project entity id
      params.push(numericUserId); // pm_p.user_id = ?
      params.push(numericUserId); // pm.user_id = ?
      params.push(activeProjectId); // pe.project_id = ?

      const sql = `(
        ${alias}.deleted_at IS NULL
        AND (${alias}.entity_type <> 'capture' OR ${alias}.owner_user_id = ?)
        AND (
          (${alias}.entity_type = 'project' AND ${alias}.entity_id = ? AND EXISTS (
            SELECT 1 FROM project_members pm_p
            WHERE pm_p.project_id = ${alias}.entity_id
              AND pm_p.user_id = ?
              AND pm_p.revoked_at IS NULL
          ))
          OR EXISTS (
            SELECT 1 FROM project_entities pe
            JOIN project_members pm ON pm.project_id = pe.project_id
            WHERE (
              (pe.entity_type = ${alias}.entity_type AND pe.entity_id = ${alias}.entity_id)
              OR pe.entity_id = ${alias}.id
            )
              AND pm.user_id = ?
              AND pm.revoked_at IS NULL
              AND pe.project_id = ?
          )
        )
      )`;
      return { sql, params };
    }
  }

  // Global In-App Universal Access
  params.push(numericUserId); // capture check
  params.push(numericUserId); // owner check: alias.owner_user_id = ?
  params.push(numericUserId); // project_entities membership: pm.user_id = ?
  params.push(numericUserId); // project entity self membership: pm_p.user_id = ?

  const sql = `(
    ${alias}.deleted_at IS NULL
    AND (${alias}.entity_type <> 'capture' OR ${alias}.owner_user_id = ?)
    AND (
      (${alias}.entity_type <> 'project' AND ${alias}.owner_user_id = ? AND ${alias}.primary_project_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM project_entities pe
        JOIN project_members pm ON pm.project_id = pe.project_id
        WHERE (
          (pe.entity_type = ${alias}.entity_type AND pe.entity_id = ${alias}.entity_id)
          OR pe.entity_id = ${alias}.id
        )
          AND pm.user_id = ?
          AND pm.revoked_at IS NULL
      )
      OR (
        ${alias}.entity_type = 'project'
        AND EXISTS (
          SELECT 1 FROM project_members pm_p
          WHERE pm_p.project_id = ${alias}.entity_id
            AND pm_p.user_id = ?
            AND pm_p.revoked_at IS NULL
        )
      )
    )
  )`;

  return { sql, params };
}

module.exports = {
  accessPredicate
};

