// server/migrations/007_formalize_security_and_uploads.js

exports.up = async (conn) => {
  // Helper to check if a column exists in the current database
  async function columnExists(tableName, columnName) {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ? 
       LIMIT 1`,
      [tableName, columnName]
    );
    return cols && cols.length > 0;
  }

  // 1. Formalize security_audit_logs table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      event_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      ip_address VARCHAR(64) NULL,
      target_type VARCHAR(64) NULL,
      target_id VARCHAR(128) NULL,
      details_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sec_audit_user (user_id),
      INDEX idx_sec_audit_event (event_type),
      INDEX idx_sec_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Formalize security_reports table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS security_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_user_id INT NOT NULL,
      target_type VARCHAR(64) NOT NULL,
      target_id VARCHAR(128) NULL,
      category VARCHAR(64) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      admin_notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sec_rep_user (reporter_user_id),
      INDEX idx_sec_rep_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. Formalize file_uploads table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS file_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      project_id INT NULL,
      entity_type VARCHAR(32) NOT NULL DEFAULT 'note',
      entity_id INT NULL,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      mime_type VARCHAR(128) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      sha256_hash VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_file_path (file_path),
      INDEX idx_file_user (user_id),
      INDEX idx_file_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Formalize users.token_version column
  if (!(await columnExists('users', 'token_version'))) {
    await conn.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1');
  }

  // 5. Formalize notes.attachments_json column
  if (!(await columnExists('notes', 'attachments_json'))) {
    await conn.query('ALTER TABLE notes ADD COLUMN attachments_json JSON NULL DEFAULT NULL');
  }

  // 6. Add project_id to note_folders for scoped folder hierarchies
  if (!(await columnExists('note_folders', 'project_id'))) {
    await conn.query(`
      ALTER TABLE note_folders 
      ADD COLUMN project_id INT UNSIGNED NULL,
      ADD INDEX idx_project_folders (project_id),
      ADD CONSTRAINT fk_note_folders_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    `);
  }
};
