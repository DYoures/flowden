// server/migrations/002_unified_entity_registry.js

exports.up = async (conn) => {
  // 1. entities catalog table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS entities (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      uuid VARCHAR(36) NOT NULL,
      entity_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
      entity_id INT UNSIGNED NOT NULL,
      owner_user_id INT UNSIGNED NOT NULL,
      primary_project_id INT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      search_text LONGTEXT NULL,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_entity_type_id (entity_type, entity_id),
      UNIQUE KEY uq_entity_uuid (uuid),
      INDEX idx_owner_project (owner_user_id, primary_project_id),
      INDEX idx_title (title),
      INDEX idx_deleted_at (deleted_at),
      FULLTEXT KEY ft_entity_search (title, search_text)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. entity_links ledger
  await conn.query(`
    CREATE TABLE IF NOT EXISTS entity_links (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      source_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
      source_id INT UNSIGNED NOT NULL,
      target_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
      target_id INT UNSIGNED NOT NULL,
      link_type ENUM('references', 'embeds', 'cites', 'derived_from', 'supports', 'contradicts', 'inspired_by', 'depends_on', 'blocks', 'relates_to') NOT NULL DEFAULT 'references',
      origin ENUM('inline_link', 'embed', 'board_promoted', 'citation', 'task_sync', 'capture_convert', 'manual', 'ai_suggested') NOT NULL DEFAULT 'inline_link',
      context_snippet VARCHAR(500) NULL,
      is_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_relationship (source_type, source_id, target_type, target_id, link_type),
      INDEX idx_user_source (user_id, source_type, source_id),
      INDEX idx_user_target (user_id, target_type, target_id),
      INDEX idx_link_type (link_type),
      INDEX idx_deleted_confirmed (deleted_at, is_confirmed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. project_entities sharing table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_entities (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id INT UNSIGNED NOT NULL,
      entity_type ENUM('note', 'task', 'research', 'excerpt', 'board', 'decision') NOT NULL,
      entity_id INT UNSIGNED NOT NULL,
      access_role ENUM('viewer', 'contributor', 'admin') NOT NULL DEFAULT 'contributor',
      added_by INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_project_entity (project_id, entity_type, entity_id),
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. project_members authoritative membership table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      role ENUM('owner', 'editor', 'viewer') NOT NULL DEFAULT 'editor',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY uq_project_user (project_id, user_id),
      INDEX idx_project_user (project_id, user_id),
      INDEX idx_user_revoked (user_id, revoked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. Add deleted_at soft-delete column to domain tables if missing
  const domainTables = ['notes', 'tasks', 'boards', 'research_documents', 'decision_logs', 'quick_captures'];
  for (const dt of domainTables) {
    const [cols] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='deleted_at'`,
      [dt]
    );
    if (!cols.length) {
      await conn.query(`ALTER TABLE \`${dt}\` ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`);
    }
    const [idx] = await conn.query(
      `SELECT 1 FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='deleted_at' AND SEQ_IN_INDEX=1`,
      [dt]
    );
    if (!idx.length) {
      await conn.query(`ALTER TABLE \`${dt}\` ADD INDEX idx_${dt}_deleted_at (deleted_at)`);
    }
  }
};

