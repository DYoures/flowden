// tests/project_members_role_validation.test.js
/**
 * Isolated tests for Project Member Role consistency and validation.
 * Verifies that:
 * 1. Owner can grant 'editor' role (HTTP 201)
 * 2. Owner can grant 'viewer' role (HTTP 201)
 * 3. Granting 'admin' is strictly rejected with HTTP 400
 * 4. Granting 'owner' is strictly rejected with HTTP 400
 * 5. Granting invalid roles is strictly rejected with HTTP 400
 * 6. Non-owner cannot grant membership (HTTP 403)
 * 7. Database records confirm only valid enum values are written
 */

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'flowden_test';
process.env.PORT = '5066';

const db = require('../server/config/database');
const app = require('../server/index');

const TEST_PORT = 5066;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runTests() {
  console.log('=== STARTING PROJECT MEMBERS ROLE VALIDATION TESTS ===\n');

  await db.initDB();
  const pool = db.getPool();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] Test server listening on http://127.0.0.1:${TEST_PORT}`);
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

    // 1. Register Owner and Member users
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

    // 2. Create Project as Owner
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
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
