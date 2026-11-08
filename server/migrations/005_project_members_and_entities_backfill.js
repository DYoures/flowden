// server/migrations/005_project_members_and_entities_backfill.js

exports.up = async (conn) => {
  // 1. Backfill project owners into project_members
  // The projects table authoritative owner column is `user_id`
  await conn.query(`
    INSERT INTO project_members (project_id, user_id, role, created_at)
    SELECT p.id, p.user_id, 'owner', NOW()
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = p.user_id
    WHERE pm.id IS NULL
    ON DUPLICATE KEY UPDATE project_members.role = project_members.role;
  `);

  // 2. Backfill project_entities for all entities with primary_project_id
  // Enforces the invariant: every entity's primary_project_id also exists in project_entities
  // Valid project_entities types: 'note', 'task', 'research', 'excerpt', 'board', 'decision'
  await conn.query(`
    INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
    SELECT e.primary_project_id, e.entity_type, e.entity_id, 'admin', e.owner_user_id, NOW()
    FROM entities e
    LEFT JOIN project_entities pe 
      ON pe.project_id = e.primary_project_id 
     AND pe.entity_type = e.entity_type 
     AND pe.entity_id = e.entity_id
    WHERE e.primary_project_id IS NOT NULL
      AND e.entity_type NOT IN ('project', 'capture')
      AND pe.id IS NULL
    ON DUPLICATE KEY UPDATE project_entities.access_role = project_entities.access_role;
  `);
};

