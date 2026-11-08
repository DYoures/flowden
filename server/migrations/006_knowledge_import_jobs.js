// server/migrations/006_knowledge_import_jobs.js

exports.up = async (conn) => {
  // 1. Create knowledge_import_jobs if not exists
  await conn.query(`
    CREATE TABLE IF NOT EXISTS knowledge_import_jobs (
      id VARCHAR(64) PRIMARY KEY,
      operation_id VARCHAR(64) NOT NULL UNIQUE,
      idempotency_key VARCHAR(128) NULL,
      user_id INT UNSIGNED NOT NULL,
      destination_project_id INT UNSIGNED NULL,
      package_name VARCHAR(255) NULL,
      package_sha256 CHAR(64) NOT NULL,
      state ENUM(
        'validating',
        'failed_validation',
        'staged',
        'committing_files',
        'committing_db',
        'committed',
        'rollback_pending',
        'rolled_back',
        'recovery_required'
      ) NOT NULL DEFAULT 'validating',
      staging_dir VARCHAR(512) NULL,
      journal_path VARCHAR(512) NULL,
      promoted_files_json JSON NULL,
      created_project_id INT UNSIGNED NULL,
      summary_json JSON NULL,
      error_details_json JSON NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      expires_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_user (user_id),
      INDEX idx_state (state),
      INDEX idx_package_sha (package_sha256),
      INDEX idx_expires (expires_at),
      UNIQUE KEY uq_user_idempotency (user_id, idempotency_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Safe index adjustment for existing databases (upgrades)
  // Check if legacy global unique index on idempotency_key exists
  const [legacyIdx] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'knowledge_import_jobs' 
       AND INDEX_NAME = 'idempotency_key' 
     LIMIT 1`
  );
  if (legacyIdx && legacyIdx.length > 0) {
    await conn.query('ALTER TABLE `knowledge_import_jobs` DROP INDEX `idempotency_key`');
  }

  // Check if composite index uq_user_idempotency exists
  const [compositeIdx] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'knowledge_import_jobs' 
       AND INDEX_NAME = 'uq_user_idempotency' 
     LIMIT 1`
  );
  if (!compositeIdx || compositeIdx.length === 0) {
    await conn.query('ALTER TABLE `knowledge_import_jobs` ADD UNIQUE KEY `uq_user_idempotency` (user_id, idempotency_key)');
  }

  // 3. Create knowledge_exchange_tickets for trusted server-side inspection binding
  await conn.query(`
    CREATE TABLE IF NOT EXISTS knowledge_exchange_tickets (
      id VARCHAR(64) PRIMARY KEY,
      ticket_hash CHAR(64) NOT NULL UNIQUE,
      operation_id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      package_sha256 CHAR(64) NOT NULL,
      destination_project_id INT UNSIGNED NULL,
      staging_dir VARCHAR(512) NOT NULL,
      staged_package_path VARCHAR(512) NOT NULL,
      package_name VARCHAR(255) NOT NULL,
      report_json JSON NULL,
      is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
      consumed_at TIMESTAMP NULL DEFAULT NULL,
      consumed_by_operation_id VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      INDEX idx_ticket_user (user_id),
      INDEX idx_ticket_sha (package_sha256),
      INDEX idx_ticket_expires (expires_at, is_consumed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};

