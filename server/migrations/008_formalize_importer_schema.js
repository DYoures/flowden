// server/migrations/008_formalize_importer_schema.js
/**
 * Formalizes database columns and tables required by Knowledge Exchange and Note models:
 * 1. notes.attachments_json (JSON NULL)
 * 2. note_versions.user_id (INT UNSIGNED NULL, indexed) and note_versions.content_markdown (LONGTEXT NULL)
 * 3. research_documents.file_name (VARCHAR(300)) and research_documents.tags_json (JSON NULL)
 * 4. file_uploads table (for promoted knowledge assets and user attachments)
 *
 * Each check is strictly idempotent via information_schema inspection.
 */

exports.up = async (conn) => {
  // 1. notes.attachments_json
  const [noteAttCols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'notes' 
       AND COLUMN_NAME = 'attachments_json' 
     LIMIT 1`
  );
  if (!noteAttCols || noteAttCols.length === 0) {
    await conn.query('ALTER TABLE `notes` ADD COLUMN `attachments_json` JSON NULL DEFAULT NULL AFTER `word_count`');
  }

  // 2. note_versions.user_id
  const [nvUserCols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_versions' 
       AND COLUMN_NAME = 'user_id' 
     LIMIT 1`
  );
  if (!nvUserCols || nvUserCols.length === 0) {
    await conn.query('ALTER TABLE `note_versions` ADD COLUMN `user_id` INT UNSIGNED NULL AFTER `note_id`');
  }

  // Idempotent backfill: If created_by exists, backfill user_id where it is currently NULL
  // Runs even if user_id column already existed, preserving any already populated user_id
  const [nvCreatedByCol] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_versions' 
       AND COLUMN_NAME = 'created_by' 
     LIMIT 1`
  );
  if (nvCreatedByCol && nvCreatedByCol.length > 0) {
    await conn.query(
      'UPDATE `note_versions` SET `user_id` = `created_by` WHERE `user_id` IS NULL AND `created_by` IS NOT NULL'
    );
  }

  // Check index on note_versions(note_id, user_id)
  const [nvUserIdx] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_versions' 
       AND INDEX_NAME = 'idx_note_versions_user' 
     LIMIT 1`
  );
  if (!nvUserIdx || nvUserIdx.length === 0) {
    await conn.query('CREATE INDEX `idx_note_versions_user` ON `note_versions` (`note_id`, `user_id`)');
  }

  // 3. note_versions.content_markdown
  const [nvContentCols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_versions' 
       AND COLUMN_NAME = 'content_markdown' 
     LIMIT 1`
  );
  if (!nvContentCols || nvContentCols.length === 0) {
    await conn.query('ALTER TABLE `note_versions` ADD COLUMN `content_markdown` LONGTEXT NULL AFTER `title`');
  }

  // Idempotent backfill: If legacy content exists, backfill content_markdown where it is currently NULL
  // Runs even if content_markdown column already existed, preserving any already populated markdown
  const [nvLegacyContentCol] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_versions' 
       AND COLUMN_NAME = 'content' 
     LIMIT 1`
  );
  if (nvLegacyContentCol && nvLegacyContentCol.length > 0) {
    await conn.query(
      'UPDATE `note_versions` SET `content_markdown` = `content` WHERE `content_markdown` IS NULL AND `content` IS NOT NULL'
    );
  }

  // 4. research_documents.file_name
  const [resFileNameCols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'file_name' 
     LIMIT 1`
  );
  if (!resFileNameCols || resFileNameCols.length === 0) {
    await conn.query("ALTER TABLE `research_documents` ADD COLUMN `file_name` VARCHAR(300) NOT NULL DEFAULT '' AFTER `original_filename`");
  }

  // 5. research_documents.tags_json
  const [resTagsCols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'tags_json' 
     LIMIT 1`
  );
  if (!resTagsCols || resTagsCols.length === 0) {
    await conn.query('ALTER TABLE `research_documents` ADD COLUMN `tags_json` JSON NULL DEFAULT NULL AFTER `source_url`');
  }

  // 6. file_uploads table
  const [fileUploadsTable] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'file_uploads' 
     LIMIT 1`
  );
  if (!fileUploadsTable || fileUploadsTable.length === 0) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`file_uploads\` (
        \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT UNSIGNED NOT NULL,
        \`project_id\` INT UNSIGNED NULL,
        \`entity_type\` VARCHAR(32) NOT NULL DEFAULT 'note',
        \`entity_id\` INT UNSIGNED NULL,
        \`filename\` VARCHAR(255) NOT NULL,
        \`original_name\` VARCHAR(255) NOT NULL,
        \`file_path\` VARCHAR(512) NOT NULL,
        \`mime_type\` VARCHAR(128) NOT NULL,
        \`file_size\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`sha256_hash\` VARCHAR(64) NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_file_path\` (\`file_path\`),
        INDEX \`idx_file_user\` (\`user_id\`),
        INDEX \`idx_file_project\` (\`project_id\`),
        INDEX \`idx_file_entity\` (\`entity_type\`, \`entity_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } else {
    // If table exists, ensure sha256_hash column exists
    const [shaCol] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'file_uploads' 
         AND COLUMN_NAME = 'sha256_hash' 
       LIMIT 1`
    );
    if (!shaCol || shaCol.length === 0) {
      await conn.query('ALTER TABLE `file_uploads` ADD COLUMN `sha256_hash` VARCHAR(64) NULL AFTER `file_size`');
    }
  }
};
