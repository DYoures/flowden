// tests/production_db_fail_closed.test.js
/**
 * Production Database Fail-Closed and Startup Integrity Test Suite
 *
 * Requirements:
 * 1. Production must require MySQL:
 *    - Rejects initDB on unreachable MySQL, DB creation/selection failure, pool init failure, or migration failure.
 *    - Never calls readLocalStore() or activates embedded JSON fallback in production.
 *    - Cleans up partially initialized connections/pools.
 *    - Sanitizes error messages (never leaks DB passwords).
 * 2. Defense in Depth for Production Queries:
 *    - query() rejects when pool is offline in production.
 *    - getConnection() rejects when pool is offline in production.
 *    - executeLocalQuery(), readLocalStore(), writeLocalStore() throw immediately in production.
 *    - flowden_store.json is never created or modified in production.
 * 3. Startup Order & Fail-Fast Assertions in server/index.js:
 *    - Production startup aborts before HTTP listener if MySQL is inactive.
 *    - Failure in ensureSecurityTables() aborts startup in production.
 *    - Failure in reconcileUnfinishedJobs() aborts startup in production.
 * 4. Development/test fallback remains compatible.
 * 5. Production MySQL success path starts cleanly and /api/health reports MySQL 8.0+.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config();

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STORE_PATH = path.resolve(PROJECT_ROOT, 'server', 'data', 'flowden_store.json');
const VALID_PROD_JWT = 'flowden_production_failclosed_test_secret_32bytes_entropy!';

// Helper: HTTP GET requesting specified URL with timeout
function httpGetJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    });
  });
}

// Helper: Check whether an HTTP port is listening
function isPortListening(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Helper: Run node snippet in child process
function runSubprocess(snippet, envOverrides = {}, timeoutMs = 12000) {
  const runnerCode = `
    require('dotenv').config();
    ${snippet}
  `;

  return spawnSync(process.execPath, ['-e', runnerCode], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    timeout: timeoutMs
  });
}

async function runProductionFailClosedTests() {
  console.log('=== STARTING PRODUCTION DATABASE FAIL-CLOSED & STARTUP INTEGRITY TESTS ===\n');
  let passed = 0;

  // ---------------------------------------------------------------------------
  // Part 1: Defense in Depth Unit Invariants
  // ---------------------------------------------------------------------------
  console.log('--- Part 1: Production Defense-in-Depth Query & Storage Invariants ---');

  const db = require('../server/config/database');

  // Test 1: Direct executeLocalQuery() throws in production
  {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // Access via module or by triggering local query path
      let threw = false;
      try {
        // Query when not connected to MySQL in production
        await db.query('SELECT 1');
      } catch (err) {
        threw = true;
        assert.ok(
          err.message.includes('[DB-Production]'),
          `Expected [DB-Production] error, got: ${err.message}`
        );
      }
      assert.strictEqual(threw, true, 'db.query() must reject when MySQL is unavailable in production');
      passed++;
      console.log('  ✅ PASS: db.query() immediately rejects in production when MySQL is offline');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  }

  // Test 2: Direct getConnection() throws in production when pool is unavailable
  {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      let threw = false;
      try {
        await db.getConnection();
      } catch (err) {
        threw = true;
        assert.ok(
          err.message.includes('[DB-Production]'),
          `Expected [DB-Production] pool error, got: ${err.message}`
        );
      }
      assert.strictEqual(threw, true, 'db.getConnection() must reject when pool is null in production');
      passed++;
      console.log('  ✅ PASS: db.getConnection() rejects without returning mock connection in production');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  }

  // Test 3: Password sanitization in error messages
  {
    const secretPassword = 'SUPER_SECRET_DB_PASSWORD_XYZ';
    const sub = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_PASSWORD = '${secretPassword}';
      process.env.DB_PORT = '65530';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';
      const db = require('./server/config/database');
      db.initDB()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error('[SANITIZED_ERROR] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(sub.status, 1, 'Subprocess must fail on unreachable port');
    assert.strictEqual(
      sub.stderr.includes(secretPassword),
      false,
      'DB password must never appear in error messages or logs'
    );
    assert.ok(
      sub.stderr.includes('[DB-Production] Database initialization failed in production environment'),
      'Must contain production fail-closed error prefix'
    );
    passed++;
    console.log('  ✅ PASS: Database passwords are sanitized from error messages and logs');
  }

  // ---------------------------------------------------------------------------
  // Part 2: Test A — MySQL Unavailable in Production
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 2: Test A — MySQL Unavailable in Production ---');

  {
    const testPortA = 5181;
    let storeMtimeBefore = 0;
    if (fs.existsSync(STORE_PATH)) {
      storeMtimeBefore = fs.statSync(STORE_PATH).mtimeMs;
    }

    const subA = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_PORT = '65530';
      process.env.PORT = '${testPortA}';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';

      const app = require('./server/index');
      app.start()
        .then((server) => {
          console.log('[STARTUP_RESULT] UNEXPECTED_SUCCESS');
          server.close(() => process.exit(0));
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(subA.status, 1, 'Server startup must exit with code 1 when MySQL is unreachable in production');
    assert.ok(
      subA.stderr.includes('[DB-Production] Database initialization failed in production environment'),
      'Stderr must show database initialization rejection'
    );
    assert.strictEqual(
      subA.stdout.includes('Using resilient embedded storage'),
      false,
      'Embedded storage fallback must NEVER be activated in production'
    );
    assert.strictEqual(
      subA.stdout.includes('Server listening on http'),
      false,
      'HTTP listener must NOT be started when MySQL is unreachable in production'
    );

    // Verify HTTP port was NOT bound/opened
    const portOpenA = await isPortListening(testPortA);
    assert.strictEqual(portOpenA, false, 'Port 5181 must not be listening after startup failure');

    // Verify flowden_store.json was NOT modified
    if (fs.existsSync(STORE_PATH)) {
      const storeMtimeAfter = fs.statSync(STORE_PATH).mtimeMs;
      assert.strictEqual(
        storeMtimeAfter,
        storeMtimeBefore,
        'flowden_store.json must not be modified in production'
      );
    }

    passed++;
    console.log('  ✅ PASS: Test A — Unreachable MySQL in production rejects startup, listener not opened, JSON store untouched');
  }

  // ---------------------------------------------------------------------------
  // Part 3: Test B — Production Migrations Fail
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 3: Test B — Production Migrations Fail ---');

  {
    const testPortB = 5182;
    const dbNameB = `flowden_test_mig_fail_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const subB = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_NAME = '${dbNameB}';
      process.env.PORT = '${testPortB}';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';

      // Monkeypatch migration runner to simulate migration execution failure
      const runner = require('./server/migrations/runner');
      runner.runMigrations = async () => {
        throw new Error('Simulated migration runner failure in production test');
      };

      const app = require('./server/index');
      app.start()
        .then((server) => {
          console.log('[STARTUP_RESULT] UNEXPECTED_SUCCESS');
          server.close(() => process.exit(0));
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(subB.status, 1, 'Startup must reject when migrations fail in production');
    assert.ok(
      subB.stderr.includes('Simulated migration runner failure in production test'),
      'Must log migration runner error'
    );
    assert.strictEqual(
      subB.stdout.includes('Using resilient embedded storage'),
      false,
      'Fallback must NEVER be activated on migration failure in production'
    );
    assert.strictEqual(
      subB.stdout.includes('Server listening on http'),
      false,
      'HTTP listener must NOT start on migration failure in production'
    );

    const portOpenB = await isPortListening(testPortB);
    assert.strictEqual(portOpenB, false, 'Port 5182 must not be listening');

    passed++;
    console.log('  ✅ PASS: Test B — Migration failure in production rejects startup and aborts before listener');
  }

  // ---------------------------------------------------------------------------
  // Part 4: Test C — Security Table Initialization Fails in Production
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 4: Test C — Security Table Initialization Fails in Production ---');

  {
    const testPortC = 5183;
    const dbNameC = `flowden_test_sec_fail_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const subC = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_NAME = '${dbNameC}';
      process.env.PORT = '${testPortC}';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';

      const sec = require('./server/services/securityService');
      sec.ensureSecurityTables = async () => {
        throw new Error('Simulated security tables DDL failure in production test');
      };

      const app = require('./server/index');
      app.start()
        .then((server) => {
          console.log('[STARTUP_RESULT] UNEXPECTED_SUCCESS');
          server.close(() => process.exit(0));
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(subC.status, 1, 'Startup must reject when ensureSecurityTables fails in production');
    assert.ok(
      subC.stderr.includes('Simulated security tables DDL failure in production test'),
      'Must propagate security table initialization error'
    );
    assert.strictEqual(
      subC.stdout.includes('Server listening on http'),
      false,
      'HTTP listener must NOT start when security tables fail in production'
    );

    const portOpenC = await isPortListening(testPortC);
    assert.strictEqual(portOpenC, false, 'Port 5183 must not be listening');

    passed++;
    console.log('  ✅ PASS: Test C — Security table initialization failure in production rejects startup');
  }

  // ---------------------------------------------------------------------------
  // Part 5: Test D — Import Reconciliation Fails in Production
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 5: Test D — Import Reconciliation Fails in Production ---');

  {
    const testPortD = 5184;
    const dbNameD = `flowden_test_rec_fail_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const subD = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_NAME = '${dbNameD}';
      process.env.PORT = '${testPortD}';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';

      const ke = require('./server/services/knowledgeExchangeService');
      ke.reconcileUnfinishedJobs = async () => {
        throw new Error('Simulated crash-recovery reconciler failure in production test');
      };

      const app = require('./server/index');
      app.start()
        .then((server) => {
          console.log('[STARTUP_RESULT] UNEXPECTED_SUCCESS');
          server.close(() => process.exit(0));
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(subD.status, 1, 'Startup must reject when reconcileUnfinishedJobs fails in production');
    assert.ok(
      subD.stderr.includes('Simulated crash-recovery reconciler failure in production test'),
      'Must propagate reconciler error'
    );
    assert.strictEqual(
      subD.stdout.includes('Server listening on http'),
      false,
      'HTTP listener must NOT start when reconciler fails in production'
    );

    const portOpenD = await isPortListening(testPortD);
    assert.strictEqual(portOpenD, false, 'Port 5184 must not be listening');

    passed++;
    console.log('  ✅ PASS: Test D — Import reconciliation failure in production rejects startup');
  }

  // ---------------------------------------------------------------------------
  // Part 6: Test E — Development Fallback Remains Compatible
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 6: Test E — Development Fallback Compatibility ---');

  {
    const subE = runSubprocess(`
      process.env.NODE_ENV = 'development';
      process.env.DB_PORT = '65530';

      const db = require('./server/config/database');
      db.initDB()
        .then(() => {
          const status = db.getStatus();
          console.log('[STATUS_DEV] isMySQL=' + status.isMySQL + ' type=' + status.type + ' message=' + status.message);
          process.exit(0);
        })
        .catch((err) => {
          console.error('[ERROR_DEV] ' + err.message);
          process.exit(1);
        });
    `);

    assert.strictEqual(subE.status, 0, 'Development must not crash when MySQL is unreachable');
    const combinedOutput = subE.stdout + '\n' + subE.stderr;
    assert.ok(
      combinedOutput.includes('Using resilient embedded storage'),
      'Development must activate resilient embedded storage fallback'
    );
    assert.ok(
      subE.stdout.includes('isMySQL=false'),
      'getStatus().isMySQL must report false in fallback mode'
    );
    assert.ok(
      subE.stdout.includes('type=Embedded SQLite/JSON Store'),
      'getStatus().type must indicate embedded store'
    );

    passed++;
    console.log('  ✅ PASS: Test E — Development mode preserves embedded JSON fallback when MySQL is unreachable');
  }

  // ---------------------------------------------------------------------------
  // Part 7: Test F — Production MySQL Success
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 7: Test F — Production MySQL Success ---');

  {
    const testPortF = 5186;
    const dbNameF = `flowden_test_prod_success_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    assert.match(dbNameF, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
    assert.notStrictEqual(dbNameF, 'flowden', 'Must never use primary flowden DB');
    assert.notStrictEqual(dbNameF, 'flowden_test', 'Must never use flowden_test DB');

    const subF = runSubprocess(`
      process.env.NODE_ENV = 'production';
      process.env.DB_NAME = '${dbNameF}';
      process.env.PORT = '${testPortF}';
      process.env.JWT_SECRET = '${VALID_PROD_JWT}';

      const app = require('./server/index');
      const http = require('http');

      app.start()
        .then((server) => {
          http.get('http://127.0.0.1:${testPortF}/api/health', (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
              console.log('[HEALTH_BODY] ' + raw);
              server.close(() => {
                const db = require('./server/config/database');
                const pool = db.getPool();
                if (pool) {
                  pool.end().then(() => {
                    console.log('[CLEANUP] Server and pool cleanly closed.');
                    process.exit(0);
                  });
                } else {
                  process.exit(0);
                }
              });
            });
          }).on('error', (err) => {
            console.error('[HEALTH_REQUEST_ERROR] ' + err.message);
            server.close(() => process.exit(1));
          });
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `, {}, 20000);

    assert.strictEqual(subF.status, 0, `Production startup on valid MySQL must exit with 0. Stderr: ${subF.stderr}`);
    assert.ok(
      subF.stdout.includes('MySQL migrations executed successfully via authoritative runner'),
      'Migrations must run and report success'
    );
    assert.ok(
      subF.stdout.includes('Server listening on http://localhost:5186'),
      'Server must listen on configured port'
    );
    assert.ok(
      subF.stdout.includes('[CLEANUP] Server and pool cleanly closed.'),
      'Clean shutdown must be confirmed'
    );

    // Parse the health response emitted from child process
    const healthMatch = subF.stdout.match(/\[HEALTH_BODY\]\s*(\{.*\})/);
    assert.ok(healthMatch, 'Must capture [HEALTH_BODY] JSON output');
    const health = JSON.parse(healthMatch[1]);

    assert.strictEqual(health.status, 'ok', 'Health status must be ok');
    assert.strictEqual(health.product, 'Flowden');
    assert.strictEqual(health.database.isMySQL, true, 'Health must confirm isMySQL === true');
    assert.strictEqual(health.database.type, 'MySQL 8.0+', 'Health must confirm type === "MySQL 8.0+"');

    // Verify database was preserved (no drop)
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';

    const verifyConn = await mysql.createConnection({ host, port, user, password });
    const [databases] = await verifyConn.query(`SHOW DATABASES LIKE '${dbNameF}'`);
    assert.strictEqual(databases.length, 1, `Test database ${dbNameF} must be preserved (never dropped)`);
    await verifyConn.end();

    passed++;
    console.log(`  ✅ PASS: Test F — Production successfully initializes MySQL, runs migrations, serves /api/health with isMySQL=true, cleanly closes, preserves DB "${dbNameF}"`);
  }

  console.log(`\n=== ALL ${passed} PRODUCTION FAIL-CLOSED & STARTUP INTEGRITY TESTS PASSED ===\n`);
}

runProductionFailClosedTests().catch((err) => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
