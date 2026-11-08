// tests/pra_usk_demo_verification.test.js
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const db = require('../server/config/database');
const EntitySyncService = require('../server/services/entitySyncService');
const SearchService = require('../server/services/searchService');
const Board = require('../server/models/Board');
const Note = require('../server/models/Note');

console.log('================================================================');
console.log('  FLOWDEN PRA-USK END-TO-END DEMO VERIFICATION SUITE');
console.log('  Workflow: Vault Note ↔ Task ↔ Board Projection ↔ Search');
console.log('================================================================\n');

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

const ALICE_ID = 99001;
const BOB_ID = 99002;
const PROJECT_ID = 99010;
const BOARD_ID = 99020;

async function cleanupFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM board_items WHERE user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM boards WHERE user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM entity_links WHERE user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM project_entities WHERE project_id = ?', [PROJECT_ID]);
    await conn.query('DELETE FROM entities WHERE owner_user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM tasks WHERE user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM note_tag_map WHERE note_id IN (SELECT id FROM notes WHERE user_id IN (?, ?))', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM note_links WHERE source_note_id IN (SELECT id FROM notes WHERE user_id IN (?, ?))', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id IN (?, ?))', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM notes WHERE user_id IN (?, ?)', [ALICE_ID, BOB_ID]);
    await conn.query('DELETE FROM project_members WHERE project_id = ?', [PROJECT_ID]);
    await conn.query('DELETE FROM projects WHERE id = ?', [PROJECT_ID]);
    await conn.query('DELETE FROM users WHERE id IN (?, ?)', [ALICE_ID, BOB_ID]);
  } finally {
    conn.release();
  }
}

