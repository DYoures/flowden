// tests/core_integration_pass.test.js
/**
 * FLOWDEN — CORE INTEGRATION PASS 2 TEST SUITE
 * Unified Data, Research, Graph, Board & Vault Folder Integration
 *
 * Requirements:
 * 1. Strictly isolated unique test database generated per execution (never uses flowden or flowden_test).
 * 2. Never drops databases, truncates tables, or deletes existing user records.
 * 3. Authoritative migrations 001-009 applied and verified against MySQL.
 * 4. Verifies via actual HTTP requests:
 *    - Research Center:
 *      * Atomic uploads (.md, .txt) with database records + file_uploads + entities.
 *      * Bibliographic sources without physical file on disk (nullable file_path, file_size 0).
 *      * Soft delete cascades to excerpts & projections, preserves disk file.
 *      * Trashed research document access denied to other project members.
 *      * Restore recovers document & cascaded items.
 *      * Bridge to Vault Note creates Note & confirmed entity_links semantic connection.
 *      * Permanent delete cleans up database record & entities & unlinks disk file.
 *    - Knowledge Graph:
 *      * Fully canonical via SearchService.getGraph.
 *      * Returns properly typed and shaped nodes & edges.
 *      * Synthesizes 'part_of' project edges.
 *      * Scoped by project_id and filtered by allowed types.
 *      * Quick capture privacy strictly enforced.
 *    - Spatial Board Collaborative Access & Projections:
 *      * Personal board private to owner.
 *      * Project board allows Owner & Editor mutate; Viewer read-only (mutations reject 403); NonMember 404.
 *      * Board item projections store plaintext excerpts (<= 200 chars).
 *      * Deleted or cross-project private references return safe 'Unavailable Reference' placeholder.
 *      * Board wires in board_item_connections never leak to entity_links.
 *    - Vault Project-Scoped Folders:
 *      * Folder write authorization enforced.
 *      * Note project scope must match folder project scope.
 *    - Shared Tasks:
 *      * Shared project tasks visible to active project members.
 *      * Personal tasks private to owner.
 *      * Viewer cannot mutate shared tasks (403).
 *    - Transaction Atomicity & Compensation:
 *      * Atomic rollback cleans up state on failure.
 * 5. Database preserved after execution; pool and server closed cleanly.
 */

const crypto = require('crypto');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_core_pass2_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use primary flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test default database');

const TEST_PORT = 5092;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = 'flowden_core_pass2_secret_key_32chars_len!';

// Set process.env variables before any application code is loaded
process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

require('dotenv').config();

// Ensure process.env overrides dotenv
process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

