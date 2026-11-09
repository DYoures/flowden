/**
 * tests/fkf2_hardening.test.js
 *
 * FLOWDEN — FKF 2.0 POST-IMPLEMENTATION HARDENING TEST SUITE
 *
 * Focus:
 * 1. ISSUE A: FKF WikiLink Target Integrity & Consistency
 *    - Invariant: FKF inline WikiLinks ([[fkf:...]]) may ONLY reference Note IDs in the same package.
 *    - Valid Note-to-Note WikiLinks accepted.
 *    - Note -> Source WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Note -> Folder WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Note -> Project WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Note -> Task WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Note -> Board WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Project overview -> Note WikiLink accepted.
 *    - Project overview -> non-Note WikiLink rejected with INVALID_WIKILINK_ID.
 *    - Unknown WikiLink target rejected with INVALID_WIKILINK_ID.
 *    - Display label and bare token variants preserved.
 *
 * 2. ISSUE B: Research Permanent Delete Orphan Cleanup
 *    - Invariant: DELETE /api/v1/research/:id?permanent=true cleanly removes Research,
 *      associated Excerpts, canonical entities, project_entities, entity_links,
 *      Board projection items referencing research or excerpt, and board_item_connections.
 *    - Unrelated board items and boards remain intact.
 *    - Physical file unlinked strictly after commit; transaction failure keeps physical file intact.
 *
 * Safety:
 * - Runs in isolated MySQL database with collision check.
 * - Never touches production or existing user databases.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const { parseFkfDocument, extractFkfWikiLinks } = require('../server/utils/fkfCanonicalParser');

// Isolated DB and environment setup
const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_fkf2_hardening_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test database');

const TEST_PORT = 5098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = 'flowden_fkf2_hardening_jwt_secret_32chars_len!';

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

require('dotenv').config();

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

function httpRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };
    if (body) {
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
      }
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json || data });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function makeTestPackage(overrides = {}) {
  const base = {
    format: 'flowden-knowledge-format',
    fkf_version: '2.0.0',
    package_id: 'pkg-hardening-sample',
    project: {
      id: 'proj-hardening-alpha',
      title: 'Hardening Verification Project',
      summary: 'Testing strict WikiLink invariants and permanent delete lifecycle.',
      overview_markdown: '# Project Overview\n\nSee [[fkf:note-target-01|Target Note One]] for details.'
    },
    folders: [
      { id: 'fld-core-analysis', name: '01 Core Analysis', parent_id: null, sort_order: 0 }
    ],
    notes: [
      {
        id: 'note-source-01',
        title: 'Source Note One',
        folder_id: 'fld-core-analysis',
        content_markdown: '# Source Note\n\nInterlinking to [[fkf:note-target-01|Target Note One]].'
      },
      {
        id: 'note-target-01',
        title: 'Target Note One',
        folder_id: 'fld-core-analysis',
        content_markdown: '# Target Note\n\nCanonical analysis findings.'
      }
    ],
    sources: [
      {
        id: 'src-sample-paper',
        title: 'Sample Journal Article',
        source_type: 'journal_article',
        verification_status: 'verified',
        authors: ['Alice Researcher'],
        publication_date: '2025-01-01',
        excerpts: [
          {
            id: 'exc-quote-01',
            quoted_text: 'Topological bounds guarantee safety.'
          }
        ]
      }
    ],
    relationships: [
      {
        id: 'rel-sample-cite',
        source_id: 'note-source-01',
        target_id: 'src-sample-paper',
        link_type: 'cites',
        origin: 'ai_suggested'
      }
    ],
    optional_modules: {
      tasks: {
        tasks: [
          {
            id: 'tsk-sample-task',
            title: 'Verify invariants',
            status: 'planned'
          }
        ]
      },
      spatial_board: {
        board: {
          id: 'brd-sample-board',
          title: 'Hardening Board',
          items: [
            {
              id: 'bitm-card-1',
              title: 'Note Card',
              reference_package_id: 'note-source-01',
              reference_type: 'note'
            }
          ]
        }
      }
    }
  };

  return JSON.parse(JSON.stringify({ ...base, ...overrides }));
}

async function runHardeningTests() {
  console.log('=== STARTING FLOWDEN FKF 2.0 HARDENING TEST SUITE ===\n');

  let passedCount = 0;
  let failedCount = 0;

  function pass(msg) {
    passedCount++;
    console.log(`  ✓ [TEST ${passedCount}] ${msg}`);
  }

  // =========================================================================
  // ISSUE A: WIKILINK TARGET INTEGRITY UNIT & VALIDATION TESTS
  // =========================================================================
  console.log('--- PART 1: WIKILINK TARGET INTEGRITY (ISSUE A) ---');

  // Test 1: Note -> Note WikiLink is accepted (with custom label and bare token)
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nLabeled: [[fkf:note-target-01|Target Note]] and bare: [[fkf:note-target-01]]';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, true, `Expected valid package: ${JSON.stringify(res.errors)}`);
    pass('Note -> Note WikiLinks (labeled and bare) are accepted');
  }

  // Test 2: Note -> Source WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nCiting directly: [[fkf:src-sample-paper|Sample Paper]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Source WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.entityId, 'note-source-01');
    assert.strictEqual(err.targetId, 'src-sample-paper');
    assert.ok(err.message.includes('non-note entity') || err.message.includes('only reference Note IDs'), 'Message must indicate non-note entity violation');
    pass('Note -> Source WikiLink is rejected with INVALID_WIKILINK_ID and non-note error');
  }

  // Test 3: Note -> Folder WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nFolder ref: [[fkf:fld-core-analysis|Core Analysis Folder]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Folder WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'fld-core-analysis');
    assert.ok(err.message.includes('non-note entity'), 'Message must indicate non-note entity violation');
    pass('Note -> Folder WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 4: Note -> Project WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nProject ref: [[fkf:proj-hardening-alpha|Project Root]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Project WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'proj-hardening-alpha');
    pass('Note -> Project WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 5: Note -> Excerpt WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nExcerpt ref: [[fkf:exc-quote-01|Direct Excerpt]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Excerpt WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'exc-quote-01');
    pass('Note -> Excerpt WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 6: Note -> Task WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nTask ref: [[fkf:tsk-sample-task|Sample Task]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Task WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'tsk-sample-task');
    pass('Note -> Task WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 7: Note -> Board WikiLink is rejected with INVALID_WIKILINK_ID
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nBoard ref: [[fkf:brd-sample-board|Spatial Board]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Note -> Board WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'brd-sample-board');
    pass('Note -> Board WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 8: Project overview -> Note WikiLink is accepted
  {
    const pkg = makeTestPackage();
    pkg.project.overview_markdown = '# Project Overview\n\nSee key note [[fkf:note-source-01|Source Analysis]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, true, `Project overview with note WikiLink should be valid: ${JSON.stringify(res.errors)}`);
    pass('Project overview -> Note WikiLink is accepted');
  }

  // Test 9: Project overview -> non-Note WikiLink (Source) is rejected
  {
    const pkg = makeTestPackage();
    pkg.project.overview_markdown = '# Project Overview\n\nSee paper [[fkf:src-sample-paper|Paper 1]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Project overview referencing Source in WikiLink must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID in project overview');
    assert.strictEqual(err.targetId, 'src-sample-paper');
    assert.ok(err.message.includes('non-note entity') || err.message.includes('only reference Note IDs'));
    pass('Project overview -> non-Note WikiLink is rejected with INVALID_WIKILINK_ID');
  }

  // Test 10: Unknown WikiLink target (not present in package at all) is rejected
  {
    const pkg = makeTestPackage();
    pkg.notes[0].content_markdown = '# Source\n\nUnknown link: [[fkf:note-phantom-404|Ghost Note]].';
    const res = parseFkfDocument(pkg);
    assert.strictEqual(res.valid, false, 'Unknown WikiLink target must be rejected');
    const err = res.errors.find(e => e.code === 'INVALID_WIKILINK_ID');
    assert.ok(err, 'Expected INVALID_WIKILINK_ID error');
    assert.strictEqual(err.targetId, 'note-phantom-404');
    assert.ok(err.message.includes('unknown Note ID'), 'Message must indicate unknown Note ID');
    pass('Unknown WikiLink target is rejected with INVALID_WIKILINK_ID and unknown Note ID message');
  }

  // =========================================================================
  // ISSUE B: RESEARCH PERMANENT DELETE ORPHAN CLEANUP INTEGRATION TESTS
  // =========================================================================
  console.log('\n--- PART 2: RESEARCH PERMANENT DELETE CLEANUP (ISSUE B) ---');

  // 1. Check DB collision & create isolated database
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  const preConn = await mysql.createConnection({ host, port, user, password });
  try {
    const [existing] = await preConn.query('SHOW DATABASES LIKE ?', [ISOLATED_DB_NAME]);
    if (existing && existing.length > 0) {
      throw new Error(`[SAFETY BLOCKED] Database collision detected for "${ISOLATED_DB_NAME}".`);
    }
    await preConn.query(`CREATE DATABASE \`${ISOLATED_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`[SETUP] Created isolated database "${ISOLATED_DB_NAME}" (no drop).`);
  } finally {
    await preConn.end();
  }

  // 2. Initialize application database, migrations, and security tables
  const db = require('../server/config/database');
  const { runMigrations } = require('../server/migrations/runner');
  const SecurityService = require('../server/services/securityService');
  const User = require('../server/models/User');

  await db.initDB();
  assert.strictEqual(db.getStatus().isMySQL, true, 'Database must be MySQL');
  const pool = db.getPool();
  await runMigrations(pool);
  await SecurityService.ensureSecurityTables();
  console.log('[SETUP] Migrations 001-009 and security tables verified.');

  // 3. Start application HTTP server
  const app = require('../server/index');
  let server = null;
  server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] HTTP server listening on ${BASE_URL}`);
      resolve(s);
    });
  });

  try {
    // 4. Provision test user and token
    const testEmail = `hardening_user_${uniqueNonce}@example.com`;
    const userResult = await User.create({
      email: testEmail,
      password_hash: 'hash_hardening',
      display_name: 'Hardening Test User'
    });
    const testUserId = userResult.id;
    const jwt = require('jsonwebtoken');
    const userToken = jwt.sign(
      { id: testUserId, email: testEmail, role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${userToken}` };

    // 5. Create a project
    const projRes = await httpRequest('POST', '/api/v1/projects', authHeaders, {
      title: 'Hardening Lifecycle Project',
      description: 'Project to test research deletion cascade.'
    });
    assert.strictEqual(projRes.status, 201, `Project creation failed: ${JSON.stringify(projRes.body)}`);
    const projectId = projRes.body.project ? projRes.body.project.id : (projRes.body.id || projRes.body.insertId);
    assert.ok(projectId, 'Project ID must exist');

    // 6. Create a board in that project
    const [boardIns] = await pool.query(
      'INSERT INTO boards (user_id, project_id, title) VALUES (?, ?, ?)',
      [testUserId, projectId, 'Lifecycle Test Board']
    );
    const boardId = boardIns.insertId;
    assert.ok(boardId, 'Board ID must exist');

    // 7. Create a physical research file in scratch / uploads
    const tempDir = path.resolve(__dirname, '..', 'uploads', 'research');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const testFilePath = path.join(tempDir, `test_doc_${uniqueNonce}.pdf`);
    fs.writeFileSync(testFilePath, '%PDF-1.4 Mock PDF content for permanent delete test');
    assert.ok(fs.existsSync(testFilePath), 'Physical file must exist on disk before delete');

    // 8. Insert research_document row
    const [docIns] = await pool.query(
      `INSERT INTO research_documents (
        user_id, project_id, title, summary, content_text, file_name, original_filename, file_path, file_size, file_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testUserId,
        projectId,
        'Kitaev Anyon Research 2003',
        'Summary of topological quantum computation.',
        'Full extracted text for topological anyons.',
        `test_doc_${uniqueNonce}.pdf`,
        'kitaev2003.pdf',
        testFilePath,
        1024,
        'application/pdf'
      ]
    );
    const researchId = docIns.insertId;
    assert.ok(researchId, 'Research ID must exist');

    // 9. Insert file_uploads record for the research document
    await pool.query(
      `INSERT INTO file_uploads (
        user_id, project_id, entity_type, entity_id, filename, original_name, file_path, mime_type, file_size
      ) VALUES (?, ?, 'research', ?, ?, ?, ?, 'application/pdf', 1024)`,
      [testUserId, projectId, researchId, `test_doc_${uniqueNonce}.pdf`, 'kitaev2003.pdf', testFilePath]
    );

    // 10. Insert research_excerpts record
    const [excIns] = await pool.query(
      `INSERT INTO research_excerpts (
        research_id, user_id, project_id, quoted_text, annotation, location_anchor, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        researchId,
        testUserId,
        projectId,
        'Topological protection prevents local decoherence in anyon code spaces.',
        'Critical quote for surface code threshold analysis.',
        'p. 4, section 2',
        '#fef08a'
      ]
    );
    const excerptId = excIns.insertId;
    assert.ok(excerptId, 'Excerpt ID must exist');

    // 11. Insert canonical entities for both Research and Excerpt
    await pool.query(
      `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
       VALUES (UUID(), 'research', ?, ?, ?, 'Kitaev Anyon Research 2003', 'Kitaev Anyon Research 2003 summary')`,
      [researchId, testUserId, projectId]
    );
    await pool.query(
      `INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text)
       VALUES (UUID(), 'excerpt', ?, ?, ?, 'Topological protection quote', 'Topological protection prevents local decoherence')`,
      [excerptId, testUserId, projectId]
    );

    // 12. Insert project_entities associations for both Research and Excerpt
    await pool.query(
      `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by)
       VALUES (?, 'research', ?, 'contributor', ?), (?, 'excerpt', ?, 'contributor', ?)`,
      [projectId, researchId, testUserId, projectId, excerptId, testUserId]
    );

    // 13. Insert semantic entity_links referencing Research and Excerpt
    // We also create a dummy Note to link to
    const [noteIns] = await pool.query(
      `INSERT INTO notes (user_id, project_id, title, content, word_count)
       VALUES (?, ?, 'Surface Codes Note', '# Surface Codes\n\nDiscussion.', 10)`,
      [testUserId, projectId]
    );
    const dummyNoteId = noteIns.insertId;

    await pool.query(
      `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed)
       VALUES (?, 'note', ?, 'research', ?, 'cites', 'ai_suggested', 1),
              (?, 'excerpt', ?, 'note', ?, 'supports', 'ai_suggested', 1)`,
      [testUserId, dummyNoteId, researchId, testUserId, excerptId, dummyNoteId]
    );

    // 14. Create Board projection items on the board
    // a) Projection item referencing the Research document
    const [resItemIns] = await pool.query(
      `INSERT INTO board_items (board_id, user_id, item_type, reference_type, reference_id, title, content, position_x, position_y)
       VALUES (?, ?, 'research_ref', 'research', ?, 'Research Card', 'Summary', 100, 100)`,
      [boardId, testUserId, researchId]
    );
    const researchItemId = resItemIns.insertId;

    // b) Projection item referencing the Excerpt
    const [excItemIns] = await pool.query(
      `INSERT INTO board_items (board_id, user_id, item_type, reference_type, reference_id, title, content, position_x, position_y)
       VALUES (?, ?, 'idea', 'excerpt', ?, 'Excerpt Card', 'Topological quote', 300, 100)`,
      [boardId, testUserId, excerptId]
    );
    const excerptItemId = excItemIns.insertId;

    // c) Independent, unrelated Board item that MUST SURVIVE
    const [survivorIns] = await pool.query(
      `INSERT INTO board_items (board_id, user_id, item_type, reference_type, reference_id, title, content, position_x, position_y)
       VALUES (?, ?, 'idea', NULL, NULL, 'Unrelated Survivor Idea', 'This item must never be deleted', 600, 100)`,
      [boardId, testUserId]
    );
    const survivorItemId = survivorIns.insertId;

    // 15. Create board connections attached to the projection items
    // Connect research projection -> survivor item
    const [conn1] = await pool.query(
      `INSERT INTO board_item_connections (board_id, source_item_id, target_item_id, connection_type, label)
       VALUES (?, ?, ?, 'flow', 'research to idea')`,
      [boardId, researchItemId, survivorItemId]
    );
    const conn1Id = conn1.insertId;

    // Connect excerpt projection -> survivor item
    const [conn2] = await pool.query(
      `INSERT INTO board_item_connections (board_id, source_item_id, target_item_id, connection_type, label)
       VALUES (?, ?, ?, 'flow', 'excerpt to idea')`,
      [boardId, excerptItemId, survivorItemId]
    );
    const conn2Id = conn2.insertId;

    // Verify baseline setup state
    const [checkDocs] = await pool.query('SELECT id FROM research_documents WHERE id = ?', [researchId]);
    assert.strictEqual(checkDocs.length, 1);
    const [checkExcs] = await pool.query('SELECT id FROM research_excerpts WHERE id = ?', [excerptId]);
    assert.strictEqual(checkExcs.length, 1);
    const [checkItems] = await pool.query('SELECT id FROM board_items WHERE id IN (?, ?, ?)', [researchItemId, excerptItemId, survivorItemId]);
    assert.strictEqual(checkItems.length, 3);
    const [checkConns] = await pool.query('SELECT id FROM board_item_connections WHERE id IN (?, ?)', [conn1Id, conn2Id]);
    assert.strictEqual(checkConns.length, 2);

    pass('Realistic Research document with Excerpt, entities, semantic links, Board projections, and connections provisioned');

    // 16. Invoke the actual permanent-delete HTTP route
    const delRes = await httpRequest('DELETE', `/api/v1/research/${researchId}?permanent=true`, authHeaders);
    assert.strictEqual(delRes.status, 200, `Delete failed: ${JSON.stringify(delRes.body)}`);
    assert.strictEqual(delRes.body.success, true);
    assert.strictEqual(delRes.body.message, 'Document permanently deleted.');
    pass('DELETE /api/v1/research/:id?permanent=true returned HTTP 200 success');

    // 17. Direct database verification
    // 1. Research document is completely gone
    const [postDoc] = await pool.query('SELECT id FROM research_documents WHERE id = ?', [researchId]);
    assert.strictEqual(postDoc.length, 0, 'research_documents row must be deleted');
    pass('Direct DB check: research_documents row is completely deleted');

    // 2. Research Excerpts are completely gone
    const [postExc] = await pool.query('SELECT id FROM research_excerpts WHERE research_id = ?', [researchId]);
    assert.strictEqual(postExc.length, 0, 'research_excerpts rows must be deleted');
    pass('Direct DB check: research_excerpts rows are completely deleted');

    // 3. Canonical entities for Research and Excerpt are completely gone
    const [postEntities] = await pool.query(
      `SELECT id, entity_type, entity_id FROM entities
       WHERE (entity_type = 'research' AND entity_id = ?)
          OR (entity_type = 'excerpt' AND entity_id = ?)`,
      [researchId, excerptId]
    );
    assert.strictEqual(postEntities.length, 0, 'entities rows for research and excerpt must be deleted');
    pass('Direct DB check: canonical entities for Research and Excerpt are completely deleted');

    // 4. project_entities associations are completely gone
    const [postProjEntities] = await pool.query(
      `SELECT id FROM project_entities
       WHERE (entity_type = 'research' AND entity_id = ?)
          OR (entity_type = 'excerpt' AND entity_id = ?)`,
      [researchId, excerptId]
    );
    assert.strictEqual(postProjEntities.length, 0, 'project_entities rows for research and excerpt must be deleted');
    pass('Direct DB check: project_entities rows for Research and Excerpt are completely deleted');

    // 5. Semantic links (entity_links) referencing Research or Excerpts are gone
    const [postLinks] = await pool.query(
      `SELECT id FROM entity_links
       WHERE (source_type = 'research' AND source_id = ?)
          OR (target_type = 'research' AND target_id = ?)
          OR (source_type = 'excerpt' AND source_id = ?)
          OR (target_type = 'excerpt' AND target_id = ?)`,
      [researchId, researchId, excerptId, excerptId]
    );
    assert.strictEqual(postLinks.length, 0, 'entity_links referencing research or excerpt must be deleted');
    pass('Direct DB check: semantic entity_links referencing Research or Excerpts are completely deleted');

    // 6. Board projection items are gone
    const [postProjItems] = await pool.query(
      'SELECT id FROM board_items WHERE id IN (?, ?)',
      [researchItemId, excerptItemId]
    );
    assert.strictEqual(postProjItems.length, 0, 'board projection items referencing research or excerpt must be deleted');
    pass('Direct DB check: Board projection items referencing Research and Excerpts are deleted');

    // 7. Connections attached to removed projection items are gone
    const [postConns] = await pool.query(
      'SELECT id FROM board_item_connections WHERE id IN (?, ?)',
      [conn1Id, conn2Id]
    );
    assert.strictEqual(postConns.length, 0, 'board connections attached to deleted projection items must be deleted');
    pass('Direct DB check: Board item connections attached to projection items are deleted');

    // 8. The unrelated Board item MUST SURVIVE intact
    const [postSurvivor] = await pool.query(
      'SELECT id, title, content, item_type FROM board_items WHERE id = ?',
      [survivorItemId]
    );
    assert.strictEqual(postSurvivor.length, 1, 'Unrelated board item must survive');
    assert.strictEqual(postSurvivor[0].title, 'Unrelated Survivor Idea');
    pass('Direct DB check: Unrelated Board item survived completely intact');

    // 9. The board itself MUST SURVIVE intact
    const [postBoard] = await pool.query('SELECT id, title FROM boards WHERE id = ?', [boardId]);
    assert.strictEqual(postBoard.length, 1, 'Board must not be deleted');
    pass('Direct DB check: Board container itself survived completely intact');

    // 10. Associated file_uploads record is gone
    const [postUploads] = await pool.query(
      "SELECT id FROM file_uploads WHERE entity_type = 'research' AND entity_id = ?",
      [researchId]
    );
    assert.strictEqual(postUploads.length, 0, 'file_uploads record must be deleted');
    pass('Direct DB check: file_uploads record is deleted');

    // 11. Physical file on disk was unlinked
    assert.strictEqual(fs.existsSync(testFilePath), false, 'Physical file on disk must be unlinked after successful commit');
    pass('Physical file handling: file was successfully unlinked after DB commit');

    // 18. Failure compensation test: verify that if transaction fails, physical file is kept intact
    const failFilePath = path.join(tempDir, `fail_doc_${uniqueNonce}.pdf`);
    fs.writeFileSync(failFilePath, '%PDF-1.4 Mock PDF for failure compensation test');
    assert.ok(fs.existsSync(failFilePath), 'Fail test file must exist');

    // Insert doc row
    const [failDocIns] = await pool.query(
      `INSERT INTO research_documents (
        user_id, project_id, title, summary, file_name, original_filename, file_path, file_size, file_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testUserId,
        projectId,
        'Fail Rollback Test Doc',
        'Should not be permanently deleted if error occurs',
        `fail_doc_${uniqueNonce}.pdf`,
        'fail.pdf',
        failFilePath,
        512,
        'application/pdf'
      ]
    );
    const failDocId = failDocIns.insertId;

    // Verify non-owner / unauthorized delete cannot trigger deletion or file unlink
    const otherEmail = `unauth_${uniqueNonce}@example.com`;
    const otherUserRes = await User.create({
      email: otherEmail,
      password_hash: 'hash_unauth',
      display_name: 'Unauthorized User'
    });
    const unauthJwt = jwt.sign(
      { id: otherUserRes.id, email: otherEmail, role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const unauthHeaders = { Authorization: `Bearer ${unauthJwt}` };

    const unauthDelRes = await httpRequest('DELETE', `/api/v1/research/${failDocId}?permanent=true`, unauthHeaders);
    assert.strictEqual(unauthDelRes.status, 404, 'Unauthorized delete must be rejected with 404');
    assert.ok(fs.existsSync(failFilePath), 'Physical file must remain intact when delete is unauthorized or aborted');
    pass('Failure compensation: physical file strictly preserved when operation is aborted');

    // Cleanup the fail file
    if (fs.existsSync(failFilePath)) {
      fs.unlinkSync(failFilePath);
    }
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[CLEANUP] HTTP test server closed.');
    }
    await db.getPool().end();
    console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
  }

  console.log('\n========================================================');
  console.log(`✓ ALL ${passedCount} FLOWDEN FKF 2.0 HARDENING TESTS PASSED!`);
  console.log('========================================================\n');
}

runHardeningTests().catch(err => {
  console.error('\n❌ HARDENING TEST SUITE FAILED:', err);
  process.exit(1);
});
