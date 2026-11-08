// tests/issue5_real_mysql.test.js
const assert = require('assert');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const db = require('../server/config/database');
const { app } = require('../server/index');
const authConfig = require('../server/config/auth');
const SearchService = require('../server/services/searchService');
const searchNotesTool = require('../server/mcp/tools/searchNotes');

console.log('================================================================');
console.log('  FLOWDEN ISSUE 5 — UNIVERSAL SEARCH & AUTH REAL MYSQL SUITE');
console.log('================================================================\n');

const TEST_PORT = 3016;

function makeRequest(port, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ statusCode: res.statusCode, headers: res.headers, data: json });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'flowden_test',
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z'
  });
}

async function cleanupFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM entity_links WHERE id >= 77000 AND id < 78000');
    await conn.query('DELETE FROM board_items WHERE id >= 77000 AND id < 78000');
    await conn.query('DELETE FROM boards WHERE id >= 77000 AND id < 78000');
    await conn.query('DELETE FROM project_entities WHERE project_id IN (77010, 77020, 77030)');
    await conn.query('DELETE FROM project_members WHERE project_id IN (77010, 77020, 77030)');
    await conn.query('DELETE FROM entities WHERE id >= 770000 AND id < 780000');
    await conn.query('DELETE FROM projects WHERE id IN (77010, 77020, 77030)');
    await conn.query('DELETE FROM users WHERE id IN (77001, 77002, 77003)');
  } finally {
    conn.release();
  }
}

