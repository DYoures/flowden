// tests/issue3_migration_runner.test.js
const assert = require('assert');
const { runMigrations, LOCK } = require('../server/migrations/runner');

console.log('======================================================');
console.log('  FLOWDEN ISSUE 3 — MIGRATION RUNNER ACCEPTANCE SUITE');
console.log('======================================================\n');

/**
 * Creates an in-memory test connection that simulates mysql2/promise connection.
 */
function createMockPool(options = {}) {
  const state = {
    tables: {},
    schemaMigrations: [],
    advisoryLocks: new Set(),
    ...options.initialState
  };

  const pool = {
    state,
    connectionsCreated: 0,
    getConnection: async () => {
      pool.connectionsCreated++;
      const conn = {
        id: pool.connectionsCreated,
        isDestroyed: false,
        isReleased: false,
        simulateReleaseLockFailure: options.simulateReleaseLockFailure || false,
        query: async (sql, params = []) => {
          if (conn.isDestroyed) throw new Error('Cannot query on destroyed connection');
          const trimmed = sql.trim();

          // GET_LOCK
          if (/SELECT\s+GET_LOCK/i.test(trimmed)) {
            const lockName = params[0];
            if (options.lockHeldByOther) {
              return [[{ got: 0 }], []];
            }
            if (state.advisoryLocks.has(lockName)) {
              return [[{ got: 0 }], []];
            }
            state.advisoryLocks.add(lockName);
            return [[{ got: 1 }], []];
          }

          // RELEASE_LOCK
          if (/SELECT\s+RELEASE_LOCK/i.test(trimmed)) {
            if (conn.simulateReleaseLockFailure) {
              if (options.releaseThrows) throw new Error('Simulated network error on RELEASE_LOCK');
              return [[{ rel: 0 }], []];
            }
            const lockName = params[0];
            if (state.advisoryLocks.has(lockName)) {
              state.advisoryLocks.delete(lockName);
              return [[{ rel: 1 }], []];
            }
            return [[{ rel: 0 }], []];
          }

          // CREATE TABLE IF NOT EXISTS schema_migrations
          if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(trimmed)) {
            if (!state.tables['schema_migrations']) {
              state.tables['schema_migrations'] = true;
            }
            return [{ affectedRows: 0 }, []];
          }

          // SELECT version FROM schema_migrations
          if (/SELECT version FROM schema_migrations/i.test(trimmed)) {
            const rows = state.schemaMigrations.map(m => ({ version: m.version }));
            return [rows, []];
          }

          // INSERT INTO schema_migrations
          if (/INSERT INTO schema_migrations/i.test(trimmed)) {
            const version = params[0];
            const name = params[1];
            state.schemaMigrations.push({ version, name, applied_at: new Date() });
            return [{ affectedRows: 1 }, []];
          }

          return [{ affectedRows: 1 }, []];
        },
        destroy: () => {
          conn.isDestroyed = true;
        },
        release: () => {
          conn.isReleased = true;
        }
      };
      return conn;
    }
  };

  return pool;
}

