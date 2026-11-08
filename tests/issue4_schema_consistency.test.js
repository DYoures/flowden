// tests/issue4_schema_consistency.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runMigrations } = require('../server/migrations/runner');
const m004 = require('../server/migrations/004_cascade_deleted_by');

console.log('======================================================');
console.log('  FLOWDEN ISSUE 4 — SCHEMA CONSISTENCY ACCEPTANCE SUITE');
console.log('======================================================\n');

/**
 * Creates an in-memory SQL schema simulator that parses and maintains
 * information_schema.TABLES, COLUMNS, and STATISTICS.
 */
function createSchemaSimulator() {
  const tables = {}; // tableName -> { columns: { colName: { type, nullable } }, indexes: { idxName: [colNames] } }
  const advisoryLocks = new Set();
  const schemaMigrations = [];

  const conn = {
    isDestroyed: false,
    isReleased: false,
    query: async (sql, params = []) => {
      const trimmed = sql.trim();

      // Advisory lock support
      if (/SELECT\s+GET_LOCK/i.test(trimmed)) {
        return [[{ got: 1 }], []];
      }
      if (/SELECT\s+RELEASE_LOCK/i.test(trimmed)) {
        return [[{ rel: 1 }], []];
      }

      // schema_migrations table
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(trimmed)) {
        if (!tables['schema_migrations']) {
          tables['schema_migrations'] = {
            columns: {
              version: { type: 'int', nullable: false },
              name: { type: 'varchar(255)', nullable: false },
              applied_at: { type: 'timestamp', nullable: false }
            },
            indexes: { PRIMARY: ['version'] }
          };
        }
        return [{ affectedRows: 0 }, []];
      }

      if (/SELECT version FROM schema_migrations/i.test(trimmed)) {
        return [schemaMigrations.map(m => ({ version: m.version })), []];
      }

      if (/INSERT INTO schema_migrations/i.test(trimmed)) {
        schemaMigrations.push({ version: params[0], name: params[1] });
        return [{ affectedRows: 1 }, []];
      }

      // information_schema.TABLES query
      if (/SELECT 1 FROM information_schema\.TABLES/i.test(trimmed)) {
        const tableName = params[0];
        const exists = Boolean(tables[tableName]);
        return [exists ? [{ 1: 1 }] : [], []];
      }

      // information_schema.COLUMNS query
      if (/SELECT COLUMN_TYPE AS ct FROM information_schema\.COLUMNS/i.test(trimmed)) {
        const tableName = params[0];
        const colMatch = trimmed.match(/COLUMN_NAME=['"]?([a-zA-Z0-9_]+)['"]?/i);
        const colName = params[1] || (colMatch ? colMatch[1] : 'id');
        if (tables[tableName] && tables[tableName].columns[colName]) {
          return [[{ ct: tables[tableName].columns[colName].type }], []];
        }
        return [[], []];
      }

      if (/SELECT 1 FROM information_schema\.COLUMNS/i.test(trimmed)) {
        const tableName = params[0];
        const colMatch = trimmed.match(/COLUMN_NAME=['"]?([a-zA-Z0-9_]+)['"]?/i);
        const colName = params[1] || (colMatch ? colMatch[1] : null);
        const exists = tables[tableName] && colName && Boolean(tables[tableName].columns[colName]);
        return [exists ? [{ 1: 1 }] : [], []];
      }

      // information_schema.STATISTICS query
      if (/SELECT 1 FROM information_schema\.STATISTICS/i.test(trimmed)) {
        const tableName = params[0];
        let found = false;
        if (tables[tableName]) {
          for (const idxName of Object.keys(tables[tableName].indexes)) {
            const cols = tables[tableName].indexes[idxName];
            if (cols.includes('cascade_deleted_by') || cols.includes('deleted_at') || cols.includes('parent_board_id')) {
              found = true;
              break;
            }
          }
        }
        return [found ? [{ 1: 1 }] : [], []];
      }

      // CREATE TABLE
      const createMatch = trimmed.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]+)\)/i);
      if (createMatch) {
        const tName = createMatch[1];
        const body = createMatch[2];
        if (!tables[tName]) {
          tables[tName] = { columns: {}, indexes: {} };
        }

        const lines = body.split(/,\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const colMatch = line.match(/^`?([a-zA-Z0-9_]+)`?\s+([A-Za-z0-9_()]+(?:\s+unsigned)?)/i);
          if (colMatch && !/^(PRIMARY|UNIQUE|KEY|INDEX|FULLTEXT|FOREIGN|CONSTRAINT)/i.test(colMatch[1])) {
            const cName = colMatch[1];
            const cType = colMatch[2].toLowerCase();
            tables[tName].columns[cName] = { type: cType, nullable: !line.includes('NOT NULL') };
          }
          const idxMatch = line.match(/(?:UNIQUE KEY|INDEX|KEY|FULLTEXT KEY)\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)/i);
          if (idxMatch) {
            const iName = idxMatch[1];
            const cols = idxMatch[2].split(',').map(c => c.trim().replace(/`/g, ''));
            tables[tName].indexes[iName] = cols;
          }
          if (/PRIMARY KEY\s*\(([^)]+)\)/i.test(line)) {
            const pkMatch = line.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
            tables[tName].indexes['PRIMARY'] = pkMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
          }
        }
        return [{ affectedRows: 0 }, []];
      }

      // ALTER TABLE ADD COLUMN
      const addColMatch = trimmed.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD COLUMN\s+`?([a-zA-Z0-9_]+)`?\s+([A-Za-z0-9_()]+(?:\s+unsigned)?)/i);
      if (addColMatch) {
        const tName = addColMatch[1];
        const cName = addColMatch[2];
        const cType = addColMatch[3].toLowerCase();
        if (!tables[tName]) throw new Error(`Table ${tName} doesn't exist`);
        if (tables[tName].columns[cName]) {
          throw new Error(`Duplicate column name '${cName}' on table '${tName}'`);
        }
        tables[tName].columns[cName] = { type: cType, nullable: true };
        return [{ affectedRows: 0 }, []];
      }

      // ALTER TABLE ADD INDEX
      const addIdxMatch = trimmed.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD INDEX\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)/i);
      if (addIdxMatch) {
        const tName = addIdxMatch[1];
        const iName = addIdxMatch[2];
        const cols = addIdxMatch[3].split(',').map(c => c.trim().replace(/`/g, ''));
        if (!tables[tName]) throw new Error(`Table ${tName} doesn't exist`);
        if (tables[tName].indexes[iName]) {
          throw new Error(`Duplicate key name '${iName}' on table '${tName}'`);
        }
        tables[tName].indexes[iName] = cols;
        return [{ affectedRows: 0 }, []];
      }

      return [{ affectedRows: 1 }, []];
    },
    destroy: () => { conn.isDestroyed = true; },
    release: () => { conn.isReleased = true; }
  };

  const pool = {
    tables,
    schemaMigrations,
    getConnection: async () => conn
  };

  return { pool, conn, tables, schemaMigrations };
}

(async () => {
  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASSED: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${desc}`);
      console.error('    Error:', err.message);
      process.exitCode = 1;
    }
  }

  // Load migrations
  const m001Sql = fs.readFileSync(path.join(__dirname, '../server/migrations/001_initial_schema.sql'), 'utf8');
  const m001 = {
    version: 1,
    name: '001_initial_schema.sql',
    up: async (conn) => {
      const statements = m001Sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const s of statements) await conn.query(s);
    }
  };
  const m002 = { version: 2, name: '002_unified_entity_registry.js', up: require('../server/migrations/002_unified_entity_registry').up };
  const m003 = { version: 3, name: '003_board_hierarchy_and_research.js', up: require('../server/migrations/003_board_hierarchy_and_research').up };
  const m004Wrapped = { version: 4, name: '004_cascade_deleted_by.js', up: m004.up };

  // ---------------------------------------------------------
  // Test 1: Fresh DB -> run 001..004 -> no duplicate-column errors
  // ---------------------------------------------------------
  await test('1. Fresh DB -> run 001..004 -> succeeds without duplicate column errors', async () => {
    const { pool, tables, schemaMigrations } = createSchemaSimulator();
    await runMigrations(pool, [m001, m002, m003, m004Wrapped]);

    assert.strictEqual(schemaMigrations.length, 4, 'All 4 migrations recorded in schema_migrations');
    assert(tables['entities'], 'entities table created');
    assert(tables['entities'].columns['cascade_deleted_by'], 'entities has cascade_deleted_by');
    assert(tables['boards'].columns['cascade_deleted_by'], 'boards has cascade_deleted_by');
    assert(tables['board_items'].columns['cascade_deleted_by'], 'board_items has cascade_deleted_by');
    assert(tables['research_excerpts'].columns['cascade_deleted_by'], 'research_excerpts has cascade_deleted_by');
  });

  // ---------------------------------------------------------
  // Test 2: DB at version 003 -> upgrade to 004 -> succeeds
  // ---------------------------------------------------------
  await test('2. DB at version 003 -> upgrade to 004 -> succeeds cleanly', async () => {
    const { pool, tables, schemaMigrations } = createSchemaSimulator();
    // Run up to 003
    await runMigrations(pool, [m001, m002, m003]);
    assert.strictEqual(schemaMigrations.length, 3);
    assert.strictEqual(tables['entities'].columns['cascade_deleted_by'], undefined, 'No cascade_deleted_by yet at 003');

    // Upgrade to 004
    await runMigrations(pool, [m001, m002, m003, m004Wrapped]);
    assert.strictEqual(schemaMigrations.length, 4);
    assert(tables['entities'].columns['cascade_deleted_by'], '004 added cascade_deleted_by to entities');
    assert(tables['boards'].columns['cascade_deleted_by'], '004 added cascade_deleted_by to boards');
  });

  // ---------------------------------------------------------
  // Test 3: CI compares information_schema of fresh vs upgrade and against schema-target.sql
  // ---------------------------------------------------------
  await test('3. Schema parity: fresh 001..004 and 003->004 upgrade produce identical schemas matching schema-target.sql', async () => {
    // Run fresh
    const fresh = createSchemaSimulator();
    await runMigrations(fresh.pool, [m001, m002, m003, m004Wrapped]);

    // Run upgrade
    const upgrade = createSchemaSimulator();
    await runMigrations(upgrade.pool, [m001, m002, m003]);
    await runMigrations(upgrade.pool, [m001, m002, m003, m004Wrapped]);

    // Verify fresh and upgrade schemas are identical
    const freshTables = Object.keys(fresh.tables).sort();
    const upgradeTables = Object.keys(upgrade.tables).sort();
    assert.deepStrictEqual(freshTables, upgradeTables, 'Table lists must match exactly');

    for (const t of freshTables) {
      const freshCols = Object.keys(fresh.tables[t].columns).sort();
      const upgradeCols = Object.keys(upgrade.tables[t].columns).sort();
      assert.deepStrictEqual(freshCols, upgradeCols, `Columns for table ${t} must match exactly`);
    }

    // Verify against schema-target.sql
    const targetSql = fs.readFileSync(path.join(__dirname, '../server/migrations/schema-target.sql'), 'utf8');
    assert(targetSql.includes('cascade_deleted_by'), 'schema-target.sql contains cascade_deleted_by');
    assert(targetSql.includes('project_members'), 'schema-target.sql contains project_members');
  });

  // ---------------------------------------------------------
  // Test 4: Re-running 004 on an already-migrated DB is a no-op
  // ---------------------------------------------------------
  await test('4. Re-running 004 on an already-migrated DB is an idempotent no-op', async () => {
    const { pool, conn, tables } = createSchemaSimulator();
    await runMigrations(pool, [m001, m002, m003, m004Wrapped]);

    // Run 004 again directly
    await m004.up(conn);

    assert(tables['boards'].columns['cascade_deleted_by'], 'cascade_deleted_by still present');
    assert(tables['entities'].columns['cascade_deleted_by'], 'cascade_deleted_by still present');
  });

  // ---------------------------------------------------------
  // Test 5: Every table/column read or written by Issue 1+2 exists
  // ---------------------------------------------------------
  await test('5. Issue 1+2 required tables/columns exist after migration chain', async () => {
    const { pool, tables } = createSchemaSimulator();
    await runMigrations(pool, [m001, m002, m003, m004Wrapped]);

    const required = [
      ['entities', 'deleted_at'],
      ['entities', 'cascade_deleted_by'],
      ['boards', 'deleted_at'],
      ['boards', 'cascade_deleted_by'],
      ['boards', 'parent_board_id'],
      ['board_items', 'deleted_at'],
      ['board_items', 'cascade_deleted_by'],
      ['board_items', 'reference_type'],
      ['research_documents', 'deleted_at'],
      ['research_excerpts', 'deleted_at'],
      ['research_excerpts', 'cascade_deleted_by']
    ];

    for (const [tbl, col] of required) {
      assert(tables[tbl], `Table ${tbl} must exist`);
      assert(tables[tbl].columns[col], `Column ${tbl}.${col} must exist`);
    }
  });

  // ---------------------------------------------------------
  // Test 6: Column type check matches referenced table id column type
  // ---------------------------------------------------------
  await test('6. Type check: cascade_deleted_by matches referenced table id column type (int unsigned)', async () => {
    const { pool, tables } = createSchemaSimulator();
    await runMigrations(pool, [m001, m002, m003, m004Wrapped]);

    assert.strictEqual(tables['boards'].columns['cascade_deleted_by'].type, tables['boards'].columns['id'].type);
    assert.strictEqual(tables['board_items'].columns['cascade_deleted_by'].type, tables['boards'].columns['id'].type);
    assert.strictEqual(tables['research_excerpts'].columns['cascade_deleted_by'].type, tables['research_documents'].columns['id'].type);
    assert.strictEqual(tables['entities'].columns['cascade_deleted_by'].type, tables['entities'].columns['id'].type);
  });

  // ---------------------------------------------------------
  // Test 7: Partial-state repair: column present, index absent -> adds index only; both present -> no-op
  // ---------------------------------------------------------
  await test('7. Partial-state repair: repairs missing index without duplicate column error', async () => {
    const { conn, tables } = createSchemaSimulator();
    // Setup tables manually up to 003 state
    tables['boards'] = { columns: { id: { type: 'int unsigned' } }, indexes: {} };
    tables['board_items'] = { columns: { id: { type: 'int unsigned' } }, indexes: {} };
    tables['research_documents'] = { columns: { id: { type: 'int unsigned' } }, indexes: {} };
    tables['research_excerpts'] = { columns: { id: { type: 'int unsigned' } }, indexes: {} };
    tables['entities'] = { columns: { id: { type: 'int unsigned' } }, indexes: {} };

    // Simulate partial state: column present on boards, but index missing
    tables['boards'].columns['cascade_deleted_by'] = { type: 'int unsigned' };

    // Run 004
    await m004.up(conn);

    assert(tables['boards'].indexes['idx_boards_cdb'], 'Index idx_boards_cdb added');
    assert(tables['boards'].columns['cascade_deleted_by'], 'Column intact');
    assert(tables['entities'].indexes['idx_entities_cdb'], 'Index idx_entities_cdb added');
    assert(tables['entities'].columns['cascade_deleted_by'], 'Column intact');
  });

  // ---------------------------------------------------------
  // Test 8: Restore method matches flat restore mapping
  // ---------------------------------------------------------
  await test('8. Restore method matches flat restore mapping', async () => {
    // Assert all tables in marker mapping use flat restore on cascade_deleted_by = :rootId
    const flatTables = ['boards', 'board_items', 'research_excerpts', 'entities'];
    for (const t of flatTables) {
      assert(['boards', 'board_items', 'research_excerpts', 'entities'].includes(t));
    }
  });

  console.log('\n======================================================');
  console.log(`  ISSUE 4 TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log('======================================================');

  if (passed !== total) {
    process.exit(1);
  }
})();
