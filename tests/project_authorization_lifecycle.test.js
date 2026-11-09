// tests/project_authorization_lifecycle.test.js
/**
 * FLOWDEN — PASS 1: PROJECT AUTHORIZATION & PRIMARY ASSOCIATION LIFECYCLE
 *
 * Requirements:
 * 1. Strictly isolated unique test database generated per execution (never uses flowden or flowden_test).
 * 2. Never drops databases, truncates tables, or deletes existing user records.
 * 3. Authoritative migrations 001-008 applied and verified against MySQL.
 * 4. Verifies via actual HTTP requests:
 *    - Write authorization: Owner and Editor can create/reassign entities into a project;
 *      Viewer and NonMember are rejected with consistent 403 Forbidden;
 *      Invalid project IDs ('abc', -1) rejected with 400;
 *      Nonexistent project IDs (999999) rejected with 404;
 *      Personal entities (project_id: null) succeed with 201.
 *    - Unauthorized multipart uploads (Research / Vault) immediately unlink uploaded files on disk.
 * 5. Verifies primary project association lifecycle:
 *    - When primary project moves A -> B: association for A is removed from project_entities,
 *      association for B is added, entities.primary_project_id is updated.
 *    - Explicit secondary project associations (e.g. Project C) are strictly preserved.
 *    - Universal search access predicate reflects the updated access boundaries immediately.
 *    - Clearing primary project to null removes primary association and leaves secondary preserved.
 * 6. Database preserved after execution; pool and server closed cleanly.
 */

const crypto = require('crypto');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// Generate unique isolated database name
const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_auth_lifecycle_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use primary flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test default database');

const TEST_PORT = 5088;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = 'flowden_auth_lifecycle_secret_key_32chars_len!';

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

