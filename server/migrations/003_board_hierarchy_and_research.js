// server/migrations/003_board_hierarchy_and_research.js

exports.up = async (conn) => {
  // 1. Add parent_board_id to boards
  const [parentBoardCol] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='boards' AND COLUMN_NAME='parent_board_id'`
  );
  if (!parentBoardCol.length) {
    await conn.query(`ALTER TABLE \`boards\` ADD COLUMN parent_board_id INT UNSIGNED NULL AFTER project_id`);
  }
  const [parentBoardIdx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='boards' AND COLUMN_NAME='parent_board_id' AND SEQ_IN_INDEX=1`
  );
  if (!parentBoardIdx.length) {
    await conn.query(`ALTER TABLE \`boards\` ADD INDEX idx_parent_board (parent_board_id)`);
  }

  // 2. Add reference_type, metadata_json, deleted_at to board_items
  const [refTypeCol] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='board_items' AND COLUMN_NAME='reference_type'`
  );
  if (!refTypeCol.length) {
    await conn.query(`ALTER TABLE \`board_items\` ADD COLUMN reference_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision') NULL AFTER item_type`);
  }

  const [metaCol] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='board_items' AND COLUMN_NAME='metadata_json'`
  );
  if (!metaCol.length) {
    await conn.query(`ALTER TABLE \`board_items\` ADD COLUMN metadata_json JSON NULL AFTER z_index`);
  }

  const [deletedCol] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='board_items' AND COLUMN_NAME='deleted_at'`
  );
  if (!deletedCol.length) {
    await conn.query(`ALTER TABLE \`board_items\` ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER metadata_json`);
  }
  const [deletedIdx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='board_items' AND COLUMN_NAME='deleted_at' AND SEQ_IN_INDEX=1`
  );
  if (!deletedIdx.length) {
    await conn.query(`ALTER TABLE \`board_items\` ADD INDEX idx_board_items_deleted_at (deleted_at)`);
  }

  // 3. Create research_excerpts table (WITHOUT cascade_deleted_by)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS research_excerpts (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      research_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NULL,
      quoted_text TEXT NOT NULL,
      annotation TEXT NULL,
      location_anchor VARCHAR(100) NOT NULL,
      color VARCHAR(30) NOT NULL DEFAULT 'yellow',
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_research (research_id),
      INDEX idx_user_project (user_id, project_id),
      INDEX idx_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};

