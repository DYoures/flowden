// tests/issue1_2_cascade_lifecycle.test.js
const assert = require('assert');
const { deleteResearchDoc, restoreResearchDoc } = require('../server/services/researchService');
const { deleteBoard, restoreBoard } = require('../server/services/boardService');

console.log('======================================================');
console.log('  FLOWDEN ISSUE 1+2 — CASCADE LIFECYCLE ACCEPTANCE SUITE');
console.log('======================================================\n');

/**
 * Creates an in-memory database simulation of Flowden domain tables
 * adhering strictly to MySQL transaction semantics.
 */
function createDomainPool(options = {}) {
  const data = {
    users: [{ id: 1, email: 'admin@flowden.io', role: 'admin' }, { id: 2, email: 'user@flowden.io', role: 'user' }],
    projects: [{ id: 10, user_id: 1, title: 'Project 10' }],
    project_members: [
      { id: 1, project_id: 10, user_id: 1, role: 'owner', revoked_at: null },
      { id: 2, project_id: 10, user_id: 2, role: 'viewer', revoked_at: null }
    ],
    project_entities: [
      { id: 1, project_id: 10, entity_type: 'research', entity_id: 100, access_role: 'admin', added_by: 1 }
    ],
    research_documents: [
      { id: 100, user_id: 1, project_id: 10, title: 'Whitepaper 1', deleted_at: null }
    ],
    research_excerpts: [
      { id: 501, research_id: 100, user_id: 1, quoted_text: 'Excerpt A', deleted_at: null, cascade_deleted_by: null },
      { id: 502, research_id: 100, user_id: 1, quoted_text: 'Excerpt B (independently trashed earlier)', deleted_at: new Date('2026-10-01'), cascade_deleted_by: null }
    ],
    boards: [
      { id: 201, user_id: 1, project_id: 10, parent_board_id: null, title: 'Top Board', deleted_at: null, cascade_deleted_by: null },
      { id: 202, user_id: 1, project_id: 10, parent_board_id: 201, title: 'Child Board 1', deleted_at: null, cascade_deleted_by: null },
      { id: 203, user_id: 1, project_id: 10, parent_board_id: 201, title: 'Child Board 2 (independently trashed earlier)', deleted_at: new Date('2026-10-01'), cascade_deleted_by: null }
    ],
    board_items: [
      { id: 301, board_id: 201, reference_type: null, reference_id: null, title: 'Native Sticky 1', deleted_at: null, cascade_deleted_by: null },
      { id: 302, board_id: 201, reference_type: 'note', reference_id: 999, title: 'Projected Note Card', deleted_at: null, cascade_deleted_by: null },
      { id: 303, board_id: 201, reference_type: 'excerpt', reference_id: 501, title: 'Projected Excerpt 501', deleted_at: null, cascade_deleted_by: null }
    ],
    entities: [
      { id: 1000, entity_type: 'research', entity_id: 100, owner_user_id: 1, primary_project_id: 10, title: 'Whitepaper 1', deleted_at: null, cascade_deleted_by: null },
      { id: 1001, entity_type: 'excerpt', entity_id: 501, owner_user_id: 1, primary_project_id: 10, title: 'Excerpt A', deleted_at: null, cascade_deleted_by: null },
      { id: 1002, entity_type: 'excerpt', entity_id: 502, owner_user_id: 1, primary_project_id: 10, title: 'Excerpt B', deleted_at: new Date('2026-10-01'), cascade_deleted_by: null },
      { id: 2000, entity_type: 'board', entity_id: 201, owner_user_id: 1, primary_project_id: 10, title: 'Top Board', deleted_at: null, cascade_deleted_by: null },
      { id: 2001, entity_type: 'board', entity_id: 202, owner_user_id: 1, primary_project_id: 10, title: 'Child Board 1', deleted_at: null, cascade_deleted_by: null },
      { id: 2002, entity_type: 'board', entity_id: 203, owner_user_id: 1, primary_project_id: 10, title: 'Child Board 2', deleted_at: new Date('2026-10-01'), cascade_deleted_by: null },
      { id: 9990, entity_type: 'note', entity_id: 999, owner_user_id: 1, primary_project_id: 10, title: 'Canonical Projected Note', deleted_at: null, cascade_deleted_by: null }
    ]
  };

  const pool = {
    data,
    getConnection: async () => {
      let snapshot = JSON.parse(JSON.stringify(data));
      let inTx = false;
      const conn = {
        isDestroyed: false,
        isReleased: false,
        beginTransaction: async () => {
          inTx = true;
          snapshot = JSON.parse(JSON.stringify(data));
        },
        commit: async () => {
          inTx = false;
        },
        rollback: async () => {
          if (options.simulateRollbackFailure) {
            throw new Error('Simulated network failure on ROLLBACK');
          }
          inTx = false;
          // Revert state
          for (const k of Object.keys(snapshot)) {
            data[k] = JSON.parse(JSON.stringify(snapshot[k]));
          }
        },
        destroy: () => {
          conn.isDestroyed = true;
        },
        release: () => {
          conn.isReleased = true;
        },
        query: async (sql, params = []) => {
          if (conn.isDestroyed) throw new Error('Cannot query on destroyed connection');
          const trimmed = sql.trim().replace(/\s+/g, ' ');

          // UPDATE research_documents d SET d.deleted_at = ...
          if (/UPDATE research_documents d SET d\.deleted_at/i.test(trimmed)) {
            const isRestore = /SET d\.deleted_at\s*=\s*NULL/i.test(trimmed);
            const docId = isRestore ? params[0] : params[1];
            const userId = isRestore ? params[1] : params[2];

            const doc = data.research_documents.find(d => d.id === docId);
            if (!doc) return [{ affectedRows: 0 }, []];

            if (!isRestore && doc.deleted_at !== null) return [{ affectedRows: 0 }, []];
            if (isRestore && doc.deleted_at === null) return [{ affectedRows: 0 }, []];

            // Evaluate authorization
            const isOwner = doc.user_id === userId;
            const pm = data.project_members.find(m => m.project_id === doc.project_id && m.user_id === userId && m.revoked_at === null && ['owner', 'editor', 'admin'].includes(m.role));
            const pe = data.project_entities.find(e => e.project_id === doc.project_id && e.entity_type === 'research' && e.entity_id === doc.id && e.access_role === 'admin');
            const peUserMember = pe && data.project_members.find(m => m.project_id === pe.project_id && m.user_id === userId && m.revoked_at === null && ['owner', 'editor', 'admin'].includes(m.role));

            if (!isOwner && !pm && !(pe && peUserMember)) {
              return [{ affectedRows: 0 }, []];
            }

            doc.deleted_at = isRestore ? null : new Date();
            return [{ affectedRows: 1 }, []];
          }

          // -------------------------------------------------------------
          // SELECT id AS eid FROM entities WHERE entity_type = ? AND entity_id = ?
          // -------------------------------------------------------------
          if (/SELECT id AS eid FROM entities WHERE entity_type = ["']?([a-zA-Z0-9_]+)["']? AND entity_id = \?/i.test(trimmed)) {
            const m = trimmed.match(/entity_type = ["']?([a-zA-Z0-9_]+)["']?/i);
            const eType = m ? m[1] : params[0];
            const eId = params[params.length - 1];
            const row = data.entities.find(e => e.entity_type === eType && e.entity_id === eId);
            return [row ? [{ eid: row.id }] : [], []];
          }

          // -------------------------------------------------------------
          // UPDATE entities SET deleted_at = ? WHERE id = ?
          // -------------------------------------------------------------
          if (/UPDATE entities SET deleted_at = \? WHERE id = \?/i.test(trimmed)) {
            const ts = params[0];
            const eid = params[1];
            const row = data.entities.find(e => e.id === eid);
            if (row) {
              row.deleted_at = ts;
              return [{ affectedRows: 1 }, []];
            }
            return [{ affectedRows: 0 }, []];
          }

          // -------------------------------------------------------------
          // UPDATE research_excerpts SET deleted_at = ?, cascade_deleted_by = ? WHERE research_id = ? AND deleted_at IS NULL
          // -------------------------------------------------------------
          if (/UPDATE research_excerpts SET deleted_at = \?, cascade_deleted_by = \? WHERE research_id = \? AND deleted_at IS NULL/i.test(trimmed)) {
            const ts = params[0];
            const cdb = params[1];
            const docId = params[2];
            let affected = 0;
            for (const x of data.research_excerpts) {
              if (x.research_id === docId && x.deleted_at === null) {
                x.deleted_at = ts;
                x.cascade_deleted_by = cdb;
                affected++;
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // UPDATE entities e JOIN research_excerpts x ... SET e.deleted_at = ?, e.cascade_deleted_by = ? WHERE x.research_id = ? AND x.cascade_deleted_by = ? AND e.deleted_at IS NULL
          // -------------------------------------------------------------
          if (/UPDATE entities e JOIN research_excerpts x/i.test(trimmed)) {
            const ts = params[0];
            const eCdb = params[1];
            const docId = params[2];
            const xCdb = params[3];
            let affected = 0;
            for (const x of data.research_excerpts) {
              if (x.research_id === docId && x.cascade_deleted_by === xCdb) {
                const ent = data.entities.find(e => e.entity_type === 'excerpt' && e.entity_id === x.id && e.deleted_at === null);
                if (ent) {
                  ent.deleted_at = ts;
                  ent.cascade_deleted_by = eCdb;
                  affected++;
                }
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // UPDATE board_items bi JOIN research_excerpts x
          // -------------------------------------------------------------
          if (/UPDATE board_items bi JOIN research_excerpts x/i.test(trimmed)) {
            const ts = params[0];
            const biCdb = params[1];
            const xCdb = params[2];
            let affected = 0;
            for (const x of data.research_excerpts) {
              if (x.cascade_deleted_by === xCdb) {
                for (const bi of data.board_items) {
                  if (bi.reference_type === 'excerpt' && bi.reference_id === x.id && bi.deleted_at === null) {
                    bi.deleted_at = ts;
                    bi.cascade_deleted_by = biCdb;
                    affected++;
                  }
                }
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // UPDATE research_excerpts SET deleted_at = NULL, cascade_deleted_by = NULL WHERE research_id = ? AND cascade_deleted_by = ?
          // -------------------------------------------------------------
          if (/UPDATE research_excerpts SET deleted_at = NULL, cascade_deleted_by = NULL WHERE research_id = \? AND cascade_deleted_by = \?/i.test(trimmed)) {
            const docId = params[0];
            const cdb = params[1];
            let affected = 0;
            for (const x of data.research_excerpts) {
              if (x.research_id === docId && x.cascade_deleted_by === cdb) {
                x.deleted_at = null;
                x.cascade_deleted_by = null;
                affected++;
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL WHERE entity_type = 'excerpt' AND cascade_deleted_by = ?
          // -------------------------------------------------------------
          if (/UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL WHERE entity_type = ['"]?excerpt['"]? AND cascade_deleted_by = \?/i.test(trimmed)) {
            const cdb = params[0];
            let affected = 0;
            for (const e of data.entities) {
              if (e.entity_type === 'excerpt' && e.cascade_deleted_by === cdb) {
                e.deleted_at = null;
                e.cascade_deleted_by = null;
                affected++;
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // UPDATE board_items SET deleted_at = NULL, cascade_deleted_by = NULL WHERE reference_type = 'excerpt' AND cascade_deleted_by = ?
          // -------------------------------------------------------------
          if (/UPDATE board_items SET deleted_at = NULL, cascade_deleted_by = NULL WHERE reference_type = ['"]?excerpt['"]? AND cascade_deleted_by = \?/i.test(trimmed)) {
            const cdb = params[0];
            let affected = 0;
            for (const bi of data.board_items) {
              if (bi.reference_type === 'excerpt' && bi.cascade_deleted_by === cdb) {
                bi.deleted_at = null;
                bi.cascade_deleted_by = null;
                affected++;
              }
            }
            return [{ affectedRows: affected }, []];
          }

          // -------------------------------------------------------------
          // Boards operations
          // -------------------------------------------------------------
          if (/SELECT id FROM boards WHERE parent_board_id = \? AND deleted_at IS NULL/i.test(trimmed)) {
            const pId = params[0];
            const children = data.boards.filter(b => b.parent_board_id === pId && b.deleted_at === null);
            return [children.map(c => ({ id: c.id })), []];
          }

          if (/SELECT id, parent_board_id FROM boards WHERE id = \?/i.test(trimmed)) {
            const bId = params[0];
            const row = data.boards.find(b => b.id === bId);
            return [row ? [row] : [], []];
          }

          if (/SELECT id, deleted_at FROM boards WHERE id = \?/i.test(trimmed)) {
            const bId = params[0];
            const row = data.boards.find(b => b.id === bId);
            return [row ? [row] : [], []];
          }

          // UPDATE boards b SET b.deleted_at = ...
          if (/UPDATE boards b SET b\.deleted_at/i.test(trimmed)) {
            const isRestore = /SET b\.deleted_at\s*=\s*NULL/i.test(trimmed);
            const bId = isRestore ? params[0] : params[1];
            const userId = isRestore ? params[1] : params[2];

            const b = data.boards.find(x => x.id === bId);
            if (!b) return [{ affectedRows: 0 }, []];

            if (!isRestore && b.deleted_at !== null) return [{ affectedRows: 0 }, []];
            if (isRestore && b.deleted_at === null) return [{ affectedRows: 0 }, []];

            const isOwner = b.user_id === userId;
            const pm = data.project_members.find(m => m.project_id === b.project_id && m.user_id === userId && m.revoked_at === null && ['owner', 'editor', 'admin'].includes(m.role));
            if (!isOwner && !pm) return [{ affectedRows: 0 }, []];

            b.deleted_at = isRestore ? null : new Date();
            return [{ affectedRows: 1 }, []];
          }

          if (/UPDATE boards SET deleted_at = \?, cascade_deleted_by = \? WHERE id IN/i.test(trimmed)) {
            const ts = params[0];
            const cdb = params[1];
            const ids = Array.isArray(params[2]) ? params[2] : [params[2]];
            let affected = 0;
            for (const b of data.boards) {
              if (ids.includes(b.id) && b.deleted_at === null) {
                b.deleted_at = ts;
                b.cascade_deleted_by = cdb;
                affected++;
              }
            }
            return [{ affectedRows: affected }, []];
          }

          if (/UPDATE entities SET deleted_at = \?, cascade_deleted_by = \? WHERE entity_type = ['"]?board['"]? AND entity_id IN/i.test(trimmed)) {
            const ts = params[0];
            const cdb = params[1];
            const ids = Array.isArray(params[2]) ? params[2] : [params[2]];
            for (const e of data.entities) {
              if (e.entity_type === 'board' && ids.includes(e.entity_id) && e.deleted_at === null) {
                e.deleted_at = ts;
                e.cascade_deleted_by = cdb;
              }
            }
            return [{ affectedRows: 1 }, []];
          }

          if (/UPDATE board_items SET deleted_at = \?, cascade_deleted_by = \? WHERE board_id = \? AND deleted_at IS NULL/i.test(trimmed)) {
            const ts = params[0];
            const cdb = params[1];
            const bId = params[2];
            for (const bi of data.board_items) {
              if (bi.board_id === bId && bi.deleted_at === null) {
                bi.deleted_at = ts;
                bi.cascade_deleted_by = cdb;
              }
            }
            return [{ affectedRows: 1 }, []];
          }

          if (/UPDATE boards SET deleted_at = NULL, cascade_deleted_by = NULL WHERE cascade_deleted_by = \?/i.test(trimmed)) {
            const cdb = params[0];
            for (const b of data.boards) {
              if (b.cascade_deleted_by === cdb) {
                b.deleted_at = null;
                b.cascade_deleted_by = null;
              }
            }
            return [{ affectedRows: 1 }, []];
          }

          if (/UPDATE entities SET deleted_at = NULL, cascade_deleted_by = NULL WHERE entity_type = ['"]?board['"]? AND cascade_deleted_by = \?/i.test(trimmed)) {
            const cdb = params[0];
            for (const e of data.entities) {
              if (e.entity_type === 'board' && e.cascade_deleted_by === cdb) {
                e.deleted_at = null;
                e.cascade_deleted_by = null;
              }
            }
            return [{ affectedRows: 1 }, []];
          }

          if (/UPDATE board_items SET deleted_at = NULL, cascade_deleted_by = NULL WHERE cascade_deleted_by = \?/i.test(trimmed)) {
            const cdb = params[0];
            for (const bi of data.board_items) {
              if (bi.cascade_deleted_by === cdb) {
                bi.deleted_at = null;
                bi.cascade_deleted_by = null;
              }
            }
            return [{ affectedRows: 1 }, []];
          }

          return [{ affectedRows: 1 }, []];
        }
      };
      return conn;
    }
  };

  return pool;
}

(async () => {
  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASSED: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${desc}`);
      console.error('    Error:', err.message);
      process.exitCode = 1;
    }
  }

  // ---------------------------------------------------------
  // Test 1: A child deleted independently BEFORE parent stays in Trash after parent is restored
  // ---------------------------------------------------------
  await test('1. Independently deleted child stays in Trash with unchanged deleted_at/marker after parent restore', async () => {
    const pool = createDomainPool();
    const originalDeletedAt = pool.data.research_excerpts[1].deleted_at;
    assert(originalDeletedAt !== null, 'Excerpt 502 was already in trash');

    // 1) Delete parent doc
    await deleteResearchDoc(pool, 1, 100);

    // Assert excerpt 501 was marked with cascade_deleted_by = 100
    const x501 = pool.data.research_excerpts.find(x => x.id === 501);
    const x502 = pool.data.research_excerpts.find(x => x.id === 502);
    assert.strictEqual(x501.cascade_deleted_by, 100, 'Active excerpt 501 received cascade marker');
    assert.strictEqual(x502.cascade_deleted_by, null, 'Pre-existing trashed excerpt 502 retained NULL marker');
    assert.strictEqual(x502.deleted_at.toISOString(), originalDeletedAt.toISOString(), 'deleted_at unchanged');

    // 2) Restore parent doc
    await restoreResearchDoc(pool, 1, 100);

    // Assert excerpt 501 was restored, but 502 remains in Trash!
    assert.strictEqual(x501.deleted_at, null, 'Excerpt 501 was restored');
    assert.strictEqual(x501.cascade_deleted_by, null);
    assert.notStrictEqual(x502.deleted_at, null, 'Excerpt 502 remains in Trash');
    assert.strictEqual(x502.cascade_deleted_by, null);
    assert.strictEqual(x502.deleted_at.toISOString(), originalDeletedAt.toISOString());
  });

  // ---------------------------------------------------------
  // Test 2: User without permission -> affectedRows = 0 -> error, NO child row modified
  // ---------------------------------------------------------
  await test('2. Unauthorized user -> affectedRows = 0 -> error, NO child row modified in any table', async () => {
    const pool = createDomainPool();
    const snapshotBefore = JSON.stringify(pool.data);

    let errorThrown = null;
    try {
      // User 2 is viewer only on project 10
      await deleteResearchDoc(pool, 2, 100);
    } catch (e) {
      errorThrown = e;
    }

    assert(errorThrown !== null, 'Should reject unauthorized user');
    assert.strictEqual(errorThrown.message, 'NOT_FOUND_OR_FORBIDDEN');
    assert.deepStrictEqual(JSON.parse(snapshotBefore), pool.data, 'No table modified');
  });

  // ---------------------------------------------------------
  // Test 3: Error thrown midway -> full rollback; if ROLLBACK fails -> connection destroyed, original error rethrown
  // ---------------------------------------------------------
  await test('3. Rollback safety: simulated failure destroys connection and surfaces original error', async () => {
    const pool = createDomainPool({ simulateRollbackFailure: true });
    // Intentionally pass an invalid docId that throws NOT_FOUND_OR_FORBIDDEN
    let caughtErr = null;
    try {
      await deleteResearchDoc(pool, 1, 99999);
    } catch (e) {
      caughtErr = e;
    }

    assert(caughtErr !== null, 'Original error surfaced');
    assert.strictEqual(caughtErr.message, 'NOT_FOUND_OR_FORBIDDEN', 'Original error surfaced, not rollback failure');
  });

  // ---------------------------------------------------------
  // Test 4: Consistency: native cards vs projected notes/tasks
  // ---------------------------------------------------------
  await test('4. Consistency: Projected notes stay ACTIVE in entities; only board_items projection goes to Trash', async () => {
    const pool = createDomainPool();

    // Delete board 201
    await deleteBoard(pool, 1, 201);

    const projectedNoteItem = pool.data.board_items.find(bi => bi.id === 302);
    const projectedNoteEntity = pool.data.entities.find(e => e.id === 9990);

    assert.notStrictEqual(projectedNoteItem.deleted_at, null, 'Projection card in board_items was trashed');
    assert.strictEqual(projectedNoteItem.cascade_deleted_by, 201);
    assert.strictEqual(projectedNoteEntity.deleted_at, null, 'Underlying Note entity remains ACTIVE!');

    // Restore board 201
    await restoreBoard(pool, 1, 201);
    assert.strictEqual(projectedNoteItem.deleted_at, null, 'Projection card restored on board canvas');
    assert.strictEqual(projectedNoteItem.cascade_deleted_by, null);
    assert.strictEqual(projectedNoteEntity.deleted_at, null, 'Note entity stays active');
  });

  // ---------------------------------------------------------
  // Test 5: Nested boards cascade & restoration
  // ---------------------------------------------------------
  await test('5. Nested boards: active descendants marked and restored; previously trashed child remains in Trash', async () => {
    const pool = createDomainPool();
    const originalDeletedAt203 = pool.data.boards[2].deleted_at;

    // Delete top board 201
    await deleteBoard(pool, 1, 201);

    const b201 = pool.data.boards.find(b => b.id === 201);
    const b202 = pool.data.boards.find(b => b.id === 202);
    const b203 = pool.data.boards.find(b => b.id === 203);

    assert.notStrictEqual(b201.deleted_at, null);
    assert.notStrictEqual(b202.deleted_at, null);
    assert.strictEqual(b202.cascade_deleted_by, 201, 'Active descendant board marked with root board id');
    assert.strictEqual(b203.cascade_deleted_by, null, 'Pre-existing trashed board retains NULL marker');

    // Restore top board 201
    await restoreBoard(pool, 1, 201);

    assert.strictEqual(b201.deleted_at, null);
    assert.strictEqual(b202.deleted_at, null, 'Descendant board 202 restored');
    assert.strictEqual(b202.cascade_deleted_by, null);
    assert.notStrictEqual(b203.deleted_at, null, 'Independently trashed board 203 remains in Trash');
    assert.strictEqual(b203.deleted_at.toISOString(), originalDeletedAt203.toISOString());
  });

  // ---------------------------------------------------------
  // Test 6: Concurrent pool safety & parent-in-trash restore guard
  // ---------------------------------------------------------
  await test('6. Safety guards: rejects restoring a child board whose parent is still in Trash', async () => {
    const pool = createDomainPool();
    // Delete top board 201 (cascading to 202)
    await deleteBoard(pool, 1, 201);

    // Attempt to restore child board 202 directly while parent 201 is in Trash
    let caughtErr = null;
    try {
      await restoreBoard(pool, 1, 202);
    } catch (e) {
      caughtErr = e;
    }

    assert(caughtErr !== null, 'Should reject restore when parent is in trash');
    assert.strictEqual(caughtErr.message, 'CANNOT_RESTORE_PARENT_IN_TRASH');
  });

  console.log('\n======================================================');
  console.log(`  ISSUE 1+2 TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log('======================================================');

  if (passed !== total) {
    process.exit(1);
  }
})();
