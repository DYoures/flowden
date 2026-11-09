// server/migrations/007_note_folders_project_id.js

/**
 * Migration 007: Scopes note_folders to projects.
 *
 * Narrow scope:
 * 1. Checks and adds `project_id` column to `note_folders`.
 * 2. Checks and adds index `idx_project_folders` on `(project_id, user_id)`.
 * 3. Checks and adds foreign key constraint `fk_note_folders_project`.
 *
 * Each check is performed independently and idempotently against information_schema.
 * Does not modify or backfill existing user records.
 */
exports.up = async (conn) => {
  // 1. Independent idempotent check for column `project_id`
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_folders' 
       AND COLUMN_NAME = 'project_id' 
     LIMIT 1`
  );
  if (!cols || cols.length === 0) {
    await conn.query('ALTER TABLE `note_folders` ADD COLUMN `project_id` INT UNSIGNED NULL AFTER `user_id`');
  }

  // 2. Independent idempotent check for index `idx_project_folders`
  const [idx] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_folders' 
       AND INDEX_NAME = 'idx_project_folders' 
     LIMIT 1`
  );
  if (!idx || idx.length === 0) {
    await conn.query('ALTER TABLE `note_folders` ADD INDEX `idx_project_folders` (`project_id`, `user_id`)');
  }

  // 3. Independent idempotent check for foreign key constraint `fk_note_folders_project`
  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'note_folders' 
       AND CONSTRAINT_NAME = 'fk_note_folders_project' 
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' 
     LIMIT 1`
  );
  if (!fks || fks.length === 0) {
    await conn.query(
      `ALTER TABLE \`note_folders\` 
       ADD CONSTRAINT \`fk_note_folders_project\` 
       FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE`
    );
  }
};