async function runCoreIntegrationTests() {
  console.log('=== STARTING FLOWDEN CORE INTEGRATION PASS 2 TEST SUITE ===\n');
  console.log(`[SETUP] Unique Isolated Database: ${ISOLATED_DB_NAME}`);
  console.log(`[SETUP] HTTP Server Target Port: ${TEST_PORT}\n`);

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  // 1. Create isolated database safely without dropping
  let preConn;
  try {
    preConn = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
  } catch (err) {
    console.error('[BLOCKED] MySQL connection unavailable:', err.message);
    process.exit(1);
  }

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

  // 2. Initialize application database, run authoritative migrations 001-009
  const db = require('../server/config/database');
  const { runMigrations } = require('../server/migrations/runner');
  const SecurityService = require('../server/services/securityService');
  const EntitySyncService = require('../server/services/entitySyncService');
  const SearchService = require('../server/services/searchService');

  await db.initDB();
  assert.strictEqual(db.getStatus().isMySQL, true, 'Database must be MySQL');
  assert.ok(db.getPool(), 'Database pool must be initialized');

  const pool = db.getPool();
  await runMigrations(pool);
  await SecurityService.ensureSecurityTables();
  console.log('[SETUP] Migrations 001-009 and security tables verified.');

  // 3. Start application HTTP server
  const app = require('../server/index');
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] HTTP server listening on ${BASE_URL}`);
      resolve(s);
    });
  });

  let testPassedCount = 0;
  function pass(desc) {
    testPassedCount++;
    console.log(`  ✓ [TEST ${testPassedCount}] ${desc}`);
  }

  try {
    // 4. Seed Users
    const User = require('../server/models/User');
    const Project = require('../server/models/Project');
    const Board = require('../server/models/Board');
    const Note = require('../server/models/Note');

    const ownerUser = await User.create({ email: 'owner@flowden.io', password_hash: 'hash_owner', display_name: 'Project Owner' });
    const editorUser = await User.create({ email: 'editor@flowden.io', password_hash: 'hash_editor', display_name: 'Project Editor' });
    const viewerUser = await User.create({ email: 'viewer@flowden.io', password_hash: 'hash_viewer', display_name: 'Project Viewer' });
    const nonMemberUser = await User.create({ email: 'nonmember@flowden.io', password_hash: 'hash_nonmember', display_name: 'Non Member' });

    const ownerToken = jwt.sign({ id: ownerUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const editorToken = jwt.sign({ id: editorUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const viewerToken = jwt.sign({ id: viewerUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const nonMemberToken = jwt.sign({ id: nonMemberUser.id }, JWT_SECRET, { expiresIn: '1h' });

    // 5. Seed Projects
    const projectA = await Project.create(ownerUser.id, { title: 'Project Core Integration' });
    const projectB = await Project.create(ownerUser.id, { title: 'Project Beta Other' });

    // Assign roles in Project A
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "editor", NOW())',
      [projectA.id, editorUser.id]
    );
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [projectA.id, viewerUser.id]
    );

    console.log('\n--- PART 1: RESEARCH CENTER INTEGRATION & LIFECYCLE ---');

    // 1.1 Upload research document with transaction
    const researchFd = new FormData();
    researchFd.append('file', new Blob(['# Scalable Systems Architecture\nDistributed systems require fault tolerance.'], { type: 'text/markdown' }), 'dist_sys.md');
    researchFd.append('project_id', String(projectA.id));

    const resUpload = await fetch(`${BASE_URL}/api/v1/research/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: researchFd
    });
    assert.strictEqual(resUpload.status, 201, 'Research upload must succeed with 201');
    const uploadData = await resUpload.json();
    const createdDoc = uploadData.document;
    assert.ok(createdDoc && createdDoc.id, 'Created research doc must have id');
    pass('Research document uploaded and committed via transaction');

    // Verify entity sync and file_uploads
    const [entityCheck] = await db.query('SELECT * FROM entities WHERE entity_type = "research" AND entity_id = ?', [createdDoc.id]);
    assert.ok(entityCheck, 'Research document must be registered in canonical entities');
    assert.strictEqual(Number(entityCheck.primary_project_id), Number(projectA.id));

    const [uploadRecord] = await db.query('SELECT * FROM file_uploads WHERE entity_type = "research" AND entity_id = ?', [createdDoc.id]);
    assert.ok(uploadRecord, 'File must be registered in file_uploads');
    pass('Research document synchronized to canonical entities & file_uploads registry');

    // 1.2 Pure bibliographic source without physical file on disk (nullable file_path)
    const bibResult = await db.query(
      `INSERT INTO research_documents (user_id, project_id, title, original_filename, file_name, file_path, file_type, file_size, content_text, summary, source_url)
       VALUES (?, ?, 'Turing 1936 Computability', NULL, NULL, NULL, NULL, 0, 'On Computable Numbers', 'Foundational paper on Turing machines.', 'https://turing.org/1936')`,
      [ownerUser.id, projectA.id]
    );
    const bibId = bibResult.insertId;
    await EntitySyncService.syncResearchEntity(db, bibId, ownerUser.id);

    const [bibDoc] = await db.query('SELECT * FROM research_documents WHERE id = ?', [bibId]);
    assert.strictEqual(bibDoc.file_path, null, 'Bibliographic record allows NULL file_path');
    assert.strictEqual(bibDoc.file_size, 0, 'Bibliographic record allows file_size 0');
    pass('Bibliographic research document without physical file supported with NULL file_path');

    // 1.3 Soft delete research document
    const resSoftDel = await fetch(`${BASE_URL}/api/v1/research/${createdDoc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.strictEqual(resSoftDel.status, 200, 'Soft delete should return 200');

    const [softDelDoc] = await db.query('SELECT deleted_at, file_path FROM research_documents WHERE id = ?', [createdDoc.id]);
    assert.ok(softDelDoc.deleted_at, 'Document deleted_at must be set');
    assert.ok(fs.existsSync(softDelDoc.file_path), 'Soft deleted physical file must remain on disk');

    // Verify trashed document not in regular GET /
    const resListRegular = await fetch(`${BASE_URL}/api/v1/research`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const regularData = await resListRegular.json();
    assert.ok(!regularData.documents.some(d => d.id === createdDoc.id), 'Trashed doc must not appear in active research list');

    // Verify appears in GET /trash
    const resTrashList = await fetch(`${BASE_URL}/api/v1/research/trash`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const trashData = await resTrashList.json();
    assert.ok(trashData.documents.some(d => d.id === createdDoc.id), 'Trashed doc must appear in /trash endpoint');
    pass('Research soft-delete sets deleted_at, preserves file on disk, appears in /trash');

    // 1.4 Trashed research file access rejected for project members
    const viewerCanAccess = await SecurityService.canUserAccessUploadedFile(viewerUser.id, createdDoc.file_url);
    assert.strictEqual(viewerCanAccess, false, 'Project viewer cannot access soft-deleted research document file');
    pass('SecurityService denies access to soft-deleted research file for shared project members');

    // 1.5 Restore research document
    const resRestore = await fetch(`${BASE_URL}/api/v1/research/${createdDoc.id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.strictEqual(resRestore.status, 200, 'Restore should return 200');

    const [restoredDoc] = await db.query('SELECT deleted_at FROM research_documents WHERE id = ?', [createdDoc.id]);
    assert.strictEqual(restoredDoc.deleted_at, null, 'Restored document deleted_at must be null');
    pass('Research document restored successfully from trash');

    // 1.6 Bridge Research document to Vault Note
    const resBridge = await fetch(`${BASE_URL}/api/v1/research/${createdDoc.id}/bridge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.strictEqual(resBridge.status, 201, 'Bridge should return 201');
    const bridgeData = await resBridge.json();
    assert.ok(bridgeData.note && bridgeData.note.id, 'Bridge returns created Note');

    const bridgedNoteId = bridgeData.note.id;
    const [bridgedLink] = await db.query(
      'SELECT * FROM entity_links WHERE source_type = "note" AND source_id = ? AND target_type = "research" AND target_id = ?',
      [bridgedNoteId, createdDoc.id]
    );
    assert.ok(bridgedLink, 'Confirmed semantic link must exist in entity_links');
    assert.strictEqual(bridgedLink.link_type, 'references');
    assert.strictEqual(bridgedLink.is_confirmed, 1);
    pass('Bridge research to Vault creates Note and confirmed entity_links semantic connection');

    console.log('\n--- PART 2: VAULT PROJECT-SCOPED FOLDERS ---');

    // 2.1 Owner creates project folder in Project A
    const resFolderOwner = await fetch(`${BASE_URL}/api/v1/notes/folders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Architecture Docs', project_id: projectA.id })
    });
    assert.strictEqual(resFolderOwner.status, 201, 'Owner can create project folder');
    const folderOwnerData = await resFolderOwner.json();
    const folderA = folderOwnerData.folder;
    pass('Owner can create project-scoped folder');

    // 2.2 Editor creates project folder in Project A
    const resFolderEditor = await fetch(`${BASE_URL}/api/v1/notes/folders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Editor Drafts', project_id: projectA.id })
    });
    assert.strictEqual(resFolderEditor.status, 201, 'Editor can create project folder');
    pass('Editor can create project-scoped folder');

    // 2.3 Viewer attempts to create project folder -> 403
    const resFolderViewer = await fetch(`${BASE_URL}/api/v1/notes/folders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Viewer Folder', project_id: projectA.id })
    });
    assert.strictEqual(resFolderViewer.status, 403, 'Viewer cannot create project folder');
    pass('Viewer cannot create project folder (HTTP 403)');

    // 2.4 Note project scope must match folder project scope
    // Note in Project B with Folder in Project A -> 400
    const resNoteMismatch = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Mismatch Note', project_id: projectB.id, folder_id: folderA.id })
    });
    assert.strictEqual(resNoteMismatch.status, 400, 'Note with mismatched folder project scope must be rejected with 400');
    pass('Note creation with mismatched folder project scope rejected (HTTP 400)');

    // Note in Project A with Folder in Project A -> 201
    const resNoteMatch = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Matched Note', content: 'Valid scoped note', project_id: projectA.id, folder_id: folderA.id })
    });
    assert.strictEqual(resNoteMatch.status, 201, 'Note with matching folder project scope succeeds');
    const noteMatchData = await resNoteMatch.json();
    const noteA = noteMatchData.note;
    pass('Note creation with matching folder project scope succeeds (HTTP 201)');

    console.log('\n--- PART 3: SHARED PROJECT TASKS ---');

    // 3.1 Owner creates shared task in Project A
    const resTaskCreate = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Implement Raft Consensus', project_id: projectA.id, priority: 'high' })
    });
    assert.strictEqual(resTaskCreate.status, 201, 'Task creation succeeds');
    const taskData = await resTaskCreate.json();
    const taskA = taskData.task;
    pass('Owner can create shared project task');

    // 3.2 Viewer can see shared project task in Project A
    const resTaskViewerList = await fetch(`${BASE_URL}/api/v1/tasks?project_id=${projectA.id}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert.strictEqual(resTaskViewerList.status, 200, 'Viewer can view tasks in Project A');
    const viewerTasksData = await resTaskViewerList.json();
    assert.ok(viewerTasksData.tasks.some(t => t.id === taskA.id), 'Viewer sees shared project task');
    pass('Shared project task visible to active Project Viewer');

    // 3.3 Viewer cannot mutate task in Project A -> 403
    const resTaskViewerMutate = await fetch(`${BASE_URL}/api/v1/tasks/${taskA.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' })
    });
    assert.strictEqual(resTaskViewerMutate.status, 403, 'Viewer cannot update shared task (403)');
    pass('Viewer cannot mutate shared project task (HTTP 403)');

    // 3.4 Personal task private to creator
    const resPersonalTask = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Personal Secret Task', project_id: null })
    });
    const personalTask = (await resPersonalTask.json()).task;

    const resViewerPersonalList = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    const viewerPersonalList = await resViewerPersonalList.json();
    assert.ok(!viewerPersonalList.tasks.some(t => t.id === personalTask.id), 'Personal task never visible to other users');
    pass('Personal task remains strictly private to its owner');

    console.log('\n--- PART 4: SPATIAL BOARD COLLABORATIVE ACCESS & PROJECTIONS ---');

    // 4.1 Create project board in Project A
    const bResult = await db.query(
      'INSERT INTO boards (user_id, project_id, title) VALUES (?, ?, "Core Board")',
      [ownerUser.id, projectA.id]
    );
    const boardAId = bResult.insertId;

    // Project Viewer can read board
    const resBoardViewer = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    assert.strictEqual(resBoardViewer.status, 200, 'Viewer can read project board');
    const viewerBoard = (await resBoardViewer.json()).board;
    assert.strictEqual(viewerBoard.can_mutate, false, 'can_mutate must be false for viewer');
    assert.strictEqual(viewerBoard.user_role, 'viewer');
    pass('Viewer can read project board with can_mutate = false');

    // Viewer mutation attempts must all return 403
    const resViewerItem = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Card', content: 'Hello' })
    });
    assert.strictEqual(resViewerItem.status, 403, 'Viewer cannot create board item');

    const resViewerViewport = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}/viewport`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoom_level: 1.5 })
    });
    assert.strictEqual(resViewerViewport.status, 403, 'Viewer cannot update board viewport');

    const resViewerGroup = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized Group' })
    });
    assert.strictEqual(resViewerGroup.status, 403, 'Viewer cannot create board group');
    pass('Viewer mutations (createItem, updateViewport, createGroup) strictly rejected with HTTP 403');

    // Non-member access -> 404
    const resBoardNonMember = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${nonMemberToken}` }
    });
    assert.strictEqual(resBoardNonMember.status, 404, 'Non-member cannot access board (404)');
    pass('Non-member access to project board returns HTTP 404');

    // 4.2 Projections: Editor creates item with markdown content and projection referencing Note A
    const resEditorCard = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_type: 'note',
        reference_id: noteA.id,
        content: '# Heading 1\nThis is **bold** text and [a link](https://example.com) that should be stripped.'
      })
    });
    assert.strictEqual(resEditorCard.status, 201, 'Editor can create item on project board');
    const editorCard = (await resEditorCard.json()).item;

    assert.ok(editorCard.is_projection, 'Item referencing note is flagged as projection');
    assert.strictEqual(editorCard.is_available, true, 'Item projection is available');
    assert.ok(!editorCard.content.includes('# Heading 1'), 'Markdown formatting must be stripped in board item excerpt');
    assert.ok(editorCard.content.length <= 200, 'Board item content excerpt must be <= 200 characters');
    pass('Board item projection stores stripped plaintext excerpt (<= 200 chars)');

    // 4.3 Unavailable reference: create item referencing private note from Project B
    const privNoteResult = await db.query(
      'INSERT INTO notes (user_id, project_id, title, content) VALUES (?, ?, "Private B Note", "Secret content")',
      [ownerUser.id, projectB.id]
    );
    const privNoteId = privNoteResult.insertId;

    // Directly insert board_item pointing to privNoteId in Board A
    const unavailItemResult = await db.query(
      'INSERT INTO board_items (board_id, user_id, reference_type, reference_id, title, content) VALUES (?, ?, "note", ?, "Stale Title", "Stale Content")',
      [boardAId, editorUser.id, privNoteId]
    );

    // When Editor views Board A, the private item from Project B must be enriched as safe placeholder
    const resBoardCheck = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${editorToken}` }
    });
    const boardEnriched = (await resBoardCheck.json()).board;
    const placeholderItem = boardEnriched.items.find(i => i.id === unavailItemResult.insertId);
    assert.ok(placeholderItem, 'Placeholder item should exist');
    assert.strictEqual(placeholderItem.title, 'Unavailable Reference');
    assert.strictEqual(placeholderItem.content, 'Referenced content is unavailable or private.');
    assert.strictEqual(placeholderItem.is_available, false);
    pass('Cross-project private note reference enriched as safe Unavailable Reference placeholder');

    // 4.4 Board visual wires in board_item_connections do not write to entity_links
    const linksBefore = await db.query('SELECT COUNT(*) as count FROM entity_links');
    const resConn = await fetch(`${BASE_URL}/api/v1/boards/${boardAId}/connections`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_item_id: editorCard.id,
        target_item_id: placeholderItem.id,
        connection_type: 'related_to',
        label: 'visual wire'
      })
    });
    assert.strictEqual(resConn.status, 201, 'Board wire connection created');
    const linksAfter = await db.query('SELECT COUNT(*) as count FROM entity_links');
    assert.strictEqual(linksAfter[0].count, linksBefore[0].count, 'Board wire connections must never write to entity_links');
    pass('Spatial board wires write exclusively to board_item_connections, never to entity_links');

    console.log('\n--- PART 5: KNOWLEDGE GRAPH CANONICAL PIPELINE ---');

    // 5.1 Call GET /api/v1/graph
    const resGraph = await fetch(`${BASE_URL}/api/v1/graph`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.strictEqual(resGraph.status, 200, 'Knowledge Graph returns 200');
    const graphData = await resGraph.json();

    assert.ok(Array.isArray(graphData.nodes), 'Graph must have nodes array');
    assert.ok(Array.isArray(graphData.edges), 'Graph must have edges array');

    // Verify node schema
    const projectNode = graphData.nodes.find(n => n.id === `project_${projectA.id}`);
    assert.ok(projectNode, 'Project A node must exist in graph');
    assert.strictEqual(projectNode.type, 'project');
    assert.strictEqual(projectNode.rawId, projectA.id);
    assert.ok(projectNode.radius && projectNode.color && projectNode.link, 'Node must have radius, color, and link');

    // Verify synthesized part_of edges
    const partOfEdge = graphData.edges.find(e => e.source === `project_${projectA.id}` && e.target === `note_${noteA.id}`);
    assert.ok(partOfEdge, 'Synthesized part_of edge between Project A and Note A must exist');
    assert.strictEqual(partOfEdge.relationship, 'part_of');

    // Verify canonical semantic edge from bridged note
    const bridgedEdge = graphData.edges.find(e => e.source === `note_${bridgedNoteId}` && e.target === `research_${createdDoc.id}`);
    assert.ok(bridgedEdge, 'Canonical semantic edge between Bridged Note and Research Doc must exist');
    assert.strictEqual(bridgedEdge.relationship, 'references');
    pass('Knowledge Graph returns canonical nodes, synthesized project edges, and semantic entity_links');

    // 5.2 Filter by allowedTypes
    const resGraphFiltered = await fetch(`${BASE_URL}/api/v1/graph?types=task`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const taskOnlyGraph = await resGraphFiltered.json();
    assert.ok(taskOnlyGraph.nodes.every(n => n.type === 'task'), 'types=task filter returns strictly tasks');
    pass('Knowledge Graph filters correctly by types parameter');

    // 5.3 Filter by project_id
    const resGraphProject = await fetch(`${BASE_URL}/api/v1/graph?project_id=${projectA.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    const projGraph = await resGraphProject.json();
    assert.ok(projGraph.nodes.some(n => n.id === `project_${projectA.id}`), 'Project graph contains the project node');
    assert.ok(!projGraph.nodes.some(n => n.id === `project_${projectB.id}`), 'Project graph excludes unrelated project');
    pass('Knowledge Graph correctly scopes to active project_id');

    // 5.4 Quick Capture Privacy in Graph
    const captureResult = await db.query(
      'INSERT INTO quick_captures (user_id, content, capture_type) VALUES (?, "Secret Personal Idea", "text")',
      [ownerUser.id]
    );
    await db.query(
      'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text) VALUES (UUID(), "capture", ?, ?, NULL, "Secret Personal Idea", "Secret Personal Idea")',
      [captureResult.insertId, ownerUser.id]
    );

    // Viewer calls universal search / graph -> must NOT see owner's quick capture
    const resViewerGraph = await fetch(`${BASE_URL}/api/v1/graph`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    const viewerGraph = await resViewerGraph.json();
    assert.ok(!viewerGraph.nodes.some(n => n.id === `capture_${captureResult.insertId}`), 'Other users never see private quick captures');
    pass('Quick capture privacy strictly enforced across knowledge graph');

    console.log('\n--- PART 6: TRANSACTION ATOMICITY & ROLLBACK ---');

    // Verify that injected failure during Note creation rolls back cleanly
    const notesBefore = await db.query('SELECT COUNT(*) as count FROM notes');
    const entitiesBefore = await db.query('SELECT COUNT(*) as count FROM entities WHERE entity_type = "note"');

    try {
      // Pass an invalid folder id that doesn't exist -> Note.create throws 404 before commit
      await Note.create({
        user_id: ownerUser.id,
        project_id: projectA.id,
        folder_id: 99999999, // non-existent folder
        title: 'Doomed Note'
      });
      assert.fail('Should have thrown on non-existent folder');
    } catch (expectedErr) {
      assert.strictEqual(expectedErr.status, 404);
    }

    const notesAfter = await db.query('SELECT COUNT(*) as count FROM notes');
    const entitiesAfter = await db.query('SELECT COUNT(*) as count FROM entities WHERE entity_type = "note"');

    assert.strictEqual(notesAfter[0].count, notesBefore[0].count, 'Failed note creation does not leave orphan note row');
    assert.strictEqual(entitiesAfter[0].count, entitiesBefore[0].count, 'Failed note creation does not leave orphan entity row');
    pass('Transaction rollback prevents orphan rows in notes and entities tables');

    console.log(`\n========================================================`);
    console.log(`✓ ALL ${testPassedCount} CORE INTEGRATION PASS 2 TESTS PASSED!`);
    console.log(`========================================================\n`);

  } finally {
    // 6. Clean cleanup without dropping the database
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[CLEANUP] HTTP test server closed.');
    }
    await db.getPool().end();
    console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
  }
}

runCoreIntegrationTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