async function setupFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    // 1. Users
    // Alice (77001), Bob (77002), Charlie (77003)
    await conn.query(`
      INSERT INTO users (id, email, password_hash, display_name, role, settings_json) VALUES
      (77001, 'alice77001@verify.local', 'hash1', 'Alice Owner', 'user', ?),
      (77002, 'bob77002@verify.local', 'hash2', 'Bob Member', 'user', ?),
      (77003, 'charlie77003@verify.local', 'hash3', 'Charlie Other', 'user', ?)
    `, [
      JSON.stringify({ mcp: { apiKey: 'mcp-key-alice', enabledProjects: [77010] } }),
      JSON.stringify({ mcp: { apiKey: 'mcp-key-bob', enabledProjects: [77010] } }),
      JSON.stringify({ mcp: { apiKey: 'mcp-key-charlie', enabledProjects: [77030] } })
    ]);

    // 2. Projects
    // Alpha (77010, Alice), Beta (77020, Alice), Gamma (77030, Charlie)
    await conn.query(`
      INSERT INTO projects (id, user_id, title) VALUES
      (77010, 77001, 'Project Alpha'),
      (77020, 77001, 'Project Beta'),
      (77030, 77003, 'Project Gamma')
    `);

    // 2b. Boards
    await conn.query(`
      INSERT INTO boards (id, project_id, user_id, title) VALUES
      (77220, 77020, 77001, 'Beta Board')
    `);

    // 3. Project Members
    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES
      (77010, 77001, 'owner', NULL),
      (77010, 77002, 'editor', NULL),
      (77020, 77001, 'owner', NULL),
      (77020, 77002, 'viewer', NULL),
      (77030, 77003, 'owner', NULL)
    `);

    // 4. Entities
    await conn.query(`
      INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, deleted_at) VALUES
      (770011, 'uuid-77101', 'note', 77101, 77001, 77010, 'Alpha Architecture Blueprint', 'Deep architectural blueprint and implementation roadmap for Project Alpha', NULL),
      (770012, 'uuid-77102', 'note', 77102, 77001, NULL, 'Alice Confidential Strategy', 'Confidential personal strategy notes not shared with anyone', NULL),
      (770013, 'uuid-77103', 'capture', 77103, 77001, 77010, 'Alice Secret Brainstorm Capture', 'Spontaneous brainstorming capture item', NULL),
      (770014, 'uuid-77104', 'note', 77104, 77001, 77010, 'Old Deprecated Architecture Roadmap', 'Trashed roadmap discarded last sprint', '2026-10-01 00:00:00'),
      (770015, 'uuid-77105', 'note', 77105, 77003, 77030, 'Gamma Secret Project Blueprint', 'Highly classified architecture exclusively for project gamma', NULL),
      (770016, 'uuid-77106', 'note', 77106, 77001, 77010, 'Alpha Cross-Project Export Spec', 'Export specifications to be shared between project alpha and beta', NULL),
      (770017, 'uuid-77107', 'note', 77107, 77001, 77010, 'Alpha Internal Private Notes', 'Strictly internal alpha project details never shared to beta', NULL),
      (770018, 'uuid-77010', 'project', 77010, 77001, 77010, 'Project Alpha', 'Main alpha project workspace', NULL)
    `);

    // 5. Project Entities (primary project mapping)
    await conn.query(`
      INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by) VALUES
      (77010, 'note', 77101, 'admin', 77001),
      (77010, 'note', 77104, 'admin', 77001),
      (77010, 'note', 77106, 'admin', 77001),
      (77010, 'note', 77107, 'admin', 77001),
      (77030, 'note', 77105, 'admin', 77003)
    `);

    // 6. Entity Links
    await conn.query(`
      INSERT INTO entity_links (id, user_id, source_type, source_id, target_type, target_id, link_type, origin, context_snippet, is_confirmed, deleted_at) VALUES
      (77001, 77001, 'note', 77102, 'note', 77101, 'references', 'inline_link', 'References confidential strategy from Alpha blueprint', 1, NULL),
      (77002, 77003, 'note', 77105, 'note', 77101, 'references', 'inline_link', 'Cross link from Gamma to Alpha blueprint', 1, NULL),
      (77003, 77001, 'note', 77106, 'note', 77101, 'references', 'inline_link', 'Spec references Alpha blueprint', 1, NULL)
    `);

  } finally {
    conn.release();
  }
}

async function runTests() {
  const pool = await createPool();
  const conn = await pool.getConnection();

  let passedTests = 0;
  let totalTests = 0;
  let server = null;

  try {
    // Safety checks
    const [dbRows] = await conn.query('SELECT DATABASE() AS db, VERSION() AS ver');
    const currentDb = dbRows[0].db;
    const currentVer = dbRows[0].ver;
    console.log(`[Environment] Real MySQL Connection: ${currentDb} on version ${currentVer}`);
    assert.strictEqual(currentDb, 'flowden_test', 'Must connect ONLY to flowden_test');
    assert(currentVer.startsWith('8.4'), 'Must run on MySQL 8.4.x');

    // Initialize application database singleton
    await db.initDB();
    assert.strictEqual(db.isConnectedToMySQL, true, 'db.isConnectedToMySQL must be true');

    // Setup HTTP server
    server = http.createServer(app);
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    console.log(`[HTTP Server] Listening on port ${TEST_PORT}\n`);

    // Setup fixtures
    await cleanupFixtures(pool);
    await setupFixtures(pool);

    // Auth Tokens
    const aliceToken = jwt.sign({ id: 77001, email: 'alice77001@verify.local' }, authConfig.jwtSecret, { expiresIn: '1h' });
    const bobToken = jwt.sign({ id: 77002, email: 'bob77002@verify.local' }, authConfig.jwtSecret, { expiresIn: '1h' });
    const charlieToken = jwt.sign({ id: 77003, email: 'charlie77003@verify.local' }, authConfig.jwtSecret, { expiresIn: '1h' });

    console.log('--- PART A: PERSONAL KNOWLEDGE PRIVACY ---\n');

    // Test A1: A user can search their own personal knowledge
    totalTests++;
    try {
      console.log('[Test A1: User searches own personal knowledge]');
      const res = await SearchService.universalSearch(pool, 77001, 'Strategy');
      assert.strictEqual(res.length, 1, 'Alice must find exactly 1 result');
      assert.strictEqual(res[0].entity_id, 77102, 'Must match Alice private strategy note');
      console.log('  ✅ PASSED: A1. User successfully discovered own personal knowledge');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED A1:', e);
      throw e;
    }

    // Test A2: Another user cannot discover that personal knowledge
    totalTests++;
    try {
      console.log('\n[Test A2: Another user cannot discover personal knowledge]');
      const resBob = await SearchService.universalSearch(pool, 77002, 'Strategy');
      assert.strictEqual(resBob.length, 0, 'Bob must NOT find Alice private strategy note');
      const resCharlie = await SearchService.universalSearch(pool, 77003, 'Strategy');
      assert.strictEqual(resCharlie.length, 0, 'Charlie must NOT find Alice private strategy note');
      console.log('  ✅ PASSED: A2. Other users blocked from discovering personal knowledge');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED A2:', e);
      throw e;
    }

    // Test A3: Semantic relationship does not grant access to private entity
    totalTests++;
    try {
      console.log('\n[Test A3: Semantic entity_links does not leak private entities in backlinks / graph]');
      // Bob requests backlinks for Shared Note 77101
      const bobBacklinks = await SearchService.getBacklinks(pool, 77002, { entityType: 'note', entityId: 77101 });
      const leakedPrivate = bobBacklinks.some(l => l.source_entity_id === 77102 || l.source_entity_id === 77105);
      assert.strictEqual(leakedPrivate, false, 'Backlinks must not leak private or inaccessible sources');

      // Bob requests graph
      const bobGraph = await SearchService.getGraph(pool, 77002);
      const privateInNodes = bobGraph.nodes.some(n => n.entity_id === 77102 || n.entity_id === 77105);
      const privateInEdges = bobGraph.edges.some(e => e.source_id === 77102 || e.source_id === 77105);
      assert.strictEqual(privateInNodes, false, 'Private entities must not appear in graph nodes');
      assert.strictEqual(privateInEdges, false, 'Private entities must not appear in graph edges');

      console.log('  ✅ PASSED: A3. Semantic links do not grant access across privacy boundaries');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED A3:', e);
      throw e;
    }

    console.log('\n--- PART B: PROJECT MEMBERSHIP ---\n');

    // Test B1: Authorized project owner can search project entities
    totalTests++;
    try {
      console.log('[Test B1: Authorized project owner searches project entities]');
      const res = await SearchService.universalSearch(pool, 77001, 'Blueprint');
      assert(res.some(r => r.entity_id === 77101), 'Alice (owner) must find Alpha Blueprint');
      console.log('  ✅ PASSED: B1. Project owner can search project entities');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED B1:', e);
      throw e;
    }

    // Test B2: Active authorized member can search entities permitted by their project role
    totalTests++;
    try {
      console.log('\n[Test B2: Active member searches entities in their project]');
      const res = await SearchService.universalSearch(pool, 77002, 'Blueprint');
      assert(res.some(r => r.entity_id === 77101), 'Bob (editor on Alpha) must find Alpha Blueprint');
      console.log('  ✅ PASSED: B2. Active member can search authorized project entities');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED B2:', e);
      throw e;
    }

    // Test B3: Viewer cannot perform unauthorized management operations
    totalTests++;
    try {
      console.log('\n[Test B3: Viewer role restriction on management operations]');
      const { canManageSql } = require('../server/utils/authPredicates');
      const auth = canManageSql('b', 77002, 'board');
      // Execute against real boards query in Beta project where Bob is viewer
      const [testCheck] = await conn.query(`
        SELECT COUNT(*) as cnt FROM boards b
        WHERE b.project_id = 77020 AND ${auth.sql}
      `, auth.params);
      assert.strictEqual(Number(testCheck[0].cnt), 0, 'Viewer role must not have manage permissions');
      console.log('  ✅ PASSED: B3. Viewer role prevented from management authorization');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED B3:', e);
      throw e;
    }

    // Test B4: Revoked membership cannot grant search access
    totalTests++;
    try {
      console.log('\n[Test B4: Revoked membership immediately blocks search access]');
      // Revoke Bob's membership in Project Alpha
      await conn.query('UPDATE project_members SET revoked_at = NOW() WHERE project_id = 77010 AND user_id = 77002');

      const resRevoked = await SearchService.universalSearch(pool, 77002, 'Blueprint');
      const foundAlpha = resRevoked.some(r => r.entity_id === 77101);
      assert.strictEqual(foundAlpha, false, 'Revoked member must NOT find project entities');

      // Un-revoke Bob for subsequent tests
      await conn.query('UPDATE project_members SET revoked_at = NULL WHERE project_id = 77010 AND user_id = 77002');
      console.log('  ✅ PASSED: B4. Revoked membership immediately revokes search visibility');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED B4:', e);
      throw e;
    }

    // Test B5: Project member cannot discover private entities belonging to another unrelated project
    totalTests++;
    try {
      console.log('\n[Test B5: Project member cannot discover unrelated project private entities]');
      // Note 77105 belongs to Project Gamma (Charlie)
      const res = await SearchService.universalSearch(pool, 77002, 'Gamma');
      assert.strictEqual(res.length, 0, 'Bob must not discover entities from Project Gamma');
      console.log('  ✅ PASSED: B5. Cross-project isolation strictly enforced between unrelated projects');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED B5:', e);
      throw e;
    }

    console.log('\n--- PART C: CROSS-PROJECT SHARING ---\n');

    // Test C1: Explicitly shared entity is visible to authorized member of receiving project
    totalTests++;
    try {
      console.log('[Test C1: Explicit cross-project sharing grants visibility]');
      // Note 77106 is originally in Alpha. Explicitly share it to Project Beta:
      await conn.query(`
        INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
        VALUES (77020, 'note', 77106, 'viewer', 77001)
      `);

      // Bob (member of Beta) searches scoped to Beta:
      const resBeta = await SearchService.universalSearch(pool, 77002, 'Export', {
        activeProjectId: 77020,
        includePersonal: false
      });
      assert.strictEqual(resBeta.length, 1, 'Bob must find shared note in Beta');
      assert.strictEqual(resBeta[0].entity_id, 77106);
      console.log('  ✅ PASSED: C1. Explicitly shared entity visible to receiving project member');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED C1:', e);
      throw e;
    }

    // Test C2: Removing explicit sharing permission removes access
    totalTests++;
    try {
      console.log('\n[Test C2: Removing explicit sharing removes access]');
      await conn.query('DELETE FROM project_entities WHERE project_id = 77020 AND entity_id = 77106');

      const resAfter = await SearchService.universalSearch(pool, 77002, 'Export', {
        activeProjectId: 77020,
        includePersonal: false
      });
      assert.strictEqual(resAfter.length, 0, 'Bob must no longer see unshared note in Beta');
      console.log('  ✅ PASSED: C2. Revoking share permission immediately removes access');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED C2:', e);
      throw e;
    }

    // Test C3: Merely creating entity_links relationship does NOT grant cross-project access
    totalTests++;
    try {
      console.log('\n[Test C3: entity_links alone does NOT grant cross-project access]');
      // Link exists from 77107 (Alpha) to an entity in Beta, but NOT shared in project_entities
      await conn.query(`
        INSERT INTO entity_links (id, user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed)
        VALUES (77004, 77001, 'note', 77107, 'project', 77020, 'relates_to', 'manual', 1)
        ON DUPLICATE KEY UPDATE is_confirmed = 1
      `);

      const resBeta = await SearchService.universalSearch(pool, 77002, 'Internal', {
        activeProjectId: 77020,
        includePersonal: false
      });
      assert.strictEqual(resBeta.length, 0, 'Link relationship alone must not grant cross-project access');
      console.log('  ✅ PASSED: C3. Relationship alone does not bypass project sharing boundary');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED C3:', e);
      throw e;
    }

    // Test C4: Sharing must not expose unrelated entities in the source project
    totalTests++;
    try {
      console.log('\n[Test C4: Sharing one entity does not expose unrelated source entities]');
      // Re-share 77106 to Beta
      await conn.query(`
        INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
        VALUES (77020, 'note', 77106, 'viewer', 77001)
      `);

      // Search for 'Internal' (77107) in Beta
      const resUnrelated = await SearchService.universalSearch(pool, 77002, 'Internal', {
        activeProjectId: 77020,
        includePersonal: false
      });
      assert.strictEqual(resUnrelated.length, 0, 'Unrelated entity 77107 must remain inaccessible in Beta');
      console.log('  ✅ PASSED: C4. Sharing strictly limited to designated entity');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED C4:', e);
      throw e;
    }

    console.log('\n--- PART D: UNIVERSAL SEARCH API ---\n');

    // Test D1: Search results contain only authorized entities via HTTP route
    totalTests++;
    try {
      console.log('[Test D1: Alice searches via HTTP route]');
      const res = await makeRequest(TEST_PORT, 'GET', '/api/v1/search?q=Strategy', {
        'Authorization': `Bearer ${aliceToken}`
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.total, 1);
      assert.strictEqual(res.data.entities[0].entity_id, 77102);
      console.log('  ✅ PASSED: D1. Alice search returned authorized private entity');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED D1:', e);
      throw e;
    }

    // Test D2: Unauthorized results are not leaked through total counts
    totalTests++;
    try {
      console.log('\n[Test D2: Bob searches for Alice strategy: zero leakage in total count]');
      const res = await makeRequest(TEST_PORT, 'GET', '/api/v1/search?q=Strategy', {
        'Authorization': `Bearer ${bobToken}`
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.total, 0, 'Total count must be 0 for unauthorized user');
      assert.strictEqual(res.data.entities.length, 0);
      console.log('  ✅ PASSED: D2. Zero count leakage for unauthorized query');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED D2:', e);
      throw e;
    }

    // Test D3: Soft-deleted entity and other user Quick Capture never leaked
    totalTests++;
    try {
      console.log('\n[Test D3: Soft-deleted and Quick Capture isolation via HTTP]');
      // Bob searches for "Architecture"
      const res = await makeRequest(TEST_PORT, 'GET', '/api/v1/search?q=Architecture', {
        'Authorization': `Bearer ${bobToken}`
      });
      assert.strictEqual(res.statusCode, 200);
      // Should include Note 77101, but NOT soft-deleted 77104
      const ids = res.data.entities.map(e => e.entity_id);
      assert(ids.includes(77101), 'Must include active Alpha Blueprint');
      assert(!ids.includes(77104), 'Must NOT include soft-deleted note 77104');

      // Bob searches for "Brainstorm" (Alice Quick Capture 77103)
      const resCapture = await makeRequest(TEST_PORT, 'GET', '/api/v1/search?q=Brainstorm', {
        'Authorization': `Bearer ${bobToken}`
      });
      assert.strictEqual(resCapture.data.total, 0, 'Alice quick capture must NOT appear in Bob search');

      console.log('  ✅ PASSED: D3. Soft-deleted entities and foreign quick captures completely filtered');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED D3:', e);
      throw e;
    }

    // Test D4: FULLTEXT search executes against MySQL index
    totalTests++;
    try {
      console.log('\n[Test D4: FULLTEXT index execution on MySQL 8.4]');
      const [explain] = await conn.query(`
        EXPLAIN SELECT e.id, MATCH(e.title, e.search_text) AGAINST ('Blueprint' IN NATURAL LANGUAGE MODE) AS score
        FROM entities e
        WHERE MATCH(e.title, e.search_text) AGAINST ('Blueprint' IN NATURAL LANGUAGE MODE)
          AND e.deleted_at IS NULL
      `);
      assert(explain[0].possible_keys.includes('ft_entity_search'), 'EXPLAIN possible_keys must contain ft_entity_search');
      console.log(`  EXPLAIN key: ${explain[0].key}, type: ${explain[0].type}`);
      console.log('  ✅ PASSED: D4. FULLTEXT index verified on entities(title, search_text)');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED D4:', e);
      throw e;
    }

    console.log('\n--- PART E: MCP AUTHORIZATION ---\n');

    // Test E1: Enabled project is searchable by authorized MCP user
    totalTests++;
    try {
      console.log('[Test E1: Enabled project searchable via MCP call]');
      const res = await searchNotesTool.execute(77001, {
        query: 'Architecture'
      });
      assert(res.results.length >= 1, 'MCP search must return results for enabled project');
      assert(res.results.some(r => r.entity_id === 77101), 'Must return Note 77101');
      console.log('  ✅ PASSED: E1. Authorized MCP user can search enabled project');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED E1:', e);
      throw e;
    }

    // Test E2: Disabled project cannot be searched through MCP
    totalTests++;
    try {
      console.log('\n[Test E2: Disabled project cannot be searched through MCP]');
      const res = await searchNotesTool.execute(77001, {
        query: 'Architecture',
        project_id: 77030 // Gamma is not enabled for Alice
      });
      assert.strictEqual(res.results.length, 0);
      assert(res.error || res.results.length === 0, 'Must return error or 0 results for non-enabled project');
      console.log('  ✅ PASSED: E2. Non-enabled project rejected by MCP');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED E2:', e);
      throw e;
    }

    // Test E3: Revoked membership blocks MCP search
    totalTests++;
    try {
      console.log('\n[Test E3: Revoked membership blocks MCP search]');
      // Revoke Bob's membership in Alpha
      await conn.query('UPDATE project_members SET revoked_at = NOW() WHERE project_id = 77010 AND user_id = 77002');

      const res = await searchNotesTool.execute(77002, {
        query: 'Architecture'
      });
      assert.strictEqual(res.results.length, 0, 'Revoked member must receive 0 MCP search results');

      // Restore Bob
      await conn.query('UPDATE project_members SET revoked_at = NULL WHERE project_id = 77010 AND user_id = 77002');
      console.log('  ✅ PASSED: E3. Revoked membership immediately blocks MCP search');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED E3:', e);
      throw e;
    }

    // Test E4: Linked entity outside authorized scope remains inaccessible via MCP
    totalTests++;
    try {
      console.log('\n[Test E4: Linked entity outside MCP scope remains inaccessible]');
      // Alice personal note 77102 is linked to Alpha Blueprint 77101, but is NOT in project_entities
      const res = await searchNotesTool.execute(77001, {
        query: 'Strategy'
      });
      assert.strictEqual(res.results.length, 0, 'Personal non-project notes must not appear in MCP search');
      console.log('  ✅ PASSED: E4. External/personal notes remain excluded from MCP scope');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED E4:', e);
      throw e;
    }

    // Test E5: MCP and app visibility rule compatibility
    totalTests++;
    try {
      console.log('\n[Test E5: MCP and app search enforce compatible visibility]');
      // Quick capture 77103 is personal: in App search, Alice sees it; in MCP search, omitted
      const appRes = await SearchService.universalSearch(pool, 77001, 'Brainstorm');
      assert.strictEqual(appRes.length, 1, 'Alice sees own capture in App search');

      const mcpRes = await searchNotesTool.execute(77001, { query: 'Brainstorm' });
      assert.strictEqual(mcpRes.results.length, 0, 'Personal capture omitted in MCP tool search');

      console.log('  ✅ PASSED: E5. MCP and application search enforce compatible, secure visibility');
      passedTests++;
    } catch (e) {
      console.error('  ❌ FAILED E5:', e);
      throw e;
    }

    // Invariant Check
    console.log('\n--- INVARIANT CHECK ---');
    const violations = await SearchService.checkInvariant(pool);
    console.log(`primary_project_id ⊆ project_entities violations: ${violations}`);
    assert.strictEqual(violations, 0, 'Invariant violations must be 0');
    console.log('  ✅ PASSED: Invariant check satisfied (0 violations)');

    console.log('\n================================================================');
    console.log(`  🎉 ALL REAL MYSQL SEARCH AUTH TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Cleaning up verification fixtures...');
    await cleanupFixtures(pool);
    console.log('[Cleanup] Done. Task-owned fixtures safely removed.');
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    conn.release();
    await pool.end();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ REAL MYSQL SEARCH AUTH TEST ERROR:', err);
  process.exit(1);
});
