// tests/project_members_role_validation.test.js
/**
 * Isolated tests for Project Member Role consistency and validation.
 *
 * Requirements:
 * 1. Strictly isolated unique test database generated per execution (never uses flowden or flowden_test).
 * 2. Never drops databases, truncates tables, or deletes existing user records.
 * 3. Authoritative migrations 001-008 applied and verified against MySQL.
 * 4. Verifies:
 *    - Owner can grant 'editor' role (HTTP 201)
 *    - Owner can grant 'viewer' role (HTTP 201)
 *    - Granting 'admin' is strictly rejected with HTTP 400 (INVALID_MEMBER_ROLE)
 *    - Granting 'owner' is strictly rejected with HTTP 400 (INVALID_MEMBER_ROLE)
 *    - Granting invalid roles is strictly rejected with HTTP 400
 *    - Non-owner cannot grant membership (HTTP 403)
 *    - Direct database inspection confirms no 'admin' role in project_members
 * 5. Database preserved after execution; pool and server closed cleanly.
 */

const crypto = require('crypto');
const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');

// Generate unique isolated database name (letters, numbers, underscores only)
const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_role_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use primary flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test default database');

const TEST_PORT = 5066;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Set process.env.DB_NAME BEFORE any application or database modules are loaded
process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = 'flowden_role_validation_secret_key_32bytes!';

require('dotenv').config();