(async () => {
  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASSED: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${desc}`);
      console.error('    Error:', err.message);
      process.exitCode = 1;
    }
  }

  async function testAsync(desc, fn) {
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

  // ---------------------------------------------------------
  // Test 1: Empty DB -> versions 1..N recorded in schema_migrations
  // ---------------------------------------------------------
  await testAsync('1. Empty DB -> versions 1..N recorded in schema_migrations', async () => {
    const pool = createMockPool();
    const appliedLog = [];
    const files = [
      { version: 1, name: '001_initial_schema.sql', up: async () => appliedLog.push(1) },
      { version: 2, name: '002_unified_entity_registry.sql', up: async () => appliedLog.push(2) },
      { version: 3, name: '003_board_hierarchy_and_research.sql', up: async () => appliedLog.push(3) },
      { version: 4, name: '004_cascade_deleted_by.js', up: async () => appliedLog.push(4) }
    ];

    await runMigrations(pool, files);

    assert.deepStrictEqual(appliedLog, [1, 2, 3, 4], 'All migrations should have executed in order');
    assert.strictEqual(pool.state.schemaMigrations.length, 4, '4 rows recorded in schema_migrations');
    assert.strictEqual(pool.state.schemaMigrations[0].version, 1);
    assert.strictEqual(pool.state.schemaMigrations[3].version, 4);
    assert.strictEqual(pool.state.advisoryLocks.size, 0, 'Advisory lock released');
  });

  // ---------------------------------------------------------
  // Test 2: Running the runner twice -> no changes, no errors
  // ---------------------------------------------------------
  await testAsync('2. Running the runner twice -> no changes, no errors', async () => {
    const pool = createMockPool();
    const appliedLog = [];
    const files = [
      { version: 1, name: '001_initial_schema.sql', up: async () => appliedLog.push(1) },
      { version: 2, name: '002_unified_entity_registry.sql', up: async () => appliedLog.push(2) }
    ];

    await runMigrations(pool, files);
    assert.strictEqual(appliedLog.length, 2);

    // Second run
    await runMigrations(pool, files);
    assert.strictEqual(appliedLog.length, 2, 'No migrations re-executed on second run');
    assert.strictEqual(pool.state.schemaMigrations.length, 2, 'No duplicate entries');
  });

  // ---------------------------------------------------------
  // Test 3: Two runner processes in parallel -> one fails/waits cleanly, no duplicate application
  // ---------------------------------------------------------
  await testAsync('3. Two runner processes in parallel -> fails cleanly when lock held, no duplicate application', async () => {
    const pool = createMockPool({ lockHeldByOther: true });
    const appliedLog = [];
    const files = [
      { version: 1, name: '001_initial_schema.sql', up: async () => appliedLog.push(1) }
    ];

    let errorThrown = null;
    try {
      await runMigrations(pool, files);
    } catch (err) {
      errorThrown = err;
    }

    assert(errorThrown !== null, 'Should throw when lock is held by another process');
    assert.match(errorThrown.message, /Migration lock not acquired/i);
    assert.strictEqual(appliedLog.length, 0, 'No migration executed while lock was not acquired');
    assert.strictEqual(pool.state.schemaMigrations.length, 0, 'No migration recorded');
  });

  // ---------------------------------------------------------
  // Test 4: Simulated RELEASE_LOCK failure -> connection is destroyed, not released to pool
  // ---------------------------------------------------------
  await testAsync('4. Simulated RELEASE_LOCK failure -> connection destroyed, not released to pool', async () => {
    let lastConn = null;
    const pool = createMockPool({ simulateReleaseLockFailure: true });
    const origGetConn = pool.getConnection;
    pool.getConnection = async () => {
      lastConn = await origGetConn();
      return lastConn;
    };

    const files = [
      { version: 1, name: '001_initial_schema.sql', up: async () => {} }
    ];

    await runMigrations(pool, files);

    assert(lastConn !== null, 'Connection was obtained');
    assert.strictEqual(lastConn.isDestroyed, true, 'Connection MUST be destroyed on RELEASE_LOCK failure');
    assert.strictEqual(lastConn.isReleased, false, 'Connection must NOT be released back to pool');
  });

  // ---------------------------------------------------------
  // Test 5: A migration that throws -> cleanup still runs, original error surfaced, re-run after fix succeeds
  // ---------------------------------------------------------
  await testAsync('5. A migration that throws -> cleanup runs, original error surfaced, re-run after fix succeeds', async () => {
    let lastConn = null;
    const pool = createMockPool();
    const origGetConn = pool.getConnection;
    pool.getConnection = async () => {
      lastConn = await origGetConn();
      return lastConn;
    };

    let attempts = 0;
    const filesFailing = [
      { version: 1, name: '001_initial.sql', up: async () => {} },
      { version: 2, name: '002_broken.sql', up: async () => {
        attempts++;
        throw new Error('Syntax error in migration 002');
      }}
    ];

    let caughtErr = null;
    try {
      await runMigrations(pool, filesFailing);
    } catch (err) {
      caughtErr = err;
    }

    assert(caughtErr !== null, 'Original error must be thrown');
    assert.match(caughtErr.message, /Syntax error in migration 002/);
    assert.strictEqual(pool.state.schemaMigrations.length, 1, 'Only migration 1 recorded; migration 2 not recorded');
    assert.strictEqual(lastConn.isReleased, true, 'Cleanup ran and released connection');
    assert.strictEqual(pool.state.advisoryLocks.size, 0, 'Advisory lock was released in finally');

    // Fix the migration and re-run
    const filesFixed = [
      { version: 1, name: '001_initial.sql', up: async () => {} },
      { version: 2, name: '002_fixed.sql', up: async () => { attempts++; } }
    ];

    await runMigrations(pool, filesFixed);
    assert.strictEqual(pool.state.schemaMigrations.length, 2, 'Migration 2 now successfully recorded');
    assert.strictEqual(pool.state.schemaMigrations[1].version, 2);
  });

  console.log('\n======================================================');
  console.log(`  ISSUE 3 TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log('======================================================');

  if (passed !== total) {
    process.exit(1);
  }
})();

