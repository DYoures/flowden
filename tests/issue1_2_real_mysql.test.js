// tests/issue1_2_real_mysql.test.js
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { deleteBoard, restoreBoard } = require('../server/services/boardService');
const { deleteResearchDoc, restoreResearchDoc } = require('../server/services/researchService');

console.log('================================================================');
console.log('  FLOWDEN ISSUE 1 & 2 — REAL MYSQL 8.4 VERIFICATION SUITE');
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

async function cleanupFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM board_items WHERE user_id IN (88001, 88002) OR (id >= 88000 AND id < 89000)');
    await conn.query('DELETE FROM boards WHERE user_id IN (88001, 88002) OR (id >= 88000 AND id < 89000)');
    await conn.query('DELETE FROM research_excerpts WHERE user_id IN (88001, 88002) OR (id >= 88000 AND id < 89000)');
    await conn.query('DELETE FROM research_documents WHERE user_id IN (88001, 88002) OR (id >= 88000 AND id < 89000)');
    await conn.query('DELETE FROM entities WHERE owner_user_id IN (88001, 88002) OR primary_project_id = 88010 OR (id >= 880000 AND id < 1000000)');
    await conn.query('DELETE FROM project_entities WHERE project_id = 88010');
    await conn.query('DELETE FROM project_members WHERE project_id = 88010');
    await conn.query('DELETE FROM projects WHERE id = 88010');
    await conn.query('DELETE FROM users WHERE id IN (88001, 88002)');
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
      (88001, 'user88001@verify.local', 'hash1', 'Owner User', 'admin'),
      (88002, 'user88002@verify.local', 'hash2', 'Viewer User', 'user')
      ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)
    `);

    // 2. Project
    await conn.query(`
      INSERT INTO projects (id, user_id, title) VALUES
      (88010, 88001, 'Verification Project 88010')
      ON DUPLICATE KEY UPDATE title = VALUES(title)
    `);

    // 3. Project Members: 88001 is owner, 88002 is viewer
    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role) VALUES
      (88010, 88001, 'owner'),
      (88010, 88002, 'viewer')
      ON DUPLICATE KEY UPDATE role = VALUES(role)
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

  try {
    // Safety verification
    const [dbRows] = await conn.query('SELECT DATABASE() AS db, VERSION() AS ver');
    const currentDb = dbRows[0].db;
    const currentVer = dbRows[0].ver;
    console.log(`[Environment] Real MySQL Connection: ${currentDb} on version ${currentVer}`);
    assert.strictEqual(currentDb, 'flowden_test', 'Must connect ONLY to flowden_test');
    assert(currentVer.startsWith('8.4'), 'Must run on MySQL 8.4.x');

    // Clean up any stale fixtures before starting
    await cleanupFixtures(pool);
    await setupBaseFixtures(pool);

    console.log('\n--- PART A: BOARD RESTORATION TESTS ---\n');

    // TEST A1: A deleted parent Board can be restored
    totalTests++;
    try {
      console.log('[Test A1: Restore single parent Board]');
      const bId = 88201;
      const eId = 880201;
      await conn.query(`
        INSERT INTO boards (id, project_id, user_id, title) VALUES (?, 88010, 88001, 'Board A1')
      `, [bId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88201', 'board', ?, 88001, 88010, 'Board A1')
      `, [eId, bId]);

      // Soft delete
      const delRes = await deleteBoard(pool, 88001, bId);
      assert.strictEqual(delRes.success, true);
      const [delRows] = await conn.query('SELECT deleted_at FROM boards WHERE id = ?', [bId]);
      const [delERows] = await conn.query('SELECT deleted_at FROM entities WHERE id = ?', [eId]);
      assert(delRows[0].deleted_at !== null, 'Board must be soft-deleted');
      assert(delERows[0].deleted_at !== null, 'Entity must be soft-deleted');

      // Restore
      const resRes = await restoreBoard(pool, 88001, bId);
      assert.strictEqual(resRes.success, true);
      const [resRows] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM boards WHERE id = ?', [bId]);
      const [resERows] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [eId]);
      assert.strictEqual(resRows[0].deleted_at, null, 'Board deleted_at must be NULL after restore');
      assert.strictEqual(resRows[0].cascade_deleted_by, null, 'Board cascade marker must be NULL');
      assert.strictEqual(resERows[0].deleted_at, null, 'Entity deleted_at must be NULL after restore');
      assert.strictEqual(resERows[0].cascade_deleted_by, null, 'Entity cascade marker must be NULL');

      console.log('  ✅ PASSED: A1. Deleted parent Board and its entity successfully restored');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A1:', err);
      throw err;
    }

    // TEST A2: Eligible child Boards restored according to cascade provenance rules (P -> C1 -> GC1)
    totalTests++;
    try {
      console.log('\n[Test A2: Recursive child board restoration with cascade provenance]');
      const pId = 88210, c1Id = 88211, gc1Id = 88212;
      const pEid = 880210, c1Eid = 880211, gc1Eid = 880212;

      await conn.query(`
        INSERT INTO boards (id, project_id, parent_board_id, user_id, title) VALUES
        (?, 88010, NULL, 88001, 'Parent Board A2'),
        (?, 88010, ?, 88001, 'Child Board A2'),
        (?, 88010, ?, 88001, 'Grandchild Board A2')
      `, [pId, c1Id, pId, gc1Id, c1Id]);

      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title) VALUES
        (?, 'uuid-88210', 'board', ?, 88001, 88010, 'Parent Board A2'),
        (?, 'uuid-88211', 'board', ?, 88001, 88010, 'Child Board A2'),
        (?, 'uuid-88212', 'board', ?, 88001, 88010, 'Grandchild Board A2')
      `, [pEid, pId, c1Eid, c1Id, gc1Eid, gc1Id]);

      // Soft delete parent
      await deleteBoard(pool, 88001, pId);

      const [cRowsDel] = await conn.query('SELECT id, deleted_at, cascade_deleted_by FROM boards WHERE id IN (?, ?, ?)', [pId, c1Id, gc1Id]);
      assert.strictEqual(cRowsDel.length, 3);
      assert(cRowsDel.every(r => r.deleted_at !== null), 'All three boards must be soft-deleted');
      const c1 = cRowsDel.find(r => r.id === c1Id);
      const gc1 = cRowsDel.find(r => r.id === gc1Id);
      assert.strictEqual(c1.cascade_deleted_by, pId, 'Child cascade_deleted_by must equal parent ID');
      assert.strictEqual(gc1.cascade_deleted_by, pId, 'Grandchild cascade_deleted_by must equal parent ID');

      // Restore parent
      await restoreBoard(pool, 88001, pId);

      const [cRowsRes] = await conn.query('SELECT id, deleted_at, cascade_deleted_by FROM boards WHERE id IN (?, ?, ?)', [pId, c1Id, gc1Id]);
      assert(cRowsRes.every(r => r.deleted_at === null && r.cascade_deleted_by === null), 'All three boards must be restored');

      const [eRowsRes] = await conn.query('SELECT id, deleted_at, cascade_deleted_by FROM entities WHERE id IN (?, ?, ?)', [pEid, c1Eid, gc1Eid]);
      assert(eRowsRes.every(r => r.deleted_at === null && r.cascade_deleted_by === null), 'All three board entities must be restored');

      console.log('  ✅ PASSED: A2. Recursive descendant boards and entities restored cleanly via provenance');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A2:', err);
      throw err;
    }

    // TEST A3: Child Board independently deleted before its parent remains in Trash
    totalTests++;
    try {
      console.log('\n[Test A3: Independently deleted child board remains in Trash after parent restore]');
      const pId = 88220, cActiveId = 88221, cIndepId = 88222;
      const pEid = 880220, cActiveEid = 880221, cIndepEid = 880222;

      await conn.query(`
        INSERT INTO boards (id, project_id, parent_board_id, user_id, title) VALUES
        (?, 88010, NULL, 88001, 'Parent Board A3'),
        (?, 88010, ?, 88001, 'Child Active A3'),
        (?, 88010, ?, 88001, 'Child Independently Deleted A3')
      `, [pId, cActiveId, pId, cIndepId, pId]);

      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title) VALUES
        (?, 'uuid-88220', 'board', ?, 88001, 88010, 'Parent Board A3'),
        (?, 'uuid-88221', 'board', ?, 88001, 88010, 'Child Active A3'),
        (?, 'uuid-88222', 'board', ?, 88001, 88010, 'Child Independently Deleted A3')
      `, [pEid, pId, cActiveEid, cActiveId, cIndepEid, cIndepId]);

      // Soft-delete cIndep independently beforehand
      const indepTs = new Date('2026-09-01T12:00:00Z');
      await conn.query('UPDATE boards SET deleted_at = ?, cascade_deleted_by = NULL WHERE id = ?', [indepTs, cIndepId]);
      await conn.query('UPDATE entities SET deleted_at = ?, cascade_deleted_by = NULL WHERE id = ?', [indepTs, cIndepEid]);

      // Delete parent
      await deleteBoard(pool, 88001, pId);

      // Verify cIndep was NOT marked with cascade_deleted_by = pId
      const [cIndepDel] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM boards WHERE id = ?', [cIndepId]);
      assert.strictEqual(cIndepDel[0].cascade_deleted_by, null, 'Independently trashed child must not receive cascade marker');

      // Restore parent
      await restoreBoard(pool, 88001, pId);

      // Parent and active child are restored
      const [pRes] = await conn.query('SELECT deleted_at FROM boards WHERE id = ?', [pId]);
      const [cActiveRes] = await conn.query('SELECT deleted_at FROM boards WHERE id = ?', [cActiveId]);
      assert.strictEqual(pRes[0].deleted_at, null);
      assert.strictEqual(cActiveRes[0].deleted_at, null);

      // Independently trashed child REMAINS in Trash
      const [cIndepAfter] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM boards WHERE id = ?', [cIndepId]);
      const [cIndepEAfter] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [cIndepEid]);
      assert(cIndepAfter[0].deleted_at !== null, 'Independently deleted child must remain in Trash');
      assert.strictEqual(cIndepAfter[0].cascade_deleted_by, null);
      assert(cIndepEAfter[0].deleted_at !== null, 'Independently deleted child entity must remain in Trash');

      console.log('  ✅ PASSED: A3. Independently trashed child board remains in Trash after parent restore');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A3:', err);
      throw err;
    }

    // TEST A4: Board entities and corresponding board_items remain consistent
    totalTests++;
    try {
      console.log('\n[Test A4: Board entities and board_items consistency]');
      const bId = 88230;
      const biId = 88331;

      await conn.query(`
        INSERT INTO boards (id, project_id, user_id, title) VALUES (?, 88010, 88001, 'Board A4')
      `, [bId]);
      await conn.query(`
        INSERT INTO board_items (id, board_id, user_id, item_type, title, position_x, position_y)
        VALUES (?, ?, 88001, 'note', 'Native Sticky Item', 10, 20)
      `, [biId, bId]);

      // Soft delete board
      await deleteBoard(pool, 88001, bId);
      const [biDel] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biId]);
      assert(biDel[0].deleted_at !== null, 'Board item must be soft deleted');
      assert.strictEqual(biDel[0].cascade_deleted_by, bId, 'Board item cascade marker must match boardId');

      // Restore board
      await restoreBoard(pool, 88001, bId);
      const [biRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biId]);
      assert.strictEqual(biRes[0].deleted_at, null, 'Board item must be restored');
      assert.strictEqual(biRes[0].cascade_deleted_by, null, 'Board item cascade marker must be cleared');

      console.log('  ✅ PASSED: A4. Board items restored consistently with parent board');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A4:', err);
      throw err;
    }

    // TEST A5: Note/Task merely projected onto Board is NOT accidentally soft-deleted as an entity
    totalTests++;
    try {
      console.log('\n[Test A5: Projected note card: board_items goes to Trash, canonical entity stays active]');
      const bId = 88240;
      const noteEid = 880041;
      const noteDomainId = 88401;
      const biProjectedId = 88341;

      await conn.query(`
        INSERT INTO boards (id, project_id, user_id, title) VALUES (?, 88010, 88001, 'Board A5')
      `, [bId]);

      // Canonical note entity
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-note-88401', 'note', ?, 88001, 88010, 'Canonical Projected Note')
      `, [noteEid, noteDomainId]);

      // Projected board item pointing to note
      await conn.query(`
        INSERT INTO board_items (id, board_id, user_id, item_type, reference_type, reference_id, title, position_x, position_y)
        VALUES (?, ?, 88001, 'note', 'note', ?, 'Projected Note Card', 50, 50)
      `, [biProjectedId, bId, noteDomainId]);

      // Soft delete board
      await deleteBoard(pool, 88001, bId);

      // Verify board_items projection row went to trash
      const [biDel] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biProjectedId]);
      assert(biDel[0].deleted_at !== null, 'Projection board item must be in Trash');

      // Canonical note entity MUST REMAIN ACTIVE
      const [eNote] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [noteEid]);
      assert.strictEqual(eNote[0].deleted_at, null, 'Canonical Note entity MUST NOT be soft-deleted when board is deleted');
      assert.strictEqual(eNote[0].cascade_deleted_by, null);

      // Restore board
      await restoreBoard(pool, 88001, bId);

      const [biRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biProjectedId]);
      assert.strictEqual(biRes[0].deleted_at, null, 'Projection board item restored');
      assert.strictEqual(biRes[0].cascade_deleted_by, null);

      const [eNoteAfter] = await conn.query('SELECT deleted_at FROM entities WHERE id = ?', [noteEid]);
      assert.strictEqual(eNoteAfter[0].deleted_at, null, 'Canonical Note entity remains active');

      console.log('  ✅ PASSED: A5. Projected note card soft-deleted in board_items only; canonical entity remains active');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A5:', err);
      throw err;
    }

    // TEST A6: Independently trashed Board Items remain trashed
    totalTests++;
    try {
      console.log('\n[Test A6: Independently trashed board item remains trashed]');
      const bId = 88250;
      const biActive = 88351;
      const biIndep = 88352;

      await conn.query(`
        INSERT INTO boards (id, project_id, user_id, title) VALUES (?, 88010, 88001, 'Board A6')
      `, [bId]);

      await conn.query(`
        INSERT INTO board_items (id, board_id, user_id, item_type, title, position_x, position_y) VALUES
        (?, ?, 88001, 'note', 'Active Item', 0, 0),
        (?, ?, 88001, 'note', 'Independently Trashed Item', 10, 10)
      `, [biActive, bId, biIndep, bId]);

      // Soft delete biIndep independently
      const indepTs = new Date('2026-09-01T10:00:00Z');
      await conn.query('UPDATE board_items SET deleted_at = ?, cascade_deleted_by = NULL WHERE id = ?', [indepTs, biIndep]);

      // Soft delete board
      await deleteBoard(pool, 88001, bId);

      // Verify biIndep was NOT overwritten with cascade marker
      const [biIndepDel] = await conn.query('SELECT cascade_deleted_by FROM board_items WHERE id = ?', [biIndep]);
      assert.strictEqual(biIndepDel[0].cascade_deleted_by, null);

      // Restore board
      await restoreBoard(pool, 88001, bId);

      const [biActiveRes] = await conn.query('SELECT deleted_at FROM board_items WHERE id = ?', [biActive]);
      const [biIndepRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biIndep]);
      assert.strictEqual(biActiveRes[0].deleted_at, null, 'Active item restored');
      assert(biIndepRes[0].deleted_at !== null, 'Independently deleted item remains in Trash');
      assert.strictEqual(biIndepRes[0].cascade_deleted_by, null);

      console.log('  ✅ PASSED: A6. Independently trashed board items remain trashed');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A6:', err);
      throw err;
    }

    // TEST A7: Restoring one Board does not accidentally restore unrelated descendants
    totalTests++;
    try {
      console.log('\n[Test A7: Isolation between unrelated boards]');
      const p1 = 88260, c1 = 88261;
      const p2 = 88270, c2 = 88271;

      await conn.query(`
        INSERT INTO boards (id, project_id, parent_board_id, user_id, title) VALUES
        (?, 88010, NULL, 88001, 'Board Tree 1 Root'),
        (?, 88010, ?, 88001, 'Board Tree 1 Child'),
        (?, 88010, NULL, 88001, 'Board Tree 2 Root'),
        (?, 88010, ?, 88001, 'Board Tree 2 Child')
      `, [p1, c1, p1, p2, c2, p2]);

      await deleteBoard(pool, 88001, p1);
      await deleteBoard(pool, 88001, p2);

      // Restore only p1
      await restoreBoard(pool, 88001, p1);

      const [tree1] = await conn.query('SELECT id, deleted_at FROM boards WHERE id IN (?, ?)', [p1, c1]);
      const [tree2] = await conn.query('SELECT id, deleted_at FROM boards WHERE id IN (?, ?)', [p2, c2]);

      assert(tree1.every(r => r.deleted_at === null), 'Tree 1 must be restored');
      assert(tree2.every(r => r.deleted_at !== null), 'Tree 2 must remain in Trash');

      console.log('  ✅ PASSED: A7. Restoring Tree 1 leaves unrelated Tree 2 in Trash');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A7:', err);
      throw err;
    }

    // TEST A8: Authorization is enforced
    totalTests++;
    try {
      console.log('\n[Test A8: Authorization enforcement on boards]');
      const bId = 88280;
      const cId = 88281;

      await conn.query(`
        INSERT INTO boards (id, project_id, parent_board_id, user_id, title) VALUES
        (?, 88010, NULL, 88001, 'Board A8 Parent'),
        (?, 88010, ?, 88001, 'Board A8 Child')
      `, [bId, cId, bId]);

      // Unauthorized user (88002 is viewer) attempts delete
      let unauthorizedDelThrown = false;
      try {
        await deleteBoard(pool, 88002, bId);
      } catch (e) {
        unauthorizedDelThrown = true;
        assert.strictEqual(e.message, 'NOT_FOUND_OR_FORBIDDEN');
      }
      assert(unauthorizedDelThrown, 'Unauthorized delete must throw NOT_FOUND_OR_FORBIDDEN');

      // Board must still be active
      const [bCheck] = await conn.query('SELECT deleted_at FROM boards WHERE id = ?', [bId]);
      assert.strictEqual(bCheck[0].deleted_at, null);

      // Owner deletes board
      await deleteBoard(pool, 88001, bId);

      // Unauthorized user attempts restore
      let unauthorizedResThrown = false;
      try {
        await restoreBoard(pool, 88002, bId);
      } catch (e) {
        unauthorizedResThrown = true;
        assert.strictEqual(e.message, 'NOT_FOUND_OR_FORBIDDEN');
      }
      assert(unauthorizedResThrown, 'Unauthorized restore must throw NOT_FOUND_OR_FORBIDDEN');

      // Attempting to restore child while parent is still in trash
      let parentInTrashThrown = false;
      try {
        await restoreBoard(pool, 88001, cId);
      } catch (e) {
        parentInTrashThrown = true;
        assert.strictEqual(e.message, 'CANNOT_RESTORE_PARENT_IN_TRASH');
      }
      assert(parentInTrashThrown, 'Restoring child while parent in trash must throw CANNOT_RESTORE_PARENT_IN_TRASH');

      console.log('  ✅ PASSED: A8. Authorization and parent-in-trash guard strictly enforced');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A8:', err);
      throw err;
    }

    // TEST A9: Restoration runs correctly with a real connection pool containing multiple connections
    totalTests++;
    try {
      console.log('\n[Test A9: Multiple concurrent board restorations with pool of connections]');
      const bIds = [88291, 88292, 88293, 88294];

      for (const id of bIds) {
        await conn.query('INSERT INTO boards (id, project_id, user_id, title) VALUES (?, 88010, 88001, ?)', [id, 'Board ' + id]);
        await conn.query('INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title) VALUES (?, ?, "board", ?, 88001, 88010, ?)', [880000 + id, 'uuid-' + id, id, 'Board ' + id]);
        await deleteBoard(pool, 88001, id);
      }

      // Concurrently restore all 4 boards using Promise.all across pool
      await Promise.all(bIds.map(id => restoreBoard(pool, 88001, id)));

      const [resAll] = await conn.query('SELECT id, deleted_at FROM boards WHERE id IN (?)', [bIds]);
      assert.strictEqual(resAll.length, 4);
      assert(resAll.every(r => r.deleted_at === null), 'All concurrent board restorations succeeded');

      console.log('  ✅ PASSED: A9. Multi-connection pool concurrent board restorations completed cleanly');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED A9:', err);
      throw err;
    }

    console.log('\n--- PART B: RESEARCH DOCUMENT DELETION TESTS ---\n');

    // TEST B1: Authorized user can delete Research Document
    totalTests++;
    try {
      console.log('[Test B1: Authorized user can delete Research Document]');
      const docId = 88110;
      const docEid = 880110;

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B1', 'doc_b1.pdf', '/files/doc_b1.pdf', 'pdf', 1024)
      `, [docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88110', 'research', ?, 88001, 88010, 'Doc B1')
      `, [docEid, docId]);

      const res = await deleteResearchDoc(pool, 88001, docId);
      assert.strictEqual(res.success, true);

      const [docRows] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      assert(docRows[0].deleted_at !== null, 'research_documents.deleted_at must be set');

      console.log('  ✅ PASSED: B1. Authorized user deleted research document');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B1:', err);
      throw err;
    }

    // TEST B2: Document entity, domain record, and eligible excerpts remain consistent
    totalTests++;
    try {
      console.log('\n[Test B2: Document entity, excerpts, and board projection consistency]');
      const docId = 88120;
      const docEid = 880120;
      const xId = 88521;
      const xEid = 880521;
      const biId = 88321;
      const boardId = 88201; // Existing board from A1

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B2', 'doc_b2.pdf', '/files/doc_b2.pdf', 'pdf', 2048)
      `, [docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88120', 'research', ?, 88001, 88010, 'Doc B2')
      `, [docEid, docId]);

      await conn.query(`
        INSERT INTO research_excerpts (id, research_id, user_id, project_id, quoted_text, location_anchor)
        VALUES (?, ?, 88001, 88010, 'Excerpt Quote B2', 'p1')
      `, [xId, docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88521', 'excerpt', ?, 88001, 88010, 'Excerpt Quote B2')
      `, [xEid, xId]);

      await conn.query(`
        INSERT INTO board_items (id, board_id, user_id, item_type, reference_type, reference_id, title, position_x, position_y)
        VALUES (?, ?, 88001, 'research_ref', 'excerpt', ?, 'Projected Excerpt Card', 100, 100)
      `, [biId, boardId, xId]);

      // Soft delete
      await deleteResearchDoc(pool, 88001, docId);

      const [dRow] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      const [dERow] = await conn.query('SELECT deleted_at FROM entities WHERE id = ?', [docEid]);
      const [xRow] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM research_excerpts WHERE id = ?', [xId]);
      const [xERow] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [xEid]);
      const [biRow] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biId]);

      assert(dRow[0].deleted_at !== null, 'Doc must be soft-deleted');
      assert(dERow[0].deleted_at !== null, 'Doc entity must be soft-deleted');
      assert(xRow[0].deleted_at !== null, 'Excerpt must be soft-deleted');
      assert.strictEqual(xRow[0].cascade_deleted_by, docId, 'Excerpt cascade marker must equal docId');
      assert(xERow[0].deleted_at !== null, 'Excerpt entity must be soft-deleted');
      assert.strictEqual(xERow[0].cascade_deleted_by, docEid, 'Excerpt entity cascade marker must equal docEid');
      assert(biRow[0].deleted_at !== null, 'Board item projection must be soft-deleted');
      assert.strictEqual(biRow[0].cascade_deleted_by, docId, 'Board item projection cascade marker must equal docId');

      // Restore
      await restoreResearchDoc(pool, 88001, docId);

      const [dRes] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      const [dERes] = await conn.query('SELECT deleted_at FROM entities WHERE id = ?', [docEid]);
      const [xRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM research_excerpts WHERE id = ?', [xId]);
      const [xERes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [xEid]);
      const [biRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM board_items WHERE id = ?', [biId]);

      assert.strictEqual(dRes[0].deleted_at, null, 'Doc must be restored');
      assert.strictEqual(dERes[0].deleted_at, null, 'Doc entity must be restored');
      assert.strictEqual(xRes[0].deleted_at, null, 'Excerpt must be restored');
      assert.strictEqual(xRes[0].cascade_deleted_by, null, 'Excerpt cascade marker cleared');
      assert.strictEqual(xERes[0].deleted_at, null, 'Excerpt entity must be restored');
      assert.strictEqual(xERes[0].cascade_deleted_by, null, 'Excerpt entity cascade marker cleared');
      assert.strictEqual(biRes[0].deleted_at, null, 'Board item projection restored');
      assert.strictEqual(biRes[0].cascade_deleted_by, null, 'Board item cascade marker cleared');

      console.log('  ✅ PASSED: B2. Document, excerpt, entity, and board projection consistently deleted and restored');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B2:', err);
      throw err;
    }

    // TEST B3: Independently trashed excerpts remain trashed
    totalTests++;
    try {
      console.log('\n[Test B3: Independently trashed excerpt remains in Trash]');
      const docId = 88130;
      const docEid = 880130;
      const xActive = 88531;
      const xIndep = 88532;
      const xIndepEid = 880532;

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B3', 'doc_b3.pdf', '/files/doc_b3.pdf', 'pdf', 512)
      `, [docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88130', 'research', ?, 88001, 88010, 'Doc B3')
      `, [docEid, docId]);

      await conn.query(`
        INSERT INTO research_excerpts (id, research_id, user_id, project_id, quoted_text, location_anchor) VALUES
        (?, ?, 88001, 88010, 'Active Excerpt B3', 'p1'),
        (?, ?, 88001, 88010, 'Independently Trashed Excerpt B3', 'p2')
      `, [xActive, docId, xIndep, docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88532', 'excerpt', ?, 88001, 88010, 'Indep Excerpt')
      `, [xIndepEid, xIndep]);

      // Soft delete xIndep independently
      const indepTs = new Date('2026-08-15T09:00:00Z');
      await conn.query('UPDATE research_excerpts SET deleted_at = ?, cascade_deleted_by = NULL WHERE id = ?', [indepTs, xIndep]);
      await conn.query('UPDATE entities SET deleted_at = ?, cascade_deleted_by = NULL WHERE id = ?', [indepTs, xIndepEid]);

      // Delete document
      await deleteResearchDoc(pool, 88001, docId);

      // Verify xIndep was NOT marked with cascade_deleted_by = docId
      const [xIndepDel] = await conn.query('SELECT cascade_deleted_by FROM research_excerpts WHERE id = ?', [xIndep]);
      assert.strictEqual(xIndepDel[0].cascade_deleted_by, null);

      // Restore document
      await restoreResearchDoc(pool, 88001, docId);

      const [dRes] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      const [xActiveRes] = await conn.query('SELECT deleted_at FROM research_excerpts WHERE id = ?', [xActive]);
      const [xIndepRes] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM research_excerpts WHERE id = ?', [xIndep]);
      const [xIndepERes] = await conn.query('SELECT deleted_at FROM entities WHERE id = ?', [xIndepEid]);

      assert.strictEqual(dRes[0].deleted_at, null, 'Doc restored');
      assert.strictEqual(xActiveRes[0].deleted_at, null, 'Active excerpt restored');
      assert(xIndepRes[0].deleted_at !== null, 'Independently trashed excerpt must remain in Trash');
      assert.strictEqual(xIndepRes[0].cascade_deleted_by, null);
      assert(xIndepERes[0].deleted_at !== null, 'Independently trashed excerpt entity must remain in Trash');

      console.log('  ✅ PASSED: B3. Independently trashed excerpt remains in Trash after document restore');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B3:', err);
      throw err;
    }

    // TEST B4: Unauthorized user cannot delete the document
    totalTests++;
    try {
      console.log('\n[Test B4: Unauthorized user deletion rejection]');
      const docId = 88140;

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B4', 'doc_b4.pdf', '/files/doc_b4.pdf', 'pdf', 256)
      `, [docId]);

      let thrown = false;
      try {
        await deleteResearchDoc(pool, 88002, docId);
      } catch (e) {
        thrown = true;
        assert.strictEqual(e.message, 'NOT_FOUND_OR_FORBIDDEN');
      }
      assert(thrown, 'Unauthorized delete must throw NOT_FOUND_OR_FORBIDDEN');

      const [dCheck] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      assert.strictEqual(dCheck[0].deleted_at, null, 'Document must not be deleted');

      console.log('  ✅ PASSED: B4. Unauthorized user rejected and document left untouched');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B4:', err);
      throw err;
    }

    // TEST B5: A failed or unauthorized parent deletion does not modify child excerpts or entities
    totalTests++;
    try {
      console.log('\n[Test B5: Failed/unauthorized parent deletion does not modify children]');
      const docId = 88150;
      const xId = 88551;
      const xEid = 880551;

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B5', 'doc_b5.pdf', '/files/doc_b5.pdf', 'pdf', 256)
      `, [docId]);
      await conn.query(`
        INSERT INTO research_excerpts (id, research_id, user_id, project_id, quoted_text, location_anchor)
        VALUES (?, ?, 88001, 88010, 'Excerpt B5', 'p1')
      `, [xId, docId]);
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title)
        VALUES (?, 'uuid-88551', 'excerpt', ?, 88001, 88010, 'Excerpt B5')
      `, [xEid, xId]);

      try {
        await deleteResearchDoc(pool, 88002, docId);
      } catch {}

      const [xCheck] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM research_excerpts WHERE id = ?', [xId]);
      const [xeCheck] = await conn.query('SELECT deleted_at, cascade_deleted_by FROM entities WHERE id = ?', [xEid]);

      assert.strictEqual(xCheck[0].deleted_at, null);
      assert.strictEqual(xCheck[0].cascade_deleted_by, null);
      assert.strictEqual(xeCheck[0].deleted_at, null);
      assert.strictEqual(xeCheck[0].cascade_deleted_by, null);

      console.log('  ✅ PASSED: B5. Child excerpts and entities untouched after unauthorized parent deletion attempt');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B5:', err);
      throw err;
    }

    // TEST B6: Implementation checks parent's affectedRows before changing dependent records
    totalTests++;
    try {
      console.log('\n[Test B6: affectedRows validation on non-existent document]');
      let thrown = false;
      try {
        await deleteResearchDoc(pool, 88001, 999999);
      } catch (e) {
        thrown = true;
        assert.strictEqual(e.message, 'NOT_FOUND_OR_FORBIDDEN');
      }
      assert(thrown, 'Must throw NOT_FOUND_OR_FORBIDDEN when parent has affectedRows !== 1');

      console.log('  ✅ PASSED: B6. Parent affectedRows checked immediately, halting execution on zero matches');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B6:', err);
      throw err;
    }

    // TEST B7: Transaction rollback preserves database consistency when an operation fails
    totalTests++;
    try {
      console.log('\n[Test B7: Transaction rollback consistency on error]');
      const docId = 88170;
      const docEid = 880170;
      const xId = 88571;

      await conn.query(`
        INSERT INTO research_documents (id, user_id, project_id, title, original_filename, file_path, file_type, file_size)
        VALUES (?, 88001, 88010, 'Doc B7', 'doc_b7.pdf', '/files/doc_b7.pdf', 'pdf', 128)
      `, [docId]);
      // Canonical entity is intentionally NOT created in active state (e.g. already deleted),
      // which causes line 33 of researchService: if (pe.affectedRows !== 1) throw new Error('ENTITY_DOMAIN_MISMATCH')
      await conn.query(`
        INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, deleted_at)
        VALUES (?, 'uuid-88170', 'research', ?, 88001, 88010, 'Doc B7', '2026-01-01 00:00:00')
      `, [docEid, docId]);
      await conn.query(`
        INSERT INTO research_excerpts (id, research_id, user_id, project_id, quoted_text, location_anchor)
        VALUES (?, ?, 88001, 88010, 'Excerpt B7', 'p1')
      `, [xId, docId]);

      let errorThrown = false;
      try {
        await deleteResearchDoc(pool, 88001, docId);
      } catch (e) {
        errorThrown = true;
        assert.strictEqual(e.message, 'ENTITY_DOMAIN_MISMATCH');
      }
      assert(errorThrown, 'Must throw ENTITY_DOMAIN_MISMATCH when entity desync detected');

      // Verify that research_documents was rolled back to deleted_at = NULL!
      const [dCheck] = await conn.query('SELECT deleted_at FROM research_documents WHERE id = ?', [docId]);
      assert.strictEqual(dCheck[0].deleted_at, null, 'Parent doc MUST be rolled back to deleted_at = NULL');

      const [xCheck] = await conn.query('SELECT deleted_at FROM research_excerpts WHERE id = ?', [xId]);
      assert.strictEqual(xCheck[0].deleted_at, null, 'Child excerpt MUST be rolled back to deleted_at = NULL');

      console.log('  ✅ PASSED: B7. Transaction rollback reverted all mutations when error was thrown');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B7:', err);
      throw err;
    }

    // TEST B8: Connection is destroyed and not returned to pool if rollback itself fails
    totalTests++;
    try {
      console.log('\n[Test B8: Connection destroyed if rollback fails]');
      // We test the service catch block behavior by verifying destroy vs release
      let destroyed = false;
      let released = false;

      const mockConn = {
        beginTransaction: async () => {},
        query: async (sql) => {
          if (/UPDATE research_documents/i.test(sql)) {
            return [{ affectedRows: 1 }];
          }
          if (/SELECT id AS eid/i.test(sql)) {
            return [[{ eid: 123 }]];
          }
          if (/UPDATE entities/i.test(sql)) {
            throw new Error('Induced DB error inside transaction');
          }
          return [[]];
        },
        rollback: async () => {
          throw new Error('Fatal socket failure during rollback');
        },
        destroy: () => {
          destroyed = true;
        },
        release: () => {
          released = true;
        }
      };

      const testPool = {
        getConnection: async () => mockConn
      };

      let errSurfaced = null;
      try {
        await deleteResearchDoc(testPool, 88001, 88110);
      } catch (e) {
        errSurfaced = e;
      }

      assert(errSurfaced !== null, 'Original error must be surfaced');
      assert.strictEqual(errSurfaced.message, 'Induced DB error inside transaction');
      assert.strictEqual(destroyed, true, 'Corrupted connection MUST be destroyed');
      assert.strictEqual(released, false, 'Corrupted connection MUST NOT be released back to pool');

      console.log('  ✅ PASSED: B8. Broken connection destroyed and quarantined when rollback fails');
      passedTests++;
    } catch (err) {
      console.error('  ❌ FAILED B8:', err);
      throw err;
    }

    console.log('\n================================================================');
    console.log(`  🎉 ALL REAL MYSQL INTEGRATION TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Cleaning up verification fixtures...');
    await cleanupFixtures(pool);
    console.log('[Cleanup] Done. Task-owned fixtures safely removed.');
    conn.release();
    await pool.end();
  }
}

runTests().catch(err => {
  console.error('\n❌ REAL MYSQL INTEGRATION SUITE ERROR:', err);
  process.exit(1);
});
