// server/migrations/009_research_canonical_and_nullable_file_path.js

/**
 * Migration 009: Bibliographic Source Support & Canonical Research Backfill.
 *
 * Requirements:
 * 1. Allow research_documents to store bibliographic entries without physical files:
 *    - `file_path` made nullable (`VARCHAR(500) NULL DEFAULT NULL`).
 *    - `original_filename` made nullable (`VARCHAR(300) NULL DEFAULT NULL`).
 *    - `file_name` made nullable (`VARCHAR(300) NULL DEFAULT NULL`).
 *    - `file_type` made nullable (`VARCHAR(50) NULL DEFAULT NULL`).
 *    - `file_size` default set to 0.
 * 2. Idempotent backfill for existing research_documents into canonical `entities`
 *    and `project_entities` if missing, so existing documents are immediately
 *    discoverable through the unified knowledge system.
 */

exports.up = async (conn) => {
  // 1. Check if research_documents exists
  const [tbl] = await conn.query(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'research_documents' LIMIT 1"
  );
  if (!tbl || tbl.length === 0) return;

  // 2. Modify file_path to be NULLable
  const [filePathCols] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'file_path' 
     LIMIT 1`
  );
  if (filePathCols && filePathCols.length > 0 && filePathCols[0].IS_NULLABLE === 'NO') {
    await conn.query('ALTER TABLE `research_documents` MODIFY COLUMN `file_path` VARCHAR(500) NULL DEFAULT NULL');
  }

  // 3. Modify original_filename to be NULLable
  const [origNameCols] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'original_filename' 
     LIMIT 1`
  );
  if (origNameCols && origNameCols.length > 0 && origNameCols[0].IS_NULLABLE === 'NO') {
    await conn.query('ALTER TABLE `research_documents` MODIFY COLUMN `original_filename` VARCHAR(300) NULL DEFAULT NULL');
  }

  // 4. Modify file_name to be NULLable
  const [fileNameCols] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'file_name' 
     LIMIT 1`
  );
  if (fileNameCols && fileNameCols.length > 0 && fileNameCols[0].IS_NULLABLE === 'NO') {
    await conn.query('ALTER TABLE `research_documents` MODIFY COLUMN `file_name` VARCHAR(300) NULL DEFAULT NULL');
  }

  // 5. Modify file_type to allow flexible types and NULL
  const [fileTypeCols] = await conn.query(
    `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'file_type' 
     LIMIT 1`
  );
  if (fileTypeCols && fileTypeCols.length > 0 && (fileTypeCols[0].DATA_TYPE === 'enum' || fileTypeCols[0].IS_NULLABLE === 'NO')) {
    await conn.query('ALTER TABLE `research_documents` MODIFY COLUMN `file_type` VARCHAR(50) NULL DEFAULT NULL');
  }

  // 6. Ensure file_size defaults to 0
  const [fileSizeCols] = await conn.query(
    `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'research_documents' 
       AND COLUMN_NAME = 'file_size' 
     LIMIT 1`
  );
  if (fileSizeCols && fileSizeCols.length > 0 && fileSizeCols[0].COLUMN_DEFAULT === null) {
    await conn.query('ALTER TABLE `research_documents` MODIFY COLUMN `file_size` INT UNSIGNED NOT NULL DEFAULT 0');
  }

  // 7. Idempotent backfill of research_documents into canonical `entities`
  await conn.query(`
    INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at)
    SELECT 
      UUID(), 
      'research', 
      rd.id, 
      rd.user_id, 
      rd.project_id, 
      COALESCE(NULLIF(TRIM(rd.title), ''), 'Untitled Research'), 
      CONCAT_WS(' ', rd.title, rd.summary, LEFT(COALESCE(rd.content_text, ''), 500)), 
      COALESCE(rd.created_at, NOW()), 
      COALESCE(rd.updated_at, NOW())
    FROM research_documents rd
    LEFT JOIN entities e ON e.entity_type = 'research' AND e.entity_id = rd.id
    WHERE e.id IS NULL
  `);

  // 8. Idempotent backfill of research project associations into `project_entities`
  await conn.query(`
    INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
    SELECT 
      rd.project_id, 
      'research', 
      rd.id, 
      'contributor', 
      rd.user_id, 
      COALESCE(rd.created_at, NOW())
    FROM research_documents rd
    LEFT JOIN project_entities pe 
      ON pe.project_id = rd.project_id 
     AND pe.entity_type = 'research' 
     AND pe.entity_id = rd.id
    WHERE rd.project_id IS NOT NULL AND pe.id IS NULL
  `);
};
