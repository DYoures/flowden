// server/migrations/004_cascade_deleted_by.js

const T = [
  { table: 'boards',            ref: 'boards' },
  { table: 'board_items',       ref: 'boards' },
  { table: 'research_excerpts', ref: 'research_documents' },
  { table: 'entities',          ref: 'entities' }
];

exports.up = async (conn) => {
  for (const { table: t, ref } of T) {
    const [tbl] = await conn.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
      [t]
    );
    if (!tbl.length) throw new Error(`004 requires table ${t} (create it in <=003)`);

    const [col] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='cascade_deleted_by'`,
      [t]
    );

    const [rtRows] = await conn.query(
      `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id'`,
      [ref]
    );
    const rt = rtRows && rtRows[0];
    if (!rt) throw new Error(`004: referenced table ${ref} has no id column`);

    // 1) Column, checked independently
    if (!col.length) {
      await conn.query(`ALTER TABLE \`${t}\` ADD COLUMN cascade_deleted_by ${rt.ct} NULL`);
    }

    // 2) Index, checked independently
    const [idx] = await conn.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?
          AND COLUMN_NAME='cascade_deleted_by' AND SEQ_IN_INDEX=1`,
      [t]
    );
    if (!idx.length) {
      await conn.query(`ALTER TABLE \`${t}\` ADD INDEX idx_${t}_cdb (cascade_deleted_by)`);
    }
  }
};

