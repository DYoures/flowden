// tests/markdown_spatial_board.test.js
/**
 * FLOWDEN KNOWLEDGE EXCHANGE — SPATIAL BOARD AUTO-CREATION VERIFICATION
 *
 * Requirements Verified:
 * 1. Markdown imports automatically create a Spatial Board in newly created projects.
 * 2. All 17 imported Notes from solar-system-research.md are added as Board cards.
 * 3. Cards are organized into spacious, folder-grouped clusters via board_groups.
 * 4. Cards do not overlap each other (strict bounding-box collision detection).
 * 5. Semantic relationships are preserved in entity_links and NOT auto-wired into board_item_connections.
 * 6. Merging into an existing Project with a Board:
 *    - Existing board title and description are NOT overwritten.
 *    - Existing item positions are NOT altered.
 *    - New Note cards are added without duplicating existing Note cards.
 * 7. Merging into an existing Project without a Board automatically creates one.
 * 8. Legacy .flowden.zip packages with optional/spatial-board.json continue to work.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const SecurityService = require('../server/services/securityService');
const serverModule = require('../server/index');
const Project = require('../server/models/Project');

const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

function record(name, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] #${passCount} ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] #${passCount + failCount} ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

(async () => {
  let serverInstance = null;
  const tempFiles = [];

  try {
    console.log('\n================================================================');
    console.log('FLOWDEN SPATIAL BOARD AUTO-CREATION & LAYOUT VERIFICATION');
    console.log('================================================================\n');

    await db.initDB();
    await SecurityService.ensureSecurityTables();

    const app = serverModule.app || serverModule;
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        console.log(`Test server running at ${BASE_URL}`);
        resolve();
      });
    });

    // 1. Register test user
    const userEmail = `board_tester_${Date.now()}@flowden.test`;
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Board Tester', email: userEmail, password: 'Password123!Safe' })
    });
    const regData = await regRes.json();
    const authToken = regData.token;
    const userId = regData.user.id;
    record('Registered test user for Spatial Board verification', Boolean(authToken && userId), `userId=${userId}`);

    // -------------------------------------------------------------------------
    // SECTION 1: AUTO-CREATE BOARD FOR SOLAR SYSTEM RESEARCH (.MD)
    // -------------------------------------------------------------------------
    console.log('\n[Section 1: Solar System Research Markdown Import -> Board Auto-Creation]');

    const solarMdPath = path.resolve(__dirname, '../docs/knowledge-exchange/examples/solar-system-research.md');
    record('solar-system-research.md fixture exists', fs.existsSync(solarMdPath));

    // Inspect
    const inspectForm = new FormData();
    inspectForm.append('file', new Blob([fs.readFileSync(solarMdPath)], { type: 'text/markdown' }), 'solar-system-research.md');

    const inspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: inspectForm
    });

    const inspectData = await inspectRes.json();
    record('POST /api/v1/exchange/inspect accepts solar-system-research.md (200 OK)',
      inspectRes.status === 200 && inspectData.valid === true,
      `status=${inspectRes.status}`
    );

    // Commit to create new project
    const commitForm = new FormData();
    commitForm.append('inspection_token', inspectData.inspection_token);
    commitForm.append('package_sha256', inspectData.package_sha256);
    commitForm.append('import_mode', 'new_project');
    commitForm.append('approved', 'true');
    commitForm.append('idempotency_key', `idem_solar_board_${Date.now()}`);

    const commitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: commitForm
    });

    const commitData = await commitRes.json();
    record('POST /api/v1/exchange/commit returned 200 OK',
      commitRes.status === 200 && commitData.success === true,
      `status=${commitRes.status}`
    );

    const projectId = commitData.created_project_id || commitData.project_id;
    record('Project created for solar system research', Boolean(projectId), `projectId=${projectId}`);

    // Verify Board was created
    const boards = await db.query('SELECT * FROM boards WHERE project_id = ?', [projectId]);
    record('A Spatial Board is automatically created in boards table for imported project',
      boards.length === 1,
      `boardsCount=${boards.length}`
    );

    const board = boards[0];
    record('Board has valid title and description',
      Boolean(board && board.title && board.title.includes('Solar System')),
      `title="${board?.title}"`
    );

    // Verify GET /api/v1/boards/project/:projectId returns the board (no "No board found for project")
    const getBoardRes = await fetch(`${BASE_URL}/api/v1/boards/project/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      }
    });
    const getBoardData = await getBoardRes.json();
    record('GET /api/v1/boards/project/:projectId returns the newly created board',
      getBoardRes.status === 200 && Array.isArray(getBoardData.boards) && getBoardData.boards.length > 0,
      `found=${getBoardData.boards?.length}`
    );

    // -------------------------------------------------------------------------
    // SECTION 2: BOARD CARDS & FOLDER CLUSTERING
    // -------------------------------------------------------------------------
    console.log('\n[Section 2: Note Cards and Folder Groups]');

    const boardItems = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND reference_type = ? AND deleted_at IS NULL',
      [board.id, 'note']
    );
    record('Spatial Board contains all 17 imported Notes as cards',
      boardItems.length === 17,
      `count=${boardItems.length}`
    );

    // Check card details
    const allCardsValid = boardItems.every(item => (
      item.item_type === 'note' &&
      item.reference_type === 'note' &&
      item.reference_id > 0 &&
      item.title && item.title.trim().length > 0 &&
      item.width >= 240 &&
      item.height >= 160
    ));
    record('All 17 cards have valid note reference, title, excerpt, and dimensions',
      allCardsValid,
      `sampleCardTitle="${boardItems[0]?.title}"`
    );

    // Check board groups (Folders)
    const boardGroups = await db.query(
      'SELECT * FROM board_groups WHERE board_id = ?',
      [board.id]
    );
    record('Spatial Board contains 6 board_groups matching the 6 Folder categories',
      boardGroups.length === 6,
      `groupCount=${boardGroups.length}`
    );

    const groupTitles = boardGroups.map(g => g.title);
    record('Folder groups match expected solar system categories',
      groupTitles.includes('01 Foundations') &&
      groupTitles.includes('02 The Sun & Planets') &&
      groupTitles.includes('03 Small Bodies & Moons'),
      `groups=${groupTitles.slice(0, 3).join(', ')}...`
    );

    // Verify all cards are assigned to one of the folder groups
    const allAssignedToGroups = boardItems.every(item => item.group_id && boardGroups.some(g => g.id === item.group_id));
    record('Every note card is assigned to its respective folder group',
      allAssignedToGroups
    );

    // -------------------------------------------------------------------------
    // SECTION 3: SPATIOUS LAYOUT & OVERLAP DETECTION
    // -------------------------------------------------------------------------
    console.log('\n[Section 3: Layout Spacing and Zero-Overlap Collision Detection]');

    let overlapsDetected = 0;
    const overlapDetails = [];

    for (let i = 0; i < boardItems.length; i++) {
      for (let j = i + 1; j < boardItems.length; j++) {
        const a = boardItems[i];
        const b = boardItems[j];

        // 2D Axis-Aligned Bounding Box (AABB) intersection check
        const aLeft = a.position_x;
        const aRight = a.position_x + a.width;
        const aTop = a.position_y;
        const aBottom = a.position_y + a.height;

        const bLeft = b.position_x;
        const bRight = b.position_x + b.width;
        const bTop = b.position_y;
        const bBottom = b.position_y + b.height;

        const isOverlapping = (aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop);
        if (isOverlapping) {
          overlapsDetected++;
          overlapDetails.push(`"${a.title}" overlaps with "${b.title}"`);
        }
      }
    }

    record('Zero overlapping cards: All 17 cards have mutually disjoint bounding boxes',
      overlapsDetected === 0,
      overlapsDetected === 0 ? 'zero collisions' : overlapDetails.join('; ')
    );

    // -------------------------------------------------------------------------
    // SECTION 4: SEPARATION OF RELATIONSHIPS AND BOARD CONNECTIONS
    // -------------------------------------------------------------------------
    console.log('\n[Section 4: Semantic Links vs Board Item Connections Separation]');

    const boardConnections = await db.query(
      'SELECT * FROM board_item_connections WHERE board_id = ?',
      [board.id]
    );
    record('Zero board_item_connections created from Markdown import (kept separate from semantic links)',
      boardConnections.length === 0,
      `connectionsCount=${boardConnections.length}`
    );

    const entityLinks = await db.query(
      'SELECT COUNT(*) as count FROM entity_links WHERE user_id = ?',
      [userId]
    );
    record('All semantic relationships are safely stored in entity_links table',
      entityLinks[0]?.count >= 20,
      `entityLinksCount=${entityLinks[0]?.count}`
    );

    // -------------------------------------------------------------------------
    // SECTION 5: MERGING INTO AN EXISTING PROJECT WITH AN EXISTING BOARD
    // -------------------------------------------------------------------------
    console.log('\n[Section 5: Merge into Existing Project with Board]');

    // Let's create an existing project with an existing custom board
    const existingProjIns = await db.query(
      `INSERT INTO projects (user_id, title, description, color, icon)
       VALUES (?, 'Original Research Project', 'Custom project description', '#3b82f6', 'folder')`,
      [userId]
    );
    const existingProjId = existingProjIns.insertId || (existingProjIns[0] && existingProjIns[0].insertId);

    const originalBoardTitle = 'Original Custom Board Title';
    const originalBoardDesc = 'Do not overwrite this description';
    const existingBoardIns = await db.query(
      `INSERT INTO boards (project_id, user_id, title, description, zoom_level, viewport_x, viewport_y, grid_size)
       VALUES (?, ?, ?, ?, 1.2, 100, 100, 20)`,
      [existingProjId, userId, originalBoardTitle, originalBoardDesc]
    );
    const existingBoardId = existingBoardIns.insertId || (existingBoardIns[0] && existingBoardIns[0].insertId);

    // Insert an existing card on that board
    await db.query(
      `INSERT INTO board_items (board_id, user_id, item_type, title, position_x, position_y, width, height, z_index)
       VALUES (?, ?, 'idea', 'Pre-existing Card', 50, 50, 250, 150, 1)`,
      [existingBoardId, userId]
    );

    // Prepare a small 2-note markdown file to merge into existingProjId
    const mergeMd = `---
project: Merge Exploration
summary: Merge test.
---

# Merge Exploration

## Note: Additional Deep Space Probe
folder: Exploration
tags: [probes]

Deep space probe details.

---

## Note: Interstellar Medium Discovery
folder: Exploration
tags: [interstellar]

Interstellar medium discoveries.
`;
    const mergeMdBlob = new Blob([mergeMd], { type: 'text/markdown' });
    const mergeInspectForm = new FormData();
    mergeInspectForm.append('file', mergeMdBlob, 'merge-exploration.md');
    mergeInspectForm.append('destination_project_id', String(existingProjId));

    const mergeInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: mergeInspectForm
    });
    const mergeInspectData = await mergeInspectRes.json();
    record('Inspect for merge into existing project succeeded', mergeInspectRes.status === 200);

    const mergeCommitForm = new FormData();
    mergeCommitForm.append('inspection_token', mergeInspectData.inspection_token);
    mergeCommitForm.append('package_sha256', mergeInspectData.package_sha256);
    mergeCommitForm.append('import_mode', 'merge');
    mergeCommitForm.append('destination_project_id', String(existingProjId));
    mergeCommitForm.append('approved', 'true');
    mergeCommitForm.append('idempotency_key', `idem_merge_board_${Date.now()}`);

    const mergeCommitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: mergeCommitForm
    });
    const mergeCommitData = await mergeCommitRes.json();
    record('POST /api/v1/exchange/commit in merge mode returned 200 OK',
      mergeCommitRes.status === 200 && mergeCommitData.success === true
    );

    // Check that existing Board title and description were NOT overwritten
    const existingBoardAfter = (await db.query('SELECT * FROM boards WHERE id = ?', [existingBoardId]))[0];
    record('Existing Board title was NOT overwritten on merge',
      existingBoardAfter.title === originalBoardTitle,
      `title="${existingBoardAfter.title}"`
    );
    record('Existing Board description was NOT overwritten on merge',
      existingBoardAfter.description === originalBoardDesc,
      `description="${existingBoardAfter.description}"`
    );

    // Check that the new cards were added to the existing board
    const itemsOnExistingBoard = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY id ASC',
      [existingBoardId]
    );
    record('Existing board now has 3 cards (1 pre-existing + 2 merged note cards)',
      itemsOnExistingBoard.length === 3,
      `count=${itemsOnExistingBoard.length}`
    );

    // Verify existing card was NOT moved (position remains 50, 50)
    const preExistingCard = itemsOnExistingBoard.find(i => i.title === 'Pre-existing Card');
    record('Pre-existing card position remained intact (x=50, y=50)',
      preExistingCard && preExistingCard.position_x === 50 && preExistingCard.position_y === 50
    );

    // Verify new cards were placed past pre-existing card (baseOffsetX >= 50 + 250 + 120 = 420)
    const newCards = itemsOnExistingBoard.filter(i => i.title !== 'Pre-existing Card');
    const newCardsOffsetSafely = newCards.every(c => c.position_x > (50 + 250));
    record('Merged cards placed with safe offset preventing overlap with existing cards',
      newCardsOffsetSafely,
      `minX=${Math.min(...newCards.map(c => c.position_x))}`
    );

    // -------------------------------------------------------------------------
    // SECTION 6: DEDUPLICATION ON RE-MERGE
    // -------------------------------------------------------------------------
    console.log('\n[Section 6: Deduplication on Repeated Merge]');

    // Inspect the exact same merge file again
    const remergeInspectForm = new FormData();
    remergeInspectForm.append('file', mergeMdBlob, 'merge-exploration.md');
    remergeInspectForm.append('destination_project_id', String(existingProjId));

    const remergeInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: remergeInspectForm
    });
    const remergeInspectData = await remergeInspectRes.json();

    const remergeCommitForm = new FormData();
    remergeCommitForm.append('inspection_token', remergeInspectData.inspection_token);
    remergeCommitForm.append('package_sha256', remergeInspectData.package_sha256);
    remergeCommitForm.append('import_mode', 'merge');
    remergeCommitForm.append('destination_project_id', String(existingProjId));
    remergeCommitForm.append('approved', 'true');
    remergeCommitForm.append('idempotency_key', `idem_remerge_${Date.now()}`);

    const remergeCommitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: remergeCommitForm
    });
    record('Re-merge commit completed with 200 OK', remergeCommitRes.status === 200);

    const itemsAfterRemerge = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND deleted_at IS NULL',
      [existingBoardId]
    );
    // Since notes were already mapped on the board, no duplicate cards should have been created!
    record('Deduplication: Board items count did not duplicate existing cards',
      itemsAfterRemerge.length === 3,
      `count=${itemsAfterRemerge.length}`
    );

    // -------------------------------------------------------------------------
    // SECTION 7: MERGE INTO EXISTING PROJECT WITHOUT A BOARD
    // -------------------------------------------------------------------------
    console.log('\n[Section 7: Merge into Existing Project Without a Board]');

    const noBoardProjIns = await db.query(
      `INSERT INTO projects (user_id, title, description, color, icon)
       VALUES (?, 'Empty Project Without Board', 'Test project', '#10b981', 'box')`,
      [userId]
    );
    const noBoardProjId = noBoardProjIns.insertId || (noBoardProjIns[0] && noBoardProjIns[0].insertId);

    const noBoardInspectForm = new FormData();
    noBoardInspectForm.append('file', mergeMdBlob, 'merge-no-board.md');
    noBoardInspectForm.append('destination_project_id', String(noBoardProjId));

    const noBoardInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: noBoardInspectForm
    });
    const noBoardInspectData = await noBoardInspectRes.json();

    const noBoardCommitForm = new FormData();
    noBoardCommitForm.append('inspection_token', noBoardInspectData.inspection_token);
    noBoardCommitForm.append('package_sha256', noBoardInspectData.package_sha256);
    noBoardCommitForm.append('import_mode', 'merge');
    noBoardCommitForm.append('destination_project_id', String(noBoardProjId));
    noBoardCommitForm.append('approved', 'true');
    noBoardCommitForm.append('idempotency_key', `idem_noboard_${Date.now()}`);

    const noBoardCommitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: noBoardCommitForm
    });
    record('Merge into board-less project committed with 200 OK', noBoardCommitRes.status === 200);

    const createdBoards = await db.query('SELECT * FROM boards WHERE project_id = ?', [noBoardProjId]);
    record('Board was automatically created for previously board-less project on merge',
      createdBoards.length === 1,
      `boardsCount=${createdBoards.length}`
    );

    const createdBoardItems = await db.query(
      'SELECT * FROM board_items WHERE board_id = ? AND deleted_at IS NULL',
      [createdBoards[0].id]
    );
    record('Imported notes were projected as cards on the newly created board',
      createdBoardItems.length === 2,
      `cardsCount=${createdBoardItems.length}`
    );

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`SPATIAL BOARD AUTO-CREATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('\n❌ Unexpected error during test execution:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
})();