async function setupBaseFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    // 1. Users
    await conn.query(`
      INSERT INTO users (id, email, password_hash, display_name, role) VALUES
      (?, 'alice_demo@flowden.local', 'hash_demo', 'Alice Demo', 'admin'),
      (?, 'bob_demo@flowden.local', 'hash_demo', 'Bob Demo', 'user')
    `, [ALICE_ID, BOB_ID]);

    // 2. Project
    await conn.query(`
      INSERT INTO projects (id, user_id, title, description, color, created_at, updated_at)
      VALUES (?, ?, 'Flowden Pra-USK Demo', 'Vertical integration showcase', '#78C8B2', NOW(), NOW())
    `, [PROJECT_ID, ALICE_ID]);

    // Project Membership for Alice (Owner)
    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', NOW())
    `, [PROJECT_ID, ALICE_ID]);

    // 3. Board
    await conn.query(`
      INSERT INTO boards (id, project_id, user_id, title, created_at, updated_at)
      VALUES (?, ?, ?, 'Core Architecture Board', NOW(), NOW())
    `, [BOARD_ID, PROJECT_ID, ALICE_ID]);
  } finally {
    conn.release();
  }
}

async function runDemoVerification() {
  await db.initDB();
  assert.strictEqual(db.isConnectedToMySQL, true, 'db.isConnectedToMySQL must be true');
  const pool = await createPool();
  let passed = 0;
  let total = 0;

  try {
    // Check DB & Version
    const [dbRows] = await pool.query('SELECT DATABASE() as db, VERSION() as ver');
    console.log(`[Environment] Real MySQL Connection: ${dbRows[0].db} on version ${dbRows[0].ver}\n`);
    assert.strictEqual(dbRows[0].db, 'flowden_test', 'Must connect to flowden_test');

    console.log('[Setup] Cleaning up any prior fixtures...');
    await cleanupFixtures(pool);
    console.log('[Setup] Seeding demo baseline fixtures...');
    await setupBaseFixtures(pool);

    // ------------------------------------------------------------------------
    // STEP 1: Note Creation in Vault & Canonical Entity Sync
    // ------------------------------------------------------------------------
    total++;
    console.log('[Step 1: Create Note in Knowledge Vault & Verify Canonical Sync]');
    let noteId;
    {
      const [nRes] = await pool.query(
        'INSERT INTO notes (user_id, project_id, title, content, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [ALICE_ID, PROJECT_ID, 'Unified Invariant Specification', 'Universal registry architecture maps canonical entities and project containment with strict soft-delete provenance.', 14]
      );
      noteId = nRes.insertId;
      await EntitySyncService.syncNoteEntity(pool, noteId, ALICE_ID);

      const [entRows] = await pool.query('SELECT * FROM entities WHERE entity_type = "note" AND entity_id = ?', [noteId]);
      assert.strictEqual(entRows.length, 1, 'Canonical entity must exist for note');
      assert.strictEqual(entRows[0].title, 'Unified Invariant Specification');
      assert.strictEqual(entRows[0].primary_project_id, PROJECT_ID);

      const [peRows] = await pool.query('SELECT * FROM project_entities WHERE project_id = ? AND entity_type = "note" AND entity_id = ?', [PROJECT_ID, noteId]);
      assert.strictEqual(peRows.length, 1, 'project_entities must contain note entry');

      console.log('  ✅ PASSED: Note created and canonical entity synced.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 2: Note ↔ Task Bidirectional Integration
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 2: Note ↔ Task Bidirectional Linking]');
    let task1Id, task2Id;
    {
      // 2a. Create task directly linked to note
      const [t1Res] = await pool.query(
        'INSERT INTO tasks (user_id, project_id, title, description, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [ALICE_ID, PROJECT_ID, 'Implement Canonical Entity Synchronization', 'Build robust sync triggers between notes and entities', 'planned', 'high']
      );
      task1Id = t1Res.insertId;
      await EntitySyncService.syncTaskEntity(pool, task1Id, ALICE_ID);
      await EntitySyncService.linkNoteAndTask(pool, ALICE_ID, noteId, task1Id, 'relates_to');

      // 2b. Connect existing standalone task to note
      const [t2Res] = await pool.query(
        'INSERT INTO tasks (user_id, project_id, title, description, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [ALICE_ID, PROJECT_ID, 'Verify Spatial Board Live Projection', 'Ensure board cards pull authoritative data from canonical models', 'in_progress', 'urgent']
      );
      task2Id = t2Res.insertId;
      await EntitySyncService.syncTaskEntity(pool, task2Id, ALICE_ID);
      await EntitySyncService.linkNoteAndTask(pool, ALICE_ID, noteId, task2Id, 'depends_on');

      // Query from Note perspective
      const linkedTasks = await EntitySyncService.getLinkedTasksForNote(pool, ALICE_ID, noteId);
      assert.strictEqual(linkedTasks.length, 2, 'Note must have 2 linked tasks');
      const titles = linkedTasks.map(t => t.title);
      assert.ok(titles.includes('Implement Canonical Entity Synchronization'));
      assert.ok(titles.includes('Verify Spatial Board Live Projection'));

      // Query from Task perspective
      const linkedNotes1 = await EntitySyncService.getLinkedNotesForTask(pool, ALICE_ID, task1Id);
      assert.strictEqual(linkedNotes1.length, 1, 'Task 1 must have 1 linked note');
      assert.strictEqual(linkedNotes1[0].id, noteId);

      const linkedNotes2 = await EntitySyncService.getLinkedNotesForTask(pool, ALICE_ID, task2Id);
      assert.strictEqual(linkedNotes2.length, 1, 'Task 2 must have 1 linked note');
      assert.strictEqual(linkedNotes2[0].id, noteId);

      console.log('  ✅ PASSED: Bidirectional note-task relationships verified.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 3: Independent Mutation Safety (No Overwrites)
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 3: Independent Mutation Safety]');
    {
      // Update note content without touching task
      await pool.query('UPDATE notes SET title = ?, content = ? WHERE id = ?', ['Unified Invariant Specification v2', 'Updated content with deep charcoal specifications.', noteId]);
      await EntitySyncService.syncNoteEntity(pool, noteId, ALICE_ID);

      const [taskCheck] = await pool.query('SELECT * FROM tasks WHERE id = ?', [task1Id]);
      assert.strictEqual(taskCheck[0].title, 'Implement Canonical Entity Synchronization', 'Task title must remain unchanged');
      assert.strictEqual(taskCheck[0].status, 'planned', 'Task status must remain unchanged');

      // Update task status without touching note
      await pool.query('UPDATE tasks SET status = "done", completed_at = NOW() WHERE id = ?', [task1Id]);
      await EntitySyncService.syncTaskEntity(pool, task1Id, ALICE_ID);

      const [noteCheck] = await pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
      assert.strictEqual(noteCheck[0].title, 'Unified Invariant Specification v2', 'Note title must remain intact');
      assert.strictEqual(noteCheck[0].content, 'Updated content with deep charcoal specifications.', 'Note content must remain intact');

      console.log('  ✅ PASSED: Updates to note/task do not overwrite or corrupt each other.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 4: Spatial Board Live Projection Cards
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 4: Spatial Board Live Projections]');
    let boardItemNoteId, boardItemTaskId;
    {
      // Add Note as projection card to Board
      const [biNote] = await pool.query(
        'INSERT INTO board_items (board_id, user_id, item_type, reference_type, reference_id, title, content, position_x, position_y, width, height) VALUES (?, ?, "note", "note", ?, ?, ?, 100, 100, 260, 170)',
        [BOARD_ID, ALICE_ID, noteId, 'Initial Title', 'Initial Content']
      );
      boardItemNoteId = biNote.insertId;

      // Add Task as projection card to Board
      const [biTask] = await pool.query(
        'INSERT INTO board_items (board_id, user_id, item_type, reference_type, reference_id, title, content, position_x, position_y, width, height) VALUES (?, ?, "task", "task", ?, ?, ?, 400, 100, 260, 170)',
        [BOARD_ID, ALICE_ID, task1Id, 'Initial Task Title', 'Initial Task Desc']
      );
      boardItemTaskId = biTask.insertId;

      // Query board via Board.findById (which enriches projected cards live)
      const fullBoard = await Board.findById(BOARD_ID, ALICE_ID);
      assert.ok(fullBoard, 'Board must be found');
      assert.strictEqual(fullBoard.items.length, 2, 'Board must have 2 items');

      const projNote = fullBoard.items.find(i => i.id === boardItemNoteId);
      assert.ok(projNote.is_projection, 'Note card must be marked as projection');
      assert.strictEqual(projNote.title, 'Unified Invariant Specification v2', 'Projection card must pull live note title');
      assert.strictEqual(projNote.content, 'Updated content with deep charcoal specifications.', 'Projection card must pull live note content');

      const projTask = fullBoard.items.find(i => i.id === boardItemTaskId);
      assert.ok(projTask.is_projection, 'Task card must be marked as projection');
      assert.strictEqual(projTask.title, 'Implement Canonical Entity Synchronization', 'Projection card must pull live task title');
      assert.strictEqual(projTask.status, 'done', 'Projection card must pull live task status');

      // Update canonical note again
      await pool.query('UPDATE notes SET content = ? WHERE id = ?', ['Real-time sync to spatial board verified!', noteId]);
      await EntitySyncService.syncNoteEntity(pool, noteId, ALICE_ID);
      const fullBoardUpdated = await Board.findById(BOARD_ID, ALICE_ID);
      const projNoteUpdated = fullBoardUpdated.items.find(i => i.id === boardItemNoteId);
      assert.strictEqual(projNoteUpdated.content, 'Real-time sync to spatial board verified!', 'Board projection immediately reflects note update without manual copy');

      console.log('  ✅ PASSED: Spatial Board live projections reflect authoritative entity state.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 5: Board Projection Removal Safety
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 5: Board Projection Deletion Safety]');
    {
      // Delete the projected note card from board
      await Board.deleteItem(boardItemNoteId, BOARD_ID, ALICE_ID);

      // Verify board item is removed
      const [biRows] = await pool.query('SELECT * FROM board_items WHERE id = ?', [boardItemNoteId]);
      assert.strictEqual(biRows.length, 0, 'Board item must be deleted');

      // Verify canonical note is completely intact!
      const [noteCheck] = await pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
      assert.strictEqual(noteCheck.length, 1, 'Canonical note MUST NOT be deleted when board card is deleted');
      assert.strictEqual(noteCheck[0].title, 'Unified Invariant Specification v2');

      const [entCheck] = await pool.query('SELECT * FROM entities WHERE entity_type = "note" AND entity_id = ? AND deleted_at IS NULL', [noteId]);
      assert.strictEqual(entCheck.length, 1, 'Canonical entity registry record MUST remain active');

      console.log('  ✅ PASSED: Deleting board projection card leaves canonical note completely unharmed.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 6: Universal Search Integration & Authorization Guard
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 6: Universal Search Integration & Authorization Guard]');
    {
      // Alice searches for 'Invariant' -> should discover the note
      const searchNoteRes = await SearchService.universalSearch(pool, ALICE_ID, 'Invariant');
      assert.ok(searchNoteRes.length > 0, 'Alice must discover note via Universal Search');
      const foundNote = searchNoteRes.find(e => e.entity_type === 'note' && e.entity_id === noteId);
      assert.ok(foundNote, 'Must match the specific note entity');
      assert.ok(foundNote.search_text.includes('Real-time sync'), 'Must return search_text snippet');

      // Alice searches for 'Synchronization' -> should discover the task
      const searchTaskRes = await SearchService.universalSearch(pool, ALICE_ID, 'Synchronization');
      assert.ok(searchTaskRes.length > 0, 'Alice must discover task via Universal Search');
      const foundTask = searchTaskRes.find(e => e.entity_type === 'task' && e.entity_id === task1Id);
      assert.ok(foundTask, 'Must match the specific task entity');

      // Bob (unauthorized non-member) searches for 'Invariant' -> 0 results
      const bobSearchRes = await SearchService.universalSearch(pool, BOB_ID, 'Invariant');
      const bobLeak = bobSearchRes.filter(e => e.entity_type === 'note' && e.entity_id === noteId);
      assert.strictEqual(bobLeak.length, 0, 'Bob must NOT discover Alice project note');

      console.log('  ✅ PASSED: Universal search discovers notes and tasks with strict authorization.');
      passed++;
    }

    // ------------------------------------------------------------------------
    // STEP 7: Unlink Relationship Cleanliness
    // ------------------------------------------------------------------------
    total++;
    console.log('\n[Step 7: Unlink Note and Task]');
    {
      await EntitySyncService.unlinkNoteAndTask(pool, ALICE_ID, noteId, task2Id);
      const remainingTasks = await EntitySyncService.getLinkedTasksForNote(pool, ALICE_ID, noteId);
      assert.strictEqual(remainingTasks.length, 1, 'Note should now only have 1 linked task');
      assert.strictEqual(remainingTasks[0].id, task1Id);

      // Verify task2 is not deleted, only unlinked
      const [task2Check] = await pool.query('SELECT * FROM tasks WHERE id = ?', [task2Id]);
      assert.strictEqual(task2Check.length, 1, 'Unlinked task2 must remain alive');

      console.log('  ✅ PASSED: Relationship cleanly removed without affecting individual entities.');
      passed++;
    }

    console.log('\n================================================================');
    console.log(`  🎉 ALL PRA-USK VERIFICATION TESTS PASSED (${passed}/${total})`);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Removing test fixtures...');
    await cleanupFixtures(pool);
    await pool.end();
    console.log('[Cleanup] Done.');
    process.exit(0);
  }
}

runDemoVerification().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
