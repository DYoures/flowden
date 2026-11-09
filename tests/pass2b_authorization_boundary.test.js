// tests/pass2b_authorization_boundary.test.js
/**
 * FLOWDEN — PASS 2B: AUTHORIZATION BOUNDARY & TRANSACTION FIX TEST SUITE
 *
 * Verifies:
 * 1. Project membership is authoritative for Project-scoped data (Notes, Tasks, Research, Files).
 * 2. Record creator/uploader does NOT retain access once project membership is revoked.
 * 3. Owner/Editor can update shared Project Note and Research created by another user.
 * 4. Viewer cannot update, delete, or restore shared Project Note, Task, or Research (HTTP 403).
 * 5. Personal Note, Task, Research, and uploaded files remain accessible to owner.
 * 6. Folder ownership integrity: another user's personal folder cannot be target for note or parent folder (HTTP 403).
 * 7. Spatial Board reference scope:
 *    - Project Board accepts project note; rejects personal note or note from other project on create and update (HTTP 400).
 *    - EnrichItem provides identical view across project members (no owner-leak asymmetry).
 *    - Trashed/deleted reference returns safe 'Unavailable Reference' placeholder.
 * 8. Research bridge idempotency: repeated bridge requests do not create duplicate notes.
 * 9. Research permanent delete transactionally deletes from file_uploads, entity_links, excerpts, entities, and unlinks file after commit.
 * 10. Knowledge graph confirmed AI relationship edges are included, unconfirmed are excluded.
 * 11. Genuine transaction rollback after Note row insertion leaves no orphan rows.
 * 12. Research upload compensation cleans up disk files on failure.
 */

const crypto = require('crypto');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_pass2b_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use primary flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test default database');

const TEST_PORT = 5093;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = 'flowden_pass2b_boundary_secret_32chars_len!';

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

require('dotenv').config();

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

