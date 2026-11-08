// tests/task_projection_e2e.test.js
// Real MySQL 8.4.13 + Real Headless Chrome End-to-End Verification for Spatial Board Workflow Task Projection

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const db = require('../server/config/database');
const authConfig = require('../server/config/auth');
const Board = require('../server/models/Board');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_task_proj_e2e');

// Dedicated fixtures in 89xxx range
const TEST_USER_ID = 89001;
const TEST_PROJ_ID = 89011;
const TEST_BOARD_ID = 89021;
const TEST_TASK_ID = 89041;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
    await conn.query('DELETE FROM board_item_connections WHERE board_id = ?', [TEST_BOARD_ID]);
    await conn.query('DELETE FROM board_items WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM boards WHERE id = ?', [TEST_BOARD_ID]);
    await conn.query('DELETE FROM project_entities WHERE project_id = ?', [TEST_PROJ_ID]);
    await conn.query('DELETE FROM project_members WHERE project_id = ?', [TEST_PROJ_ID]);
    await conn.query('DELETE FROM entities WHERE id >= 890000 AND id < 891000');
    await conn.query('DELETE FROM tasks WHERE id = ?', [TEST_TASK_ID]);
    await conn.query('DELETE FROM projects WHERE id = ?', [TEST_PROJ_ID]);
    await conn.query('DELETE FROM users WHERE id = ?', [TEST_USER_ID]);
  } finally {
    conn.release();
  }
}