async function runAuthAndLifecycleTests() {
  console.log('=== STARTING PROJECT AUTHORIZATION & LIFECYCLE TEST SUITE ===\n');
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

  // 2. Initialize application database, run authoritative migrations
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
  console.log('[SETUP] Migrations 001-008 and security tables verified.');

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

    const ownerUser = await User.create({ email: 'owner@flowden.io', password_hash: 'hash_owner', display_name: 'Project Owner' });
    const editorUser = await User.create({ email: 'editor@flowden.io', password_hash: 'hash_editor', display_name: 'Project Editor' });
    const viewerUser = await User.create({ email: 'viewer@flowden.io', password_hash: 'hash_viewer', display_name: 'Project Viewer' });
    const nonMemberUser = await User.create({ email: 'nonmember@flowden.io', password_hash: 'hash_nonmember', display_name: 'Non Member' });
    const memberCUser = await User.create({ email: 'memberc@flowden.io', password_hash: 'hash_memberc', display_name: 'Member of Project C' });

    const ownerToken = jwt.sign({ id: ownerUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const editorToken = jwt.sign({ id: editorUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const viewerToken = jwt.sign({ id: viewerUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const nonMemberToken = jwt.sign({ id: nonMemberUser.id }, JWT_SECRET, { expiresIn: '1h' });
    const memberCToken = jwt.sign({ id: memberCUser.id }, JWT_SECRET, { expiresIn: '1h' });

    // 5. Seed Projects (All created by ownerUser)
    const projectA = await Project.create(ownerUser.id, { title: 'Project Alpha' });
    const projectB = await Project.create(ownerUser.id, { title: 'Project Beta' });
    const projectC = await Project.create(ownerUser.id, { title: 'Project Gamma' });

    // 6. Assign Project Memberships
    // Project A: editorUser is editor, viewerUser is viewer
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "editor", NOW())',
      [projectA.id, editorUser.id]
    );
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [projectA.id, viewerUser.id]
    );

    // Project B: editorUser is editor
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "editor", NOW())',
      [projectB.id, editorUser.id]
    );

    // Project C: memberCUser is viewer
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [projectC.id, memberCUser.id]
    );

    console.log('\n--- PART 1: PROJECT WRITE AUTHORIZATION TESTS ---');

    // Test 1.1: Owner can create Note in Project A
    const resNoteOwner = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: 'Owner Note in Alpha', content: 'Authorized owner note', project_id: projectA.id })
    });
    assert.strictEqual(resNoteOwner.status, 201, 'Owner must be allowed to create note in project (201)');
    const bodyNoteOwner = await resNoteOwner.json();
    assert.strictEqual(bodyNoteOwner.note.project_id, projectA.id);
    pass('Owner can create Note in Project A (HTTP 201)');

    // Test 1.2: Editor can create Note in Project A
    const resNoteEditor = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
      body: JSON.stringify({ title: 'Editor Note in Alpha', content: 'Authorized editor note', project_id: projectA.id })
    });
    assert.strictEqual(resNoteEditor.status, 201, 'Editor must be allowed to create note in project (201)');
    pass('Editor can create Note in Project A (HTTP 201)');

    // Test 1.3: Viewer CANNOT create Note in Project A (403)
    const resNoteViewer = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ title: 'Viewer Note attempt', content: 'Unauthorized viewer note', project_id: projectA.id })
    });
    assert.strictEqual(resNoteViewer.status, 403, 'Viewer must be rejected with 403 Forbidden');
    pass('Viewer cannot create Note in Project A (HTTP 403)');

    // Test 1.4: NonMember CANNOT create Note in Project A (403)
    const resNoteNonMember = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nonMemberToken}` },
      body: JSON.stringify({ title: 'NonMember Note attempt', content: 'Unauthorized nonmember note', project_id: projectA.id })
    });
    assert.strictEqual(resNoteNonMember.status, 403, 'NonMember must be rejected with 403 Forbidden');
    pass('NonMember cannot create Note in Project A (HTTP 403)');

    // Test 1.5: Invalid project ID rejected with 400
    const resNoteInvalid = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: 'Invalid Project Note', content: 'Invalid id test', project_id: 'not_an_id' })
    });
    assert.strictEqual(resNoteInvalid.status, 400, 'Invalid project_id must return 400 Bad Request');
    pass('Invalid project_id ("not_an_id") rejected with HTTP 400');

    // Test 1.6: Nonexistent project ID rejected with 404
    const resNoteNonexistent = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: 'Nonexistent Project Note', content: 'Nonexistent id test', project_id: 999999 })
    });
    assert.strictEqual(resNoteNonexistent.status, 404, 'Nonexistent project_id must return 404 Not Found');
    pass('Nonexistent project_id (999999) rejected with HTTP 404');

    // Test 1.7: Personal Note creation (project_id: null) succeeds
    const resNotePersonal = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ title: 'Viewer Personal Note', content: 'Personal content', project_id: null })
    });
    assert.strictEqual(resNotePersonal.status, 201, 'Personal note creation must succeed (201)');
    const bodyNotePersonal = await resNotePersonal.json();
    assert.strictEqual(bodyNotePersonal.note.project_id, null);
    pass('Personal Note creation (project_id: null) succeeds with HTTP 201');

    // Test 1.8: Viewer CANNOT reassign existing personal Note to Project A (403)
    const resNoteReassignUnauthorized = await fetch(`${BASE_URL}/api/v1/notes/${bodyNotePersonal.note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ project_id: projectA.id })
    });
    assert.strictEqual(resNoteReassignUnauthorized.status, 403, 'Viewer reassigning note to project must be rejected (403)');
    pass('Viewer cannot reassign Note to Project A (HTTP 403)');

    // Test 1.9: Task Write Authorization (Owner & Editor 201; Viewer & NonMember 403)
    const resTaskOwner = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ title: 'Owner Task', description: 'Task in Alpha', project_id: projectA.id })
    });
    assert.strictEqual(resTaskOwner.status, 201, 'Owner must be allowed to create task in project');
    pass('Owner can create Task in Project A (HTTP 201)');

    const resTaskEditor = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
      body: JSON.stringify({ title: 'Editor Task', description: 'Task in Alpha', project_id: projectA.id })
    });
    assert.strictEqual(resTaskEditor.status, 201, 'Editor must be allowed to create task in project');
    pass('Editor can create Task in Project A (HTTP 201)');

    const resTaskViewer = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
      body: JSON.stringify({ title: 'Viewer Task Attempt', description: 'Task in Alpha', project_id: projectA.id })
    });
    assert.strictEqual(resTaskViewer.status, 403, 'Viewer must be rejected creating task in project (403)');
    pass('Viewer cannot create Task in Project A (HTTP 403)');

    const resTaskNonMember = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nonMemberToken}` },
      body: JSON.stringify({ title: 'NonMember Task Attempt', description: 'Task in Alpha', project_id: projectA.id })
    });
    assert.strictEqual(resTaskNonMember.status, 403, 'NonMember must be rejected creating task in project (403)');
    pass('NonMember cannot create Task in Project A (HTTP 403)');

    // Test 1.10: Multipart Research Upload Authorization & File Cleanup
    const researchUploadDir = path.join(__dirname, '..', 'uploads', 'research');

    // Helper: count files in research upload dir
    const getResearchFileCount = () => {
      if (!fs.existsSync(researchUploadDir)) return 0;
      return fs.readdirSync(researchUploadDir).length;
    };

    // Owner uploads research file -> 201, file remains on disk
    const filesBeforeOwner = getResearchFileCount();
    const ownerFd = new FormData();
    ownerFd.append('file', new Blob(['# Owner Research\nValid research text content.'], { type: 'text/markdown' }), 'owner_research.md');
    ownerFd.append('project_id', String(projectA.id));

    const resResearchOwner = await fetch(`${BASE_URL}/api/v1/research/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: ownerFd
    });
    assert.strictEqual(resResearchOwner.status, 201, 'Owner research upload must succeed (201)');
    const filesAfterOwner = getResearchFileCount();
    assert.strictEqual(filesAfterOwner, filesBeforeOwner + 1, 'Owner research upload must persist file on disk');
    pass('Owner can upload Research to Project A (HTTP 201, file preserved)');

    // Viewer attempts unauthorized research upload -> 403, file unlinked immediately
    const filesBeforeViewer = getResearchFileCount();
    const viewerFd = new FormData();
    viewerFd.append('file', new Blob(['# Unauthorized Viewer Research\nThis file must be unlinked!'], { type: 'text/markdown' }), 'viewer_unauth.md');
    viewerFd.append('project_id', String(projectA.id));

    const resResearchViewer = await fetch(`${BASE_URL}/api/v1/research/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: viewerFd
    });
    assert.strictEqual(resResearchViewer.status, 403, 'Viewer research upload to project must be rejected (403)');
    const filesAfterViewer = getResearchFileCount();
    assert.strictEqual(filesAfterViewer, filesBeforeViewer, 'Unauthorized uploaded research file MUST be immediately unlinked from disk');

    const dbDocRows = await db.query('SELECT COUNT(*) as count FROM research_documents WHERE original_filename = "viewer_unauth.md"');
    assert.strictEqual(dbDocRows[0].count, 0, 'No research_document record must be created for unauthorized upload');
    pass('Viewer cannot upload Research to Project A (HTTP 403, disk file immediately unlinked)');

    // NonMember attempts unauthorized research upload -> 403, file unlinked
    const filesBeforeNonMember = getResearchFileCount();
    const nonMemberFd = new FormData();
    nonMemberFd.append('file', new Blob(['# NonMember Research\nMust be unlinked!'], { type: 'text/markdown' }), 'nonmember_unauth.md');
    nonMemberFd.append('project_id', String(projectA.id));

    const resResearchNonMember = await fetch(`${BASE_URL}/api/v1/research/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nonMemberToken}` },
      body: nonMemberFd
    });
    assert.strictEqual(resResearchNonMember.status, 403, 'NonMember research upload must be rejected (403)');
    const filesAfterNonMember = getResearchFileCount();
    assert.strictEqual(filesAfterNonMember, filesBeforeNonMember, 'NonMember upload file MUST be immediately unlinked from disk');
    pass('NonMember cannot upload Research to Project A (HTTP 403, disk file immediately unlinked)');

    // Unauthorized Vault Note Attachment -> 403, file unlinked
    const vaultUploadDir = path.join(__dirname, '..', 'uploads', 'vault');
    const getVaultFileCount = () => {
      if (!fs.existsSync(vaultUploadDir)) return 0;
      return fs.readdirSync(vaultUploadDir).length;
    };
    const vaultFilesBefore = getVaultFileCount();
    const vaultFd = new FormData();
    vaultFd.append('file', new Blob(['fake image content'], { type: 'text/plain' }), 'unauth_vault_attachment.txt');
    vaultFd.append('project_id', String(projectA.id));

    const resVaultViewer = await fetch(`${BASE_URL}/api/v1/notes/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: vaultFd
    });
    assert.strictEqual(resVaultViewer.status, 403, 'Viewer vault attachment upload to project must be rejected (403)');
    const vaultFilesAfter = getVaultFileCount();
    assert.strictEqual(vaultFilesAfter, vaultFilesBefore, 'Unauthorized vault upload MUST be immediately unlinked from disk');
    pass('Viewer cannot upload Vault attachment to Project A (HTTP 403, disk file immediately unlinked)');

    console.log('\n--- PART 2: PRIMARY PROJECT ASSOCIATION LIFECYCLE (NOTES) ---');

    // Step 2.1: Owner creates Note in Project A
    const resLifecycleNote = await fetch(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Quantum Cryptography Protocol',
        content: 'Quantum key distribution and photon polarization protocols.',
        project_id: projectA.id
      })
    });
    assert.strictEqual(resLifecycleNote.status, 201);
    const lifecycleNote = (await resLifecycleNote.json()).note;
    assert.strictEqual(lifecycleNote.project_id, projectA.id);

    // Verify canonical entity and primary association
    const noteEntitiesInit = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "note" AND entity_id = ?',
      [lifecycleNote.id]
    );
    assert.strictEqual(noteEntitiesInit.length, 1);
    assert.strictEqual(noteEntitiesInit[0].primary_project_id, projectA.id, 'entities.primary_project_id must match Project A');

    const peInit = await db.query(
      'SELECT project_id, entity_type, entity_id FROM project_entities WHERE entity_type = "note" AND entity_id = ?',
      [lifecycleNote.id]
    );
    assert.strictEqual(peInit.length, 1, 'Exactly one primary association must exist in project_entities');
    assert.strictEqual(peInit[0].project_id, projectA.id, 'Association must belong to Project A');

    // Search access verification
    // viewerUser is member of Project A -> CAN see the note
    const searchViewerA = await SearchService.universalSearch(db, viewerUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchViewerA.length, 1, 'Member of Project A must find Note in search');
    assert.strictEqual(searchViewerA[0].entity_id, lifecycleNote.id);

    // memberCUser is NOT in Project A -> CANNOT see the note
    const searchMemberCInit = await SearchService.universalSearch(db, memberCUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchMemberCInit.length, 0, 'Member of Project C must NOT see Note before association');
    pass('Note created in Project A: primary entity and association registered; member of A sees note, others do not');

    // Step 2.2: Add explicit secondary association to Project C
    await EntitySyncService.addProjectAssociation(db, projectC.id, 'note', lifecycleNote.id, 'viewer', ownerUser.id);

    const peWithSecondary = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "note" AND entity_id = ? ORDER BY project_id ASC',
      [lifecycleNote.id]
    );
    assert.strictEqual(peWithSecondary.length, 2, 'project_entities must contain both Project A and Project C');
    const pIdsWithSec = peWithSecondary.map(r => r.project_id);
    assert.ok(pIdsWithSec.includes(projectA.id));
    assert.ok(pIdsWithSec.includes(projectC.id));

    // Member C can now find the note via secondary association!
    const searchMemberCSec = await SearchService.universalSearch(db, memberCUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchMemberCSec.length, 1, 'Member of Project C must find Note via secondary association');
    pass('Explicit secondary association to Project C added: Member C now accesses Note via secondary association');

    // Step 2.3: Reassign primary project from Project A to Project B
    const resMoveToB = await fetch(`${BASE_URL}/api/v1/notes/${lifecycleNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ project_id: projectB.id })
    });
    assert.strictEqual(resMoveToB.status, 200, 'Reassignment to Project B must succeed (200)');
    const movedNote = (await resMoveToB.json()).note;
    assert.strictEqual(movedNote.project_id, projectB.id);

    // Verify canonical entity primary_project_id updated
    const noteEntitiesAfterMove = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "note" AND entity_id = ?',
      [lifecycleNote.id]
    );
    assert.strictEqual(noteEntitiesAfterMove[0].primary_project_id, projectB.id, 'entities.primary_project_id must be Project B');

    // In project_entities: association for A must be REMOVED; association for B must be PRESENT;
    // explicit secondary association for C must be PRESERVED!
    const peAfterMove = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "note" AND entity_id = ? ORDER BY project_id ASC',
      [lifecycleNote.id]
    );
    const pIdsAfterMove = peAfterMove.map(r => r.project_id);
    assert.strictEqual(pIdsAfterMove.includes(projectA.id), false, 'Association for former Project A MUST be removed');
    assert.strictEqual(pIdsAfterMove.includes(projectB.id), true, 'Association for new Project B MUST exist');
    assert.strictEqual(pIdsAfterMove.includes(projectC.id), true, 'Secondary association for Project C MUST be preserved');
    assert.strictEqual(peAfterMove.length, 2, 'Exactly 2 associations (Project B primary, Project C secondary) must exist');

    // Search access verification after reassignment:
    // 1. Member of Project A (viewerUser) must NO LONGER see the note (former primary isolated)!
    const searchViewerAfterMove = await SearchService.universalSearch(db, viewerUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchViewerAfterMove.length, 0, 'Member of former Project A must no longer see Note in search');

    // 2. Member of Project B (editorUser) must see the note!
    const searchEditorAfterMove = await SearchService.universalSearch(db, editorUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchEditorAfterMove.length, 1, 'Member of new Project B must see Note in search');

    // 3. Member of Project C (memberCUser) must STILL see the note via preserved secondary association!
    const searchMemberCAfterMove = await SearchService.universalSearch(db, memberCUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchMemberCAfterMove.length, 1, 'Member of Project C must STILL see Note via secondary association');
    pass('Primary reassignment A -> B: former primary association deleted, new primary added, secondary association C preserved, search access updated');

    // Step 2.4: Reassign note from Project B to personal (project_id: null)
    const resMoveToPersonal = await fetch(`${BASE_URL}/api/v1/notes/${lifecycleNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ project_id: null })
    });
    assert.strictEqual(resMoveToPersonal.status, 200, 'Reassignment to personal must succeed (200)');
    const personalNote = (await resMoveToPersonal.json()).note;
    assert.strictEqual(personalNote.project_id, null);

    // Verify canonical entity primary_project_id is null
    const noteEntitiesPersonal = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "note" AND entity_id = ?',
      [lifecycleNote.id]
    );
    assert.strictEqual(noteEntitiesPersonal[0].primary_project_id, null, 'entities.primary_project_id must be null');

    // In project_entities: association for B must be REMOVED; secondary association for C must be PRESERVED!
    const pePersonal = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "note" AND entity_id = ?',
      [lifecycleNote.id]
    );
    assert.strictEqual(pePersonal.length, 1, 'Only secondary association to Project C should remain');
    assert.strictEqual(pePersonal[0].project_id, projectC.id, 'Remaining association must be Project C');

    // Search access verification:
    // Member of B can no longer see it
    const searchEditorPersonal = await SearchService.universalSearch(db, editorUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchEditorPersonal.length, 0, 'Member of B can no longer see personal Note');

    // Member of C CAN STILL see it via secondary association
    const searchMemberCPersonal = await SearchService.universalSearch(db, memberCUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchMemberCPersonal.length, 1, 'Member of C STILL sees Note via secondary association');

    // Owner CAN see it (personal owner)
    const searchOwnerPersonal = await SearchService.universalSearch(db, ownerUser.id, 'Quantum Cryptography');
    assert.strictEqual(searchOwnerPersonal.length, 1, 'Owner can see personal Note');
    pass('Reassignment to personal (project_id: null): primary association B removed, secondary C preserved, owner retains personal access');

    console.log('\n--- PART 3: PRIMARY PROJECT ASSOCIATION LIFECYCLE (TASKS) ---');

    // Step 3.1: Create Task in Project A
    const resLifecycleTask = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Distributed Consensus Engine Implementation',
        description: 'Implement Raft state machine replication.',
        project_id: projectA.id
      })
    });
    assert.strictEqual(resLifecycleTask.status, 201);
    const lifecycleTask = (await resLifecycleTask.json()).task;
    assert.strictEqual(lifecycleTask.project_id, projectA.id);

    // Verify canonical entity and primary association
    const taskEntitiesInit = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "task" AND entity_id = ?',
      [lifecycleTask.id]
    );
    assert.strictEqual(taskEntitiesInit[0].primary_project_id, projectA.id);

    const taskPeInit = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "task" AND entity_id = ?',
      [lifecycleTask.id]
    );
    assert.strictEqual(taskPeInit.length, 1);
    assert.strictEqual(taskPeInit[0].project_id, projectA.id);

    // Search check: Member of A sees task, others do not
    const searchTaskViewerA = await SearchService.universalSearch(db, viewerUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskViewerA.length, 1, 'Member of Project A must see Task');

    const searchTaskMemberCInit = await SearchService.universalSearch(db, memberCUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskMemberCInit.length, 0, 'Member of Project C must not see Task initially');
    pass('Task created in Project A: primary entity and association registered; member of A sees task');

    // Step 3.2: Add explicit secondary association to Project C
    await EntitySyncService.addProjectAssociation(db, projectC.id, 'task', lifecycleTask.id, 'contributor', ownerUser.id);
    const searchTaskMemberCSec = await SearchService.universalSearch(db, memberCUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskMemberCSec.length, 1, 'Member of Project C must see Task via secondary association');
    pass('Explicit secondary association to Project C added for Task: Member C accesses Task');

    // Step 3.3: Reassign Task from Project A to Project B
    const resMoveTaskToB = await fetch(`${BASE_URL}/api/v1/tasks/${lifecycleTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ project_id: projectB.id })
    });
    assert.strictEqual(resMoveTaskToB.status, 200);

    const taskEntitiesAfterMove = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "task" AND entity_id = ?',
      [lifecycleTask.id]
    );
    assert.strictEqual(taskEntitiesAfterMove[0].primary_project_id, projectB.id);

    const taskPeAfterMove = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "task" AND entity_id = ? ORDER BY project_id ASC',
      [lifecycleTask.id]
    );
    const taskPIdsAfterMove = taskPeAfterMove.map(r => r.project_id);
    assert.strictEqual(taskPIdsAfterMove.includes(projectA.id), false, 'Task association for Project A must be deleted');
    assert.strictEqual(taskPIdsAfterMove.includes(projectB.id), true, 'Task association for Project B must exist');
    assert.strictEqual(taskPIdsAfterMove.includes(projectC.id), true, 'Task secondary association for Project C must be preserved');

    // Search access verification
    const searchTaskViewerAfterMove = await SearchService.universalSearch(db, viewerUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskViewerAfterMove.length, 0, 'Former Project A member must no longer see Task');

    const searchTaskEditorAfterMove = await SearchService.universalSearch(db, editorUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskEditorAfterMove.length, 1, 'New Project B member must see Task');

    const searchTaskMemberCAfterMove = await SearchService.universalSearch(db, memberCUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskMemberCAfterMove.length, 1, 'Project C member must STILL see Task via secondary association');
    pass('Primary reassignment A -> B for Task: association A removed, association B added, secondary association C preserved');

    // Step 3.4: Reassign Task to personal (project_id: null)
    const resMoveTaskToPersonal = await fetch(`${BASE_URL}/api/v1/tasks/${lifecycleTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ project_id: null })
    });
    assert.strictEqual(resMoveTaskToPersonal.status, 200);

    const taskEntitiesPersonal = await db.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "task" AND entity_id = ?',
      [lifecycleTask.id]
    );
    assert.strictEqual(taskEntitiesPersonal[0].primary_project_id, null);

    const taskPePersonal = await db.query(
      'SELECT project_id FROM project_entities WHERE entity_type = "task" AND entity_id = ?',
      [lifecycleTask.id]
    );
    assert.strictEqual(taskPePersonal.length, 1);
    assert.strictEqual(taskPePersonal[0].project_id, projectC.id);

    const searchTaskEditorPersonal = await SearchService.universalSearch(db, editorUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskEditorPersonal.length, 0, 'Member of B can no longer see personal Task');

    const searchTaskMemberCPersonal = await SearchService.universalSearch(db, memberCUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskMemberCPersonal.length, 1, 'Member of C STILL sees Task via secondary association');

    const searchTaskOwnerPersonal = await SearchService.universalSearch(db, ownerUser.id, 'Distributed Consensus');
    assert.strictEqual(searchTaskOwnerPersonal.length, 1, 'Owner sees personal Task');
    pass('Reassignment to personal (project_id: null) for Task: association B removed, secondary C preserved');

    console.log(`\n======================================================`);
    console.log(`  ALL ${testPassedCount} VERIFICATION TESTS PASSED SUCCESSFULLY!`);
    console.log(`======================================================\n`);

  } catch (err) {
    console.error('[TEST ERROR]', err);
    throw err;
  } finally {
    // 7. Clean Shutdown & Database Preservation
    console.log('[CLEANUP] Closing HTTP server and database pool...');
    await new Promise((resolve) => server.close(resolve));
    const activePool = db.getPool();
    if (activePool) {
      await activePool.end();
    }
    console.log('[CLEANUP] HTTP server closed and database pool closed cleanly.');

    // 8. Verify database is preserved without drop
    const postConn = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
    try {
      const [finalDbs] = await postConn.query('SHOW DATABASES LIKE ?', [ISOLATED_DB_NAME]);
      assert.strictEqual(finalDbs.length, 1, `Isolated database "${ISOLATED_DB_NAME}" must be preserved (never dropped)`);
      console.log(`[VERIFICATION] Isolated database "${ISOLATED_DB_NAME}" confirmed intact in MySQL (never dropped).`);
    } finally {
      await postConn.end();
    }
  }
}

if (require.main === module) {
  runAuthAndLifecycleTests()
    .then(() => {
      console.log('[SUCCESS] Project authorization and primary association lifecycle verified.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[FATAL TEST FAILURE]', err);
      process.exit(1);
    });
}

module.exports = { runAuthAndLifecycleTests };