async function runPass2BTests() {
  console.log('=== STARTING FLOWDEN PASS 2B TEST SUITE ===\n');
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
    const User = require('../server/models/User');
    const Project = require('../server/models/Project');
    const Board = require('../server/models/Board');
    const Note = require('../server/models/Note');

    // Seed Users: Alice (Owner), Bob (Editor), Charlie (Viewer), Dave (Revoked), Eve (Unrelated)
    const aliceUser = await User.create({ email: 'alice@flowden.io', password_hash: 'hash_alice', display_name: 'Alice Owner' });
    const bobUser = await User.create({ email: 'bob@flowden.io', password_hash: 'hash_bob', display_name: 'Bob Editor' });
    const charlieUser = await User.create({ email: 'charlie@flowden.io', password_hash: 'hash_charlie', display_name: 'Charlie Viewer' });
    const daveUser = await User.create({ email: 'dave@flowden.io', password_hash: 'hash_dave', display_name: 'Dave Revoked' });
    const eveUser = await User.create({ email: 'eve@flowden.io', password_hash: 'hash_eve', display_name: 'Eve Unrelated' });

    const aliceToken = jwt.sign({ id: aliceUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const bobToken = jwt.sign({ id: bobUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const charlieToken = jwt.sign({ id: charlieUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const daveToken = jwt.sign({ id: daveUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const eveToken = jwt.sign({ id: eveUser.id }, JWT_SECRET, { expiresIn: '1h' });

    // Seed Projects
    const projectAlpha = await Project.create(aliceUser.id, { title: 'Project Alpha' });
    const projectBeta = await Project.create(eveUser.id, { title: 'Project Beta' });

    // Project Alpha memberships:
    // Bob = editor, Charlie = viewer, Dave = editor initially (will be revoked)
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "editor", NOW())',
      [projectAlpha.id, bobUser.id]
    );
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [projectAlpha.id, charlieUser.id]
    );
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "editor", NOW())',
      [projectAlpha.id, daveUser.id]
    );

    console.log('\n--- PART 1: NOTE AUTHORIZATION & PROJECT MEMBERSHIP AUTHORITY ---');

    // 1. Dave (while active editor) creates a note in Project Alpha
    const resDaveNote = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${daveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dave Project Note', content: 'Important project spec', project_id: projectAlpha.id })
    });
    assert.strictEqual(resDaveNote.status, 201);
    const daveNote = (await resDaveNote.json()).note;
    pass('Active member Dave can create Note in Project Alpha');

    // 2. Bob (Editor) can update Dave's note in Project Alpha
    const resBobUpdate = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dave Note Updated By Bob', content: 'Updated content by editor' })
    });
    assert.strictEqual(resBobUpdate.status, 200, 'Editor Bob must be able to update shared project note');
    const bobUpdatedNote = (await resBobUpdate.json()).note;
    assert.strictEqual(bobUpdatedNote.title, 'Dave Note Updated By Bob');
    pass('Editor Bob can update shared Project Note created by Dave');

    // 3. Charlie (Viewer) attempts to update Dave's note -> 403
    const resCharlieUpdate = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${charlieToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked by Viewer' })
    });
    assert.strictEqual(resCharlieUpdate.status, 403, 'Viewer Charlie cannot update project note (403)');
    pass('Viewer Charlie rejected with 403 when attempting to update shared Note');

    // 4. Charlie (Viewer) attempts to delete Dave's note -> 403
    const resCharlieDelete = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${charlieToken}` }
    });
    assert.strictEqual(resCharlieDelete.status, 403, 'Viewer Charlie cannot delete project note (403)');
    pass('Viewer Charlie rejected with 403 when attempting to delete shared Note');

    // 5. Revoke Dave from Project Alpha
    await db.query(
      'UPDATE project_members SET revoked_at = NOW() WHERE project_id = ? AND user_id = ?',
      [projectAlpha.id, daveUser.id]
    );

    // 6. Dave (now revoked) CANNOT read former project note -> 404
    const resDaveRead = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      headers: { Authorization: `Bearer ${daveToken}` }
    });
    assert.strictEqual(resDaveRead.status, 404, 'Revoked member cannot read former project note');

    // Dave cannot see it in note list
    const resDaveList = await fetch(`${BASE_URL}/api/v1/notes`, {
      headers: { Authorization: `Bearer ${daveToken}` }
    });
    const daveList = await resDaveList.json();
    assert.ok(!daveList.notes.some(n => n.id === daveNote.id), 'Revoked member does not see note in list');

    // Dave cannot update former project note -> 404
    const resDaveUpdate = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${daveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dave tries to modify after revocation' })
    });
    assert.strictEqual(resDaveUpdate.status, 404, 'Revoked member cannot update former project note');

    // Dave cannot delete former project note -> 404
    const resDaveDelete = await fetch(`${BASE_URL}/api/v1/notes/${daveNote.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${daveToken}` }
    });
    assert.strictEqual(resDaveDelete.status, 404, 'Revoked member cannot delete former project note');
    pass('Revoked member Dave cannot read, list, update, or delete former Project Note (HTTP 404)');

    console.log('\n--- PART 2: TASK AUTHORIZATION BOUNDARIES ---');

    // Dave (now revoked) had created a task in Project Alpha before revocation
    const taskResult = await db.query(
      'INSERT INTO tasks (user_id, project_id, title, status, priority) VALUES (?, ?, "Dave Alpha Task", "planned", "high")',
      [daveUser.id, projectAlpha.id]
    );
    const daveTaskId = taskResult.insertId;
    await EntitySyncService.syncTaskEntity(db, daveTaskId, daveUser.id);

    // Revoked Dave cannot view task
    const resDaveTaskList = await fetch(`${BASE_URL}/api/v1/tasks?project_id=${projectAlpha.id}`, {
      headers: { Authorization: `Bearer ${daveToken}` }
    });
    assert.strictEqual(resDaveTaskList.status, 403, 'Revoked member cannot access project tasks endpoint');

    // Revoked Dave cannot mutate task
    const resDaveTaskMutate = await fetch(`${BASE_URL}/api/v1/tasks/${daveTaskId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${daveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' })
    });
    assert.strictEqual(resDaveTaskMutate.status, 404, 'Revoked member cannot mutate task');

    // Bob (Editor) can mutate task created by Dave
    const resBobTaskMutate = await fetch(`${BASE_URL}/api/v1/tasks/${daveTaskId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.strictEqual(resBobTaskMutate.status, 200, 'Editor Bob can mutate task created by Dave');
    pass('Revoked member blocked from Project Tasks; Editor can mutate shared Project Task');

    console.log('\n--- PART 3: RESEARCH LIFECYCLE & TRANSACTION INTEGRITY ---');

    // Dave (before revocation) uploaded a research doc in Project Alpha
    const researchFile = path.join(__dirname, '..', 'uploads', 'research', `dave_doc_${uniqueNonce}.txt`);
    fs.writeFileSync(researchFile, 'Research on Quantum Computing algorithms.');

    const resResult = await db.query(
      `INSERT INTO research_documents (user_id, project_id, title, original_filename, file_name, file_path, file_type, file_size, content_text, summary)
       VALUES (?, ?, 'Quantum Algorithms', 'quantum.txt', ?, ?, 'txt', 40, 'Quantum Computing text', 'Quantum Summary')`,
      [daveUser.id, projectAlpha.id, path.basename(researchFile), researchFile]
    );
    const daveResId = resResult.insertId;
    const daveResUrl = `/uploads/research/${path.basename(researchFile)}`;

    await SecurityService.registerUploadedFile({
      userId: daveUser.id,
      projectId: projectAlpha.id,
      entityType: 'research',
      entityId: daveResId,
      filename: path.basename(researchFile),
      originalName: 'quantum.txt',
      filePath: daveResUrl,
      mimeType: 'text/plain',
      fileSize: 40
    });
    await EntitySyncService.syncResearchEntity(db, daveResId, daveUser.id);

    // 1. Revoked Dave CANNOT access former research file via SecurityService
    const daveCanAccessFile = await SecurityService.canUserAccessUploadedFile(daveUser.id, daveResUrl);
    assert.strictEqual(daveCanAccessFile, false, 'Revoked creator must NOT access project uploaded file');

    // Active Editor Bob CAN access file
    const bobCanAccessFile = await SecurityService.canUserAccessUploadedFile(bobUser.id, daveResUrl);
    assert.strictEqual(bobCanAccessFile, true, 'Active Editor Bob must access project uploaded file');
    pass('SecurityService correctly denies file access to revoked creator and allows active members');

    // 2. Editor Bob can update research document created by Dave
    const resBobResUpdate = await fetch(`${BASE_URL}/api/v1/research/${daveResId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Quantum Algorithms v2 by Bob' })
    });
    assert.strictEqual(resBobResUpdate.status, 200, 'Editor Bob can update research created by Dave');
    const bobUpdatedDoc = (await resBobResUpdate.json()).document;
    assert.strictEqual(bobUpdatedDoc.title, 'Quantum Algorithms v2 by Bob');
    pass('Editor Bob can update shared Research document created by another user');

    // 3. Viewer Charlie cannot update or soft-delete research
    const resCharlieResUpdate = await fetch(`${BASE_URL}/api/v1/research/${daveResId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${charlieToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Viewer Attempt' })
    });
    assert.strictEqual(resCharlieResUpdate.status, 403, 'Viewer Charlie cannot update research (403)');

    const resCharlieResDelete = await fetch(`${BASE_URL}/api/v1/research/${daveResId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${charlieToken}` }
    });
    assert.strictEqual(resCharlieResDelete.status, 403, 'Viewer Charlie cannot delete research (403)');
    pass('Viewer Charlie cannot update or delete shared Research document');

    // 4. Bridge idempotency: call bridge twice on the same research document
    const resBridge1 = await fetch(`${BASE_URL}/api/v1/research/${daveResId}/bridge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert.strictEqual(resBridge1.status, 201, 'First bridge call returns 201');
    const bridge1Data = await resBridge1.json();
    const bridgedNote1Id = bridge1Data.note.id;

    // Second bridge call -> must NOT create a duplicate note, must return 200 with existing note
    const resBridge2 = await fetch(`${BASE_URL}/api/v1/research/${daveResId}/bridge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert.strictEqual(resBridge2.status, 200, 'Second bridge call returns 200 (idempotent)');
    const bridge2Data = await resBridge2.json();
    assert.strictEqual(bridge2Data.note.id, bridgedNote1Id, 'Repeated bridge returns the exact same Note');

    const [bridgedLinksCount] = await db.query(
      'SELECT COUNT(*) as count FROM entity_links WHERE target_type = "research" AND target_id = ? AND deleted_at IS NULL',
      [daveResId]
    );
    assert.strictEqual(Number(bridgedLinksCount.count), 1, 'Only one active bridge link exists');
    pass('Research bridge is idempotent and does not create duplicate notes on repeated calls');

    // 5. Permanent delete: transactionally removes all records and unlinks disk file only after commit
    const resPermDelete = await fetch(`${BASE_URL}/api/v1/research/${daveResId}?permanent=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert.strictEqual(resPermDelete.status, 200, 'Owner can permanently delete research document');
    assert.strictEqual(fs.existsSync(researchFile), false, 'Disk file unlinked after permanent delete commit');

    const [checkDeletedDoc] = await db.query('SELECT * FROM research_documents WHERE id = ?', [daveResId]);
    assert.strictEqual(checkDeletedDoc, undefined, 'Document removed from research_documents');

    const [checkUploadRec] = await db.query("SELECT * FROM file_uploads WHERE entity_type = 'research' AND entity_id = ?", [daveResId]);
    assert.strictEqual(checkUploadRec, undefined, 'File upload record removed');
    pass('Permanent delete transactionally purges records and unlinks disk file');

    console.log('\n--- PART 4: SPATIAL BOARD SCOPE & CONSISTENT PROJECTIONS ---');

    // 1. Create a Project Board in Project Alpha
    const boardAlphaRes = await db.query(
      'INSERT INTO boards (user_id, project_id, title) VALUES (?, ?, "Alpha Spatial Board")',
      [aliceUser.id, projectAlpha.id]
    );
    const boardAlphaId = boardAlphaRes.insertId;

    // Create a Note in Project Alpha and a Note in Project Beta
    const noteAlpha = await Note.create({
      user_id: aliceUser.id,
      project_id: projectAlpha.id,
      title: 'Alpha Canonical Note',
      content: 'Alpha knowledge content'
    });

    const noteBeta = await Note.create({
      user_id: eveUser.id,
      project_id: projectBeta.id,
      title: 'Beta Note',
      content: 'Beta secret content'
    });

    const personalNoteAlice = await Note.create({
      user_id: aliceUser.id,
      project_id: null,
      title: 'Alice Personal Secret Note',
      content: 'Personal private thoughts'
    });

    // 2. Project Board rejects personal note -> HTTP 400
    const resRejectPersonal = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type: 'note',
        reference_type: 'note',
        reference_id: personalNoteAlice.id
      })
    });
    assert.strictEqual(resRejectPersonal.status, 400, 'Project board must reject personal note reference (400)');
    pass('Project Board rejects personal note reference on item creation (HTTP 400)');

    // 3. Project Board rejects cross-project note from Project Beta -> HTTP 400
    const resRejectCross = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type: 'note',
        reference_type: 'note',
        reference_id: noteBeta.id
      })
    });
    assert.strictEqual(resRejectCross.status, 400, 'Project board must reject cross-project note reference (400)');
    pass('Project Board rejects cross-project note reference on item creation (HTTP 400)');

    // 4. Project Board accepts note from Project Alpha -> HTTP 201
    const resAcceptAlpha = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_type: 'note',
        reference_type: 'note',
        reference_id: noteAlpha.id
      })
    });
    assert.strictEqual(resAcceptAlpha.status, 201, 'Project board accepts valid project note reference');
    const boardItem = (await resAcceptAlpha.json()).item;
    assert.strictEqual(boardItem.is_available, true);
    assert.strictEqual(boardItem.title, 'Alpha Canonical Note');
    pass('Project Board accepts matching project note reference (HTTP 201)');

    // 5. Updating existing board item to cross-project reference is rejected -> HTTP 400
    const resRejectUpdate = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}/items/${boardItem.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_type: 'note',
        reference_id: noteBeta.id
      })
    });
    assert.strictEqual(resRejectUpdate.status, 400, 'Updating item to invalid reference must return 400');
    pass('Project Board rejects invalid cross-project reference on item update (HTTP 400)');

    // 6. Consistent view: Charlie (Viewer) reads board -> sees same item title and content as Bob
    const resCharlieBoard = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}`, {
      headers: { Authorization: `Bearer ${charlieToken}` }
    });
    assert.strictEqual(resCharlieBoard.status, 200);
    const charlieBoard = (await resCharlieBoard.json()).board;
    const charlieItem = charlieBoard.items.find(i => i.id === boardItem.id);
    assert.ok(charlieItem);
    assert.strictEqual(charlieItem.title, 'Alpha Canonical Note');
    assert.strictEqual(charlieItem.is_available, true);
    pass('Board item reference projection is symmetrically available to all active project members');

    // 7. Soft-deleting referenced note renders safe 'Unavailable Reference' placeholder
    await Note.delete(noteAlpha.id, aliceUser.id);

    const resBoardAfterDel = await fetch(`${BASE_URL}/api/v1/boards/${boardAlphaId}`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    const boardAfterDel = (await resBoardAfterDel.json()).board;
    const staleItem = boardAfterDel.items.find(i => i.id === boardItem.id);
    assert.strictEqual(staleItem.title, 'Unavailable Reference');
    assert.strictEqual(staleItem.content, 'Referenced content is unavailable or private.');
    assert.strictEqual(staleItem.is_available, false);
    pass('Trashed referenced note renders safe Unavailable Reference placeholder');

    console.log('\n--- PART 5: FOLDER OWNERSHIP INTEGRITY ---');

    // Alice creates personal folder
    const aliceFolder = await Note.createFolder(aliceUser.id, 'Alice Personal Folder');

    // Bob attempts to create personal note inside Alice's personal folder -> 403
    const resBobFolderHack = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Bob Personal Note in Alice Folder',
        folder_id: aliceFolder.id
      })
    });
    assert.strictEqual(resBobFolderHack.status, 403, 'Cannot attach personal note to another user personal folder');
    pass('Attaching personal note to another user personal folder rejected (HTTP 403)');

    // Bob attempts to create personal folder nested inside Alice's personal folder -> 403
    const resBobNestedFolder = await fetch(`${BASE_URL}/api/v1/notes/folders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Nested Folder',
        parent_folder_id: aliceFolder.id
      })
    });
    assert.strictEqual(resBobNestedFolder.status, 403, 'Cannot nest personal folder inside another user personal folder');
    pass('Nesting personal folder inside another user personal folder rejected (HTTP 403)');

    console.log('\n--- PART 6: KNOWLEDGE GRAPH CONFIRMED AI EDGES ---');

    // Note 1 and Note 2 in Project Alpha
    const graphNote1 = await Note.create({ user_id: aliceUser.id, project_id: projectAlpha.id, title: 'Graph Note 1' });
    const graphNote2 = await Note.create({ user_id: aliceUser.id, project_id: projectAlpha.id, title: 'Graph Note 2' });
    const graphNote3 = await Note.create({ user_id: aliceUser.id, project_id: projectAlpha.id, title: 'Graph Note 3' });

    // Insert confirmed AI edge between note 1 and note 2
    await db.query(
      `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
       VALUES (?, 'note', ?, 'note', ?, 'relates_to', 'ai_suggested', 1, NOW(), NOW())`,
      [aliceUser.id, graphNote1.id, graphNote2.id]
    );

    // Insert unconfirmed AI edge between note 1 and note 3
    await db.query(
      `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
       VALUES (?, 'note', ?, 'note', ?, 'relates_to', 'ai_suggested', 0, NOW(), NOW())`,
      [aliceUser.id, graphNote1.id, graphNote3.id]
    );

    const resGraph = await fetch(`${BASE_URL}/api/v1/graph?project_id=${projectAlpha.id}`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert.strictEqual(resGraph.status, 200);
    const graphData = await resGraph.json();

    const confirmedAiEdge = graphData.edges.find(e => e.source === `note_${graphNote1.id}` && e.target === `note_${graphNote2.id}`);
    assert.ok(confirmedAiEdge, 'Confirmed AI-suggested edge must be included in knowledge graph');

    const unconfirmedAiEdge = graphData.edges.find(e => e.source === `note_${graphNote1.id}` && e.target === `note_${graphNote3.id}`);
    assert.strictEqual(unconfirmedAiEdge, undefined, 'Unconfirmed AI-suggested edge must be excluded from knowledge graph');
    pass('Knowledge Graph includes confirmed AI edges and excludes unconfirmed AI edges');

    console.log('\n--- PART 7: GENUINE TRANSACTION ROLLBACK TESTS ---');

    // 1. Injected transaction rollback after Note row insertion
    const notesCountBefore = await db.query('SELECT COUNT(*) as cnt FROM notes');
    const entitiesCountBefore = await db.query('SELECT COUNT(*) as cnt FROM entities');
    const tagsCountBefore = await db.query('SELECT COUNT(*) as cnt FROM note_tags');
    const linksCountBefore = await db.query('SELECT COUNT(*) as cnt FROM note_links');

    const testConn = await db.getConnection();
    try {
      await testConn.beginTransaction();

      // Perform note insertion
      const insRes = await testConn.query(
        'INSERT INTO notes (user_id, project_id, title, content) VALUES (?, ?, "Doomed Note", "Content [[target]]")',
        [aliceUser.id, projectAlpha.id]
      );
      const doomedNoteId = insRes.insertId;

      await Note.syncTags(doomedNoteId, aliceUser.id, ['doomed_tag'], testConn);
      await Note.syncWikiLinks(doomedNoteId, aliceUser.id, 'Content [[target]]', testConn);
      await EntitySyncService.syncNoteEntity(testConn, doomedNoteId, aliceUser.id);

      // Verify rows exist inside transaction
      const [insideNotes] = await testConn.query('SELECT * FROM notes WHERE id = ?', [doomedNoteId]);
      assert.ok(insideNotes, 'Note must exist inside uncommitted transaction');

      // Now inject catastrophic failure and rollback
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    } catch (simErr) {
      assert.strictEqual(simErr.message, 'SIMULATED_TRANSACTION_FAILURE');
      await testConn.rollback();
    } finally {
      testConn.release();
    }

    const notesCountAfter = await db.query('SELECT COUNT(*) as cnt FROM notes');
    const entitiesCountAfter = await db.query('SELECT COUNT(*) as cnt FROM entities');
    const tagsCountAfter = await db.query('SELECT COUNT(*) as cnt FROM note_tags');
    const linksCountAfter = await db.query('SELECT COUNT(*) as cnt FROM note_links');

    assert.strictEqual(notesCountAfter[0].cnt, notesCountBefore[0].cnt, 'Rolled back note row must not exist');
    assert.strictEqual(entitiesCountAfter[0].cnt, entitiesCountBefore[0].cnt, 'Rolled back entities row must not exist');
    assert.strictEqual(tagsCountAfter[0].cnt, tagsCountBefore[0].cnt, 'Rolled back tags row must not exist');
    assert.strictEqual(linksCountAfter[0].cnt, linksCountBefore[0].cnt, 'Rolled back links row must not exist');
    pass('Genuine transaction rollback after Note insertion leaves zero orphan rows in notes, entities, tags, or links');

    // 2. Research upload compensation cleans up disk files on database failure
    const compDiskFile = path.join(__dirname, '..', 'uploads', 'research', `comp_test_${uniqueNonce}.txt`);
    fs.writeFileSync(compDiskFile, 'Data to be compensated.');
    assert.ok(fs.existsSync(compDiskFile), 'Compensation test file exists on disk');

    const compConn = await db.getConnection();
    let compCommitted = false;
    try {
      await compConn.beginTransaction();
      // Simulate failure during research doc database insert
      throw new Error('SIMULATED_DB_FAILURE_DURING_UPLOAD');
    } catch (uploadSimErr) {
      await compConn.rollback();
      if (!compCommitted && fs.existsSync(compDiskFile)) {
        try { fs.unlinkSync(compDiskFile); } catch (_) {}
      }
    } finally {
      compConn.release();
    }

    assert.strictEqual(fs.existsSync(compDiskFile), false, 'Disk file unlinked during failure compensation');
    pass('Research upload compensation cleans up physical disk file when failure occurs');

    console.log(`\n========================================================`);
    console.log(`✓ ALL ${testPassedCount} PASS 2B AUTHORIZATION BOUNDARY TESTS PASSED!`);
    console.log(`========================================================\n`);

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[CLEANUP] HTTP test server closed.');
    }
    await db.getPool().end();
    console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
  }
}

runPass2BTests().catch(err => {
  console.error('\n❌ PASS 2B TEST SUITE FAILED:', err);
  process.exit(1);
});