async function runTests() {
  console.log('=== STARTING PROJECT MEMBERS ROLE VALIDATION TESTS ===\n');
  console.log(`[SETUP] Unique Isolated Database: ${ISOLATED_DB_NAME}`);
  console.log(`[SETUP] Test Server Port: ${TEST_PORT}`);

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  // 1. Verify MySQL connection and create isolated database without dropping
  let preConn;
  try {
    preConn = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
  } catch (err) {
    console.error('[BLOCKED] MySQL connection unavailable for role validation test:', err.message);
    process.exit(1);
  }

  try {
    // Check collision - never overwrite
    const [existing] = await preConn.query('SHOW DATABASES LIKE ?', [ISOLATED_DB_NAME]);
    if (existing && existing.length > 0) {
      throw new Error(`[SAFETY BLOCKED] Database collision detected for "${ISOLATED_DB_NAME}". Refusing to overwrite.`);
    }

    // Create database safely without dropping
    await preConn.query(`CREATE DATABASE \`${ISOLATED_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`[SETUP] Created isolated database "${ISOLATED_DB_NAME}" (no drop).`);
  } finally {
    await preConn.end();
  }

  // 2. Initialize application database and run authoritative migrations
  const db = require('../server/config/database');
  const { runMigrations } = require('../server/migrations/runner');
  const SecurityService = require('../server/services/securityService');

  await db.initDB();

  // Explicitly verify MySQL connection
  assert.strictEqual(db.getStatus().isMySQL, true, 'db.getStatus().isMySQL must report true');
  assert.ok(db.getPool(), 'db.getPool() must not be null');
  console.log(`[SETUP] Connected to MySQL: ${db.getStatus().message}`);

  const pool = db.getPool();
  await runMigrations(pool);
  await SecurityService.ensureSecurityTables();
  console.log('[SETUP] Migrations 001-008 applied successfully.');

  // 3. Start test HTTP server
  const app = require('../server/index');
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] Test server listening on ${BASE_URL}`);
      resolve(s);
    });
  });

  let passed = 0;

  try {
    async function apiRequest(endpoint, { method = 'GET', body = null, token = null } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, data };
    }

    // Step 1: Register Owner and Member users
    const ownerRes = await apiRequest('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `role_owner_${Date.now()}@flowden.test`,
        password: 'Password123!@#',
        display_name: 'Role Owner'
      }
    });
    assert.strictEqual(ownerRes.status, 201);
    const ownerToken = ownerRes.data.token;
    const ownerId = ownerRes.data.user.id;

    const memberRes = await apiRequest('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `role_member_${Date.now()}@flowden.test`,
        password: 'Password123!@#',
        display_name: 'Role Member'
      }
    });
    assert.strictEqual(memberRes.status, 201);
    const memberToken = memberRes.data.token;
    const memberId = memberRes.data.user.id;

    // Step 2: Create Project as Owner
    const projRes = await apiRequest('/api/v1/projects', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Project Role Consistency Test',
        description: 'Testing member role validation'
      }
    });
    assert.strictEqual(projRes.status, 201);
    const projectId = projRes.data.project.id;

    // Test 1: Granting 'editor' role succeeds
    const grantEditorRes = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: ownerToken,
      body: { user_id: memberId, role: 'editor' }
    });
    assert.strictEqual(grantEditorRes.status, 201, 'Owner granting editor role must return 201');
    assert.strictEqual(grantEditorRes.data.role, 'editor');
    passed++;
    console.log('  ✅ PASS: Granting valid role "editor" succeeds with HTTP 201');

    // Test 2: Granting 'viewer' role succeeds
    const grantViewerRes = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: ownerToken,
      body: { user_id: memberId, role: 'viewer' }
    });
    assert.strictEqual(grantViewerRes.status, 201, 'Owner granting viewer role must return 201');
    assert.strictEqual(grantViewerRes.data.role, 'viewer');
    passed++;
    console.log('  ✅ PASS: Granting valid role "viewer" succeeds with HTTP 201');

    // Test 3: Granting 'admin' role is rejected with HTTP 400
    const grantAdminRes = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: ownerToken,
      body: { user_id: memberId, role: 'admin' }
    });
    assert.strictEqual(grantAdminRes.status, 400, 'Granting admin role must return 400');
    assert.strictEqual(grantAdminRes.data.code, 'INVALID_MEMBER_ROLE');
    passed++;
    console.log('  ✅ PASS: Granting invalid role "admin" is rejected with HTTP 400 (INVALID_MEMBER_ROLE)');

    // Test 4: Granting 'owner' role via /members is rejected with HTTP 400
    const grantOwnerRes = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: ownerToken,
      body: { user_id: memberId, role: 'owner' }
    });
    assert.strictEqual(grantOwnerRes.status, 400, 'Granting owner role via /members must return 400');
    assert.strictEqual(grantOwnerRes.data.code, 'INVALID_MEMBER_ROLE');
    passed++;
    console.log('  ✅ PASS: Granting role "owner" via /members is rejected with HTTP 400 (owner remains authoritative)');

    // Test 5: Granting arbitrary invalid role (e.g. 'superuser') is rejected with HTTP 400
    const grantSuperuserRes = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: ownerToken,
      body: { user_id: memberId, role: 'superuser' }
    });
    assert.strictEqual(grantSuperuserRes.status, 400, 'Arbitrary invalid role must return 400');
    assert.strictEqual(grantSuperuserRes.data.code, 'INVALID_MEMBER_ROLE');
    passed++;
    console.log('  ✅ PASS: Arbitrary role strings are rejected with HTTP 400 (no silent fallback)');

    // Test 6: Non-owner attempting to grant membership is rejected with HTTP 403
    const nonOwnerGrant = await apiRequest(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      token: memberToken,
      body: { user_id: memberId, role: 'editor' }
    });
    assert.strictEqual(nonOwnerGrant.status, 403, 'Non-owner must be rejected with 403');
    passed++;
    console.log('  ✅ PASS: Non-owner cannot grant project membership (HTTP 403)');

    // Test 7: Verify database state only contains authoritative enum values
    const [dbRows] = await pool.query(
      'SELECT project_id, user_id, role FROM project_members WHERE project_id = ?',
      [projectId]
    );
    for (const r of dbRows) {
      assert.ok(
        ['owner', 'editor', 'viewer'].includes(r.role),
        `Role in DB must be valid project_members enum, got: ${r.role}`
      );
      assert.notStrictEqual(r.role, 'admin', 'Database must never contain admin in project_members');
    }
    passed++;
    console.log('  ✅ PASS: Direct database verification confirms no "admin" role exists in project_members');

    console.log(`\n=== ALL ${passed}/7 ROLE VALIDATION TESTS PASSED ===\n`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('[CLEANUP] Test server closed.');
    await pool.end();
    console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