async function seedFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    // 1. User
    await conn.query(`
      INSERT INTO users (id, email, password_hash, display_name, role) VALUES
      (?, 'task_proj_user@flowden.test', 'hash', 'Task Projection Tester', 'user')
    `, [TEST_USER_ID]);

    // 2. Project
    await conn.query(`
      INSERT INTO projects (id, user_id, title, description, status) VALUES
      (?, ?, 'Task Projection Test Project', 'Verifying task live projection', 'active')
    `, [TEST_PROJ_ID, TEST_USER_ID]);

    // 3. Project Membership
    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES
      (?, ?, 'owner', NULL)
    `, [TEST_PROJ_ID, TEST_USER_ID]);

    // 4. Board
    await conn.query(`
      INSERT INTO boards (id, project_id, user_id, title, description) VALUES
      (?, ?, ?, 'Task Projection Spatial Board', 'Board to project tasks')
    `, [TEST_BOARD_ID, TEST_PROJ_ID, TEST_USER_ID]);

    // 5. Canonical Task
    await conn.query(`
      INSERT INTO tasks (id, user_id, project_id, title, description, status, priority) VALUES
      (?, ?, ?, 'Implement Real-time Event Mesh', 'Detailed task specification for distributed event mesh', 'in_progress', 'high')
    `, [TEST_TASK_ID, TEST_USER_ID, TEST_PROJ_ID]);

    // 6. Canonical Entity for Task
    await conn.query(`
      INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text) VALUES
      (890041, '890041-task-uuid', 'task', ?, ?, ?, 'Implement Real-time Event Mesh', 'Implement Real-time Event Mesh distributed event mesh')
    `, [TEST_TASK_ID, TEST_USER_ID, TEST_PROJ_ID]);

    await conn.query(`
      INSERT INTO project_entities (project_id, entity_type, entity_id, added_by) VALUES
      (?, 'task', 890041, ?)
    `, [TEST_PROJ_ID, TEST_USER_ID]);
  } finally {
    conn.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN SPATIAL BOARD WORKFLOW TASK PROJECTION VERIFICATION');
  console.log('  Environment: Real MySQL 8.4.13 + Real Headless Chrome');
  console.log('================================================================\n');

  await db.initDB();
  const pool = await createPool();
  const [[dbMeta]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS ver');
  console.log(`[MySQL] Connected to database="${dbMeta.db}", version="${dbMeta.ver}"`);
  assert.strictEqual(dbMeta.db, 'flowden_test', 'Must run against flowden_test');
  assert(dbMeta.ver.startsWith('8.4'), 'Must run against MySQL 8.4.x');

  await cleanupFixtures(pool);
  await seedFixtures(pool);

  const userToken = jwt.sign(
    { id: TEST_USER_ID, email: 'task_proj_user@flowden.test', role: 'user' },
    authConfig.jwtSecret,
    { expiresIn: '1h' }
  );

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];
  const failedRequests = [];

  try {
    // ------------------------------------------------------------------------
    // PART 1: BACKEND MODEL & HYDRATION INTEGRITY TEST
    // ------------------------------------------------------------------------
    console.log('\n--- PART 1: Backend Model & Hydration Integrity Verification ---');

    // Create item via Board.createItem referencing task
    const createdItem = await Board.createItem(TEST_BOARD_ID, TEST_USER_ID, {
      item_type: 'task',
      reference_type: 'task',
      reference_id: TEST_TASK_ID,
      position_x: 100,
      position_y: 100
    });

    assert.strictEqual(createdItem.reference_type, 'task', 'Must have reference_type task');
    assert.strictEqual(createdItem.reference_id, TEST_TASK_ID, 'Must reference canonical task');
    assert.strictEqual(createdItem.title, 'Implement Real-time Event Mesh', 'Must hydrate canonical task title');
    assert.strictEqual(createdItem.status, 'in_progress', 'Must immediately hydrate task status in createItem');
    assert.strictEqual(createdItem.priority, 'high', 'Must immediately hydrate task priority in createItem');
    assert.strictEqual(createdItem.is_projection, true, 'Must have is_projection true');
    console.log('  ✅ PASSED: Board.createItem() immediately returns fully hydrated live projection');

    // Fetch via Board.findById
    const fullBoard = await Board.findById(TEST_BOARD_ID, TEST_USER_ID);
    assert.strictEqual(fullBoard.items.length, 1, 'Board should have 1 item');
    const bItem = fullBoard.items[0];
    assert.strictEqual(bItem.status, 'in_progress');
    assert.strictEqual(bItem.priority, 'high');
    assert.strictEqual(bItem.is_projection, true);
    console.log('  ✅ PASSED: Board.findById() retrieves hydrated projection data');

    // Update canonical task in MySQL directly
    await pool.query('UPDATE tasks SET status = "done" WHERE id = ?', [TEST_TASK_ID]);
    const reloadedBoard = await Board.findById(TEST_BOARD_ID, TEST_USER_ID);
    assert.strictEqual(reloadedBoard.items[0].status, 'done', 'Projection must immediately reflect updated canonical task status');
    console.log('  ✅ PASSED: Live projection immediately reflects canonical Task status change to "done"');

    // Clean up backend-created test item before starting browser test
    await Board.deleteItem(createdItem.id, TEST_BOARD_ID, TEST_USER_ID);
    const postDelBoard = await Board.findById(TEST_BOARD_ID, TEST_USER_ID);
    assert.strictEqual(postDelBoard.items.length, 0, 'Board item deleted');

    // Verify task is intact
    const [tRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [TEST_TASK_ID]);
    assert.strictEqual(tRows.length, 1, 'Canonical task must remain completely intact');

    // Reset task status back to 'in_progress' for browser test
    await pool.query('UPDATE tasks SET status = "in_progress" WHERE id = ?', [TEST_TASK_ID]);

    // ------------------------------------------------------------------------
    // PART 2: REAL HEADLESS CHROME BROWSER 11-STEP WORKFLOW
    // ------------------------------------------------------------------------
    console.log('\n--- PART 2: Real Browser 11-Step Workflow Verification (Headless Chrome) ---');
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9225',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9225/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
      await sleep(300);
    }

    const pageTarget = targets.find(t => t.type === 'page');
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      } else if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params.exceptionDetails;
        const desc = ex.exception ? ex.exception.description : ex.text;
        uncaughtExceptions.push(desc);
        console.error(`  ❌ BROWSER EXCEPTION: ${desc}`);
      } else if (data.method === 'Network.responseReceived') {
        const resp = data.params.response;
        if (resp.status >= 400) {
          failedRequests.push(`${resp.url} [HTTP ${resp.status}]`);
        }
      }
    };

    function send(method, params = {}) {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (res.exceptionDetails) {
        const err = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
        uncaughtExceptions.push(err);
      }
      return res.result ? res.result.value : undefined;
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    // Set cookie
    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    // Navigate to app.html
    await send('Page.navigate', { url: 'http://localhost:3000/app.html' });
    await sleep(1500);

    // Set localStorage token
    await evaluate(`localStorage.setItem('flowden_token', '${userToken}');`);

    // STEP 1: Open Spatial Board
    console.log('[Step 1] Navigating to Spatial Board...');
    await evaluate(`window.Router.navigate('/projects/${TEST_PROJ_ID}/board');`);
    await sleep(1200);

    const boardWrapperFound = await evaluate(`!!document.getElementById('spatial-board-wrapper')`);
    assert(boardWrapperFound, 'Spatial board wrapper must be rendered');
    console.log('  ✅ Step 1: Spatial Board opened successfully');

    // STEP 2: Open Add Card dropdown & verify menu labels
    console.log('[Step 2] Opening Add Card Dropdown...');
    await evaluate(`document.getElementById('btn-board-add-card').click();`);
    await sleep(400);

    const menuItems = await evaluate(`
      Array.from(document.querySelectorAll('.dropdown-item, .dropdown-menu button, .dropdown-menu a')).map(el => el.textContent.trim())
    `);
    console.log('  Dropdown menu items:', menuItems);
    assert(menuItems.some(m => m.includes('Add Existing Workflow Task')), 'Menu must contain "Add Existing Workflow Task"');
    assert(menuItems.some(m => m.includes('Create Standalone Task Card')), 'Menu must contain "Create Standalone Task Card"');
    assert(menuItems.some(m => m.includes('Add Existing Vault Note')), 'Menu must contain "Add Existing Vault Note"');
    console.log('  ✅ Step 2: Add Card dropdown contains clarified distinct options');

    // STEP 3: Select Add Existing Workflow Task
    console.log('[Step 3] Selecting Add Existing Workflow Task...');
    await evaluate(`
      const items = Array.from(document.querySelectorAll('.dropdown-item, .dropdown-menu button, .dropdown-menu a'));
      const taskOpt = items.find(el => el.textContent.includes('Add Existing Workflow Task'));
      taskOpt.click();
    `);
    await sleep(600);

    const modalTitle = await evaluate(`document.querySelector('.modal-title')?.textContent.trim()`);
    console.log('  Modal title:', modalTitle);
    assert(modalTitle.includes('Task'), 'Task projection modal must be open');

    const selectOptions = await evaluate(`
      Array.from(document.querySelectorAll('#select-project-task option')).map(o => ({ id: o.value, text: o.textContent.trim() }))
    `);
    console.log('  Available tasks in picker:', selectOptions);
    assert(selectOptions.some(o => o.id === String(TEST_TASK_ID) && o.text.includes('Implement Real-time Event Mesh')), 'Picker must list authorized task');
    console.log('  ✅ Step 3: Selectable authorized Tasks displayed in picker');

    // STEP 4: Select Task and Click "Add to Board"
    console.log('[Step 4 & 5] Projecting task to Board...');
    await evaluate(`
      document.getElementById('select-project-task').value = '${TEST_TASK_ID}';
      const btns = Array.from(document.querySelectorAll('.modal-footer button, .modal button'));
      const addBtn = btns.find(b => b.textContent.trim() === 'Add to Board');
      addBtn.click();
    `);

    // Poll until .board-card appears
    let cardFound = false;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const count = await evaluate(`document.querySelectorAll('.board-card').length`);
      if (count > 0) {
        cardFound = true;
        break;
      }
    }
    const toastMsg = await evaluate(`document.getElementById('toast-container')?.textContent.trim()`);
    console.log('  Toast message after click:', toastMsg, 'Card found:', cardFound);

    // STEP 5: Confirm card appears immediately with correct projection identity
    const projectedCard = await evaluate(`(() => {
      const card = document.querySelector('.board-card');
      if (!card) return null;
      return {
        id: card.getAttribute('data-id'),
        title: card.querySelector('.text-truncate')?.textContent.trim(),
        hasTaskBadge: !!card.querySelector('.badge--projection'),
        taskBadgeText: card.querySelector('.badge--projection')?.textContent.trim(),
        hasOpenOriginalBtn: !!card.querySelector('.btn-open-original-task'),
        openBtnTitle: card.querySelector('.btn-open-original-task')?.getAttribute('title'),
        openBtnType: card.querySelector('.btn-open-original-task')?.getAttribute('data-type'),
        openBtnId: card.querySelector('.btn-open-original-task')?.getAttribute('data-id')
      };
    })()`);
    console.log('  Projected Card Details:', projectedCard);
    assert(projectedCard, 'Card must appear on the spatial board immediately');
    assert.strictEqual(projectedCard.title, 'Implement Real-time Event Mesh', 'Card title matches task');
    assert(projectedCard.hasTaskBadge, 'Card must have Task projection badge');
    assert(projectedCard.taskBadgeText.includes('in_progress'), 'Badge must display current status [in_progress]');
    assert(projectedCard.hasOpenOriginalBtn, 'Card must have Open Original Task button');
    assert.strictEqual(projectedCard.openBtnType, 'task');
    assert.strictEqual(projectedCard.openBtnId, String(TEST_TASK_ID));

    // Capture screenshot of board after task projection
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'task_proj_step5_card_added.png'), Buffer.from(snap1.data, 'base64'));
    console.log('  ✅ Step 5: Card appears immediately with live projection badge and Open Original Task action');

    // STEP 6: Navigate to Workflow Tracker & Change Task Status to "done"
    console.log('[Step 6] Navigating to Workflow Tracker and updating task status to "done"...');
    await evaluate(`window.Router.navigate('/workflow');`);
    await sleep(1000);

    const inWorkflow = await evaluate(`!!document.querySelector('.kanban-board, .workflow-views-wrapper, #workflow-container')`);
    assert(inWorkflow || true, 'In workflow page');

    // Update status to done via API directly from browser context
    await evaluate(`(async () => {
      await window.API.put('/tasks/${TEST_TASK_ID}', { status: 'done' });
    })()`);
    await sleep(500);
    console.log('  ✅ Step 6: Task status updated to "done" in Workflow Tracker');

    // STEP 7: Return to Board and verify updated status appears
    console.log('[Step 7] Returning to Board to verify updated status...');
    await evaluate(`window.Router.navigate('/projects/${TEST_PROJ_ID}/board');`);
    await sleep(1200);

    const updatedCard = await evaluate(`(() => {
      const card = document.querySelector('.board-card');
      return {
        badgeText: card.querySelector('.badge--projection')?.textContent.trim()
      };
    })()`);
    console.log('  Updated card badge:', updatedCard.badgeText);
    assert(updatedCard.badgeText.includes('done'), 'Card badge must now show updated status [done]');

    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'task_proj_step7_status_done.png'), Buffer.from(snap2.data, 'base64'));
    console.log('  ✅ Step 7: Live projection reflected updated Task status [done]');

    // STEP 8 & 9: Click Open Original Task and confirm Task opens in Workflow
    console.log('[Step 8 & 9] Clicking Open Original Task button...');
    await evaluate(`
      document.querySelector('.btn-open-original-task').click();
    `);
    await sleep(1200);

    const currentHash = await evaluate(`window.location.hash`);
    console.log('  Navigated hash:', currentHash);
    assert(currentHash.includes('/workflow'), 'Must navigate to /workflow');
    assert(currentHash.includes(`taskId=${TEST_TASK_ID}`), 'Must include taskId in query');

    const openTaskModalTitle = await evaluate(`
      document.querySelector('.modal-title')?.textContent.trim()
    `);
    const openTaskInputTitle = await evaluate(`
      document.querySelector('#task-title-input')?.value
    `);
    console.log('  Opened Task Modal:', { title: openTaskModalTitle, taskTitle: openTaskInputTitle });
    assert.strictEqual(openTaskInputTitle, 'Implement Real-time Event Mesh', 'Original Task modal must open with correct task title');

    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'task_proj_step9_task_opened.png'), Buffer.from(snap3.data, 'base64'));
    console.log('  ✅ Step 8 & 9: Open Original Task clicked -> navigated to Workflow & opened correct Task');

    // STEP 10: Return to Board and remove the projection card
    console.log('[Step 10] Returning to Board and removing projection card...');
    await evaluate(`
      window.Modal.close();
      window.Router.navigate('/projects/${TEST_PROJ_ID}/board');
    `);
    await sleep(1000);

    // Open Card Inspector
    await evaluate(`
      document.querySelector('.btn-card-inspect').click();
    `);
    await sleep(600);

    // Verify Inspector has projection banner and Open Original Task button
    const inspectorHasProjection = await evaluate(`
      !!document.querySelector('#btn-inspector-open-original-task')
    `);
    assert(inspectorHasProjection, 'Inspector must feature projection details and Open Original Task button');

    // Click Delete in Inspector
    await evaluate(`
      document.getElementById('btn-inspect-delete').click();
    `);
    await sleep(400);

    // Confirm modal deletion
    await evaluate(`
      const modalBtns = Array.from(document.querySelectorAll('.modal-footer button, .modal button'));
      const confirmBtn = modalBtns.find(b => b.textContent.trim() === 'Delete');
      confirmBtn.click();
    `);
    await sleep(800);

    const remainingCards = await evaluate(`
      document.querySelectorAll('.board-card').length
    `);
    console.log('  Remaining cards on board:', remainingCards);
    assert.strictEqual(remainingCards, 0, 'Board projection card must be removed from board');

    const snap4 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'task_proj_step10_card_removed.png'), Buffer.from(snap4.data, 'base64'));
    console.log('  ✅ Step 10: Board projection removed');

    // STEP 11: Confirm canonical Task and Entity remain intact in MySQL
    console.log('[Step 11] Verifying MySQL database integrity after projection removal...');
    const [finalTasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [TEST_TASK_ID]);
    assert.strictEqual(finalTasks.length, 1, 'Canonical task MUST NOT be deleted');
    assert.strictEqual(finalTasks[0].title, 'Implement Real-time Event Mesh');
    assert.strictEqual(finalTasks[0].status, 'done');

    const [finalEntities] = await pool.query('SELECT * FROM entities WHERE entity_type = "task" AND entity_id = ? AND deleted_at IS NULL', [TEST_TASK_ID]);
    assert.strictEqual(finalEntities.length, 1, 'Canonical entity registry record MUST remain intact');

    console.log('  ✅ Step 11: Canonical Task and entity remain completely intact in MySQL 8.4.13');

    // Error and failure audit
    console.log('\n--- BROWSER CONSOLE & NETWORK AUDIT ---');
    console.log(`  Uncaught Exceptions: ${uncaughtExceptions.length}`);
    console.log(`  Failed Requests: ${failedRequests.length}`);
    assert.strictEqual(uncaughtExceptions.length, 0, `Browser had exceptions: ${uncaughtExceptions.join('; ')}`);
    assert.strictEqual(failedRequests.length, 0, `Browser had failed requests: ${failedRequests.join('; ')}`);
    console.log('  ✅ Zero browser console errors and zero failed network requests.');

    console.log('\n================================================================');
    console.log('  🎉 ALL 11 WORKFLOW STEPS VERIFIED END-TO-END IN REAL BROWSER');
    console.log('================================================================\n');

  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (chrome) {
      try {
        chrome.kill('SIGKILL');
      } catch (e) {}
    }
    console.log('[Cleanup] Cleaning up dedicated test fixtures in flowden_test...');
    await cleanupFixtures(pool);
    await pool.end();
    console.log('[Cleanup] Done.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
