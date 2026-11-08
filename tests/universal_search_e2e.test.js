// tests/universal_search_e2e.test.js
// Real MySQL 8.4.13 + Real Headless Chrome E2E Verification for Universal Search

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const db = require('../server/config/database');
const authConfig = require('../server/config/auth');
const SearchService = require('../server/services/searchService');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_search_e2e');

// Dedicated fixture IDs in 79xxx / 790xxx range (never touches user 99003 or other suites)
const ALICE_ID = 79001;
const BOB_ID = 79002;
const PROJ_ALICE_ID = 79011;
const PROJ_BOB_SECRET_ID = 79012;
const BOARD_ALICE_ID = 79021;
const BOARD_FALLBACK_ID = 79022;
const NOTE_ALICE_ID = 79031;
const NOTE_SHORT_1_ID = 79032;
const NOTE_SHORT_2_ID = 79033;
const NOTE_BOB_PRIVATE_ID = 79034;
const NOTE_TRASHED_ID = 79035;
const TASK_ALICE_ID = 79041;
const CAPTURE_BOB_ID = 79051;

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
    await conn.query('DELETE FROM entity_links WHERE id >= 79000 AND id < 79100');
    await conn.query('DELETE FROM project_entities WHERE project_id IN (?, ?)', [PROJ_ALICE_ID, PROJ_BOB_SECRET_ID]);
    await conn.query('DELETE FROM project_members WHERE project_id IN (?, ?)', [PROJ_ALICE_ID, PROJ_BOB_SECRET_ID]);
    await conn.query('DELETE FROM entities WHERE id >= 790000 AND id < 790100');
    await conn.query('DELETE FROM boards WHERE id IN (?, ?)', [BOARD_ALICE_ID, BOARD_FALLBACK_ID]);
    await conn.query('DELETE FROM notes WHERE id IN (?, ?, ?, ?, ?)', [
      NOTE_ALICE_ID, NOTE_SHORT_1_ID, NOTE_SHORT_2_ID, NOTE_BOB_PRIVATE_ID, NOTE_TRASHED_ID
    ]);
    await conn.query('DELETE FROM tasks WHERE id = ?', [TASK_ALICE_ID]);
    await conn.query('DELETE FROM projects WHERE id IN (?, ?)', [PROJ_ALICE_ID, PROJ_BOB_SECRET_ID]);
    await conn.query('DELETE FROM users WHERE id IN (?, ?)', [ALICE_ID, BOB_ID]);
  } finally {
    conn.release();
  }
}

async function seedFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      INSERT INTO users (id, email, password_hash, display_name, role) VALUES
      (?, 'alice_search_e2e@flowden.test', 'hash', 'Alice Search E2E', 'user'),
      (?, 'bob_search_e2e@flowden.test', 'hash', 'Bob Search E2E', 'user')
    `, [ALICE_ID, BOB_ID]);

    await conn.query(`
      INSERT INTO projects (id, user_id, title, description, status) VALUES
      (?, ?, 'Quantum Atlas Project', 'Spatial synthesis workspace', 'active'),
      (?, ?, 'Bob Classified Project', 'Top secret project', 'active')
    `, [PROJ_ALICE_ID, ALICE_ID, PROJ_BOB_SECRET_ID, BOB_ID]);

    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES
      (?, ?, 'owner', NULL),
      (?, ?, 'owner', NULL)
    `, [PROJ_ALICE_ID, ALICE_ID, PROJ_BOB_SECRET_ID, BOB_ID]);

    await conn.query(`
      INSERT INTO boards (id, project_id, user_id, title, description) VALUES
      (?, ?, ?, 'Quantum Spatial Canvas', 'Main spatial board for Quantum Atlas'),
      (?, ?, ?, 'Fallback Project Board', 'Board whose entity has null primary_project_id')
    `, [BOARD_ALICE_ID, PROJ_ALICE_ID, ALICE_ID, BOARD_FALLBACK_ID, PROJ_ALICE_ID, ALICE_ID]);

    await conn.query(`
      INSERT INTO notes (id, user_id, project_id, title, content, word_count) VALUES
      (?, ?, ?, 'Quantum Entanglement Note', 'Detailed notes on quantum state telemetry', 6),
      (?, ?, NULL, 'z', 'Single character title note', 4),
      (?, ?, NULL, 'xy', 'Two character title note with 100%_literal marker', 7),
      (?, ?, ?, 'Bob Secret Vault Note', 'z xy Quantum classified payload', 5),
      (?, ?, ?, 'Trashed Quantum Note', 'z xy Quantum deleted payload', 5)
    `, [
      NOTE_ALICE_ID, ALICE_ID, PROJ_ALICE_ID,
      NOTE_SHORT_1_ID, ALICE_ID,
      NOTE_SHORT_2_ID, ALICE_ID,
      NOTE_BOB_PRIVATE_ID, BOB_ID, PROJ_BOB_SECRET_ID,
      NOTE_TRASHED_ID, ALICE_ID, PROJ_ALICE_ID
    ]);

    await conn.query(`
      INSERT INTO tasks (id, user_id, project_id, title, description, status, priority) VALUES
      (?, ?, ?, 'Calibrate Quantum Sensor', 'Execute sensor calibration workflow', 'in_progress', 'high')
    `, [TASK_ALICE_ID, ALICE_ID, PROJ_ALICE_ID]);

    // Canonical entities
    await conn.query(`
      INSERT INTO entities (id, uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, deleted_at) VALUES
      (790001, 'uuid-790001', 'project', ?, ?, ?, 'Quantum Atlas Project', 'Spatial synthesis workspace', NULL),
      (790002, 'uuid-790002', 'board', ?, ?, ?, 'Quantum Spatial Canvas', 'Main spatial board for Quantum Atlas', NULL),
      (790003, 'uuid-790003', 'board', ?, ?, NULL, 'Fallback Project Board', 'Board whose entity has null primary_project_id', NULL),
      (790004, 'uuid-790004', 'note', ?, ?, ?, 'Quantum Entanglement Note', 'Detailed notes on quantum state telemetry', NULL),
      (790005, 'uuid-790005', 'note', ?, ?, NULL, 'z', 'Single character title note', NULL),
      (790006, 'uuid-790006', 'note', ?, ?, NULL, 'xy', 'Two character title note with 100%_literal marker', NULL),
      (790007, 'uuid-790007', 'task', ?, ?, ?, 'Calibrate Quantum Sensor', 'Execute sensor calibration workflow', NULL),
      (790008, 'uuid-790008', 'note', ?, ?, ?, 'Bob Secret Vault Note', 'z xy Quantum classified payload', NULL),
      (790009, 'uuid-790009', 'note', ?, ?, ?, 'Trashed Quantum Note', 'z xy Quantum deleted payload', NOW()),
      (790010, 'uuid-790010', 'capture', ?, ?, ?, 'Bob Private Quick Capture', 'z xy Quantum secret capture', NULL)
    `, [
      PROJ_ALICE_ID, ALICE_ID, PROJ_ALICE_ID,
      BOARD_ALICE_ID, ALICE_ID, PROJ_ALICE_ID,
      BOARD_FALLBACK_ID, ALICE_ID,
      NOTE_ALICE_ID, ALICE_ID, PROJ_ALICE_ID,
      NOTE_SHORT_1_ID, ALICE_ID,
      NOTE_SHORT_2_ID, ALICE_ID,
      TASK_ALICE_ID, ALICE_ID, PROJ_ALICE_ID,
      NOTE_BOB_PRIVATE_ID, BOB_ID, PROJ_BOB_SECRET_ID,
      NOTE_TRASHED_ID, ALICE_ID, PROJ_ALICE_ID,
      CAPTURE_BOB_ID, BOB_ID, PROJ_ALICE_ID
    ]);

    await conn.query(`
      INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by) VALUES
      (?, 'board', ?, 'admin', ?),
      (?, 'note', ?, 'admin', ?),
      (?, 'task', ?, 'admin', ?),
      (?, 'note', ?, 'admin', ?),
      (?, 'note', ?, 'admin', ?)
    `, [
      PROJ_ALICE_ID, BOARD_ALICE_ID, ALICE_ID,
      PROJ_ALICE_ID, NOTE_ALICE_ID, ALICE_ID,
      PROJ_ALICE_ID, TASK_ALICE_ID, ALICE_ID,
      PROJ_ALICE_ID, NOTE_TRASHED_ID, ALICE_ID,
      PROJ_BOB_SECRET_ID, NOTE_BOB_PRIVATE_ID, BOB_ID
    ]);

    // Link Alice's note to Bob's private note to verify link traversal never leaks in short or fulltext search
    await conn.query(`
      INSERT INTO entity_links (id, user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed)
      VALUES (79001, ?, 'note', ?, 'note', ?, 'references', 'manual', 1)
    `, [BOB_ID, NOTE_BOB_PRIVATE_ID, NOTE_ALICE_ID]);
  } finally {
    conn.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN UNIVERSAL SEARCH END-TO-END VERIFICATION SUITE');
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

  const aliceToken = jwt.sign(
    { id: ALICE_ID, email: 'alice_search_e2e@flowden.test', role: 'user' },
    authConfig.jwtSecret,
    { expiresIn: '1h' }
  );

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];

  try {
    // ------------------------------------------------------------------------
    // PART 1: REAL MYSQL SHORT-QUERY, SUBSTRING, WILDCARD ESCAPING & AUTH TESTS
    // ------------------------------------------------------------------------
    console.log('\n--- PART 1: Real MySQL Query & Authorization Verification ---');

    // 1A: 1-character query ("z") + real user's 1-char ("s")
    const res1Char = await SearchService.universalSearch(pool, ALICE_ID, 'z');
    assert(res1Char.some(r => r.entity_id === NOTE_SHORT_1_ID && r.title === 'z'), '1-char query "z" must find Alice Note "z"');
    assert(!res1Char.some(r => r.entity_id === NOTE_BOB_PRIVATE_ID), '1-char query must NOT leak Bob private note');
    assert(!res1Char.some(r => r.entity_id === NOTE_TRASHED_ID), '1-char query must NOT leak soft-deleted note');
    assert(!res1Char.some(r => r.entity_id === CAPTURE_BOB_ID), '1-char query must NOT leak Bob quick capture');
    console.log('  ✅ PASSED: 1-character query ("z") returns authorized matches and zero unauthorized rows');

    // Verify existing user 99003's 1-character title "s" in flowden_test
    const resUserS = await SearchService.universalSearch(pool, 99003, 's');
    assert(resUserS.length >= 1, 'Query "s" for user 99003 must return their "s" project/tasks/board');
    console.log(`  ✅ PASSED: Real user query "s" returned ${resUserS.length} authorized entities`);

    // 1B: 2-character query ("xy")
    const res2Char = await SearchService.universalSearch(pool, ALICE_ID, 'xy');
    assert(res2Char.some(r => r.entity_id === NOTE_SHORT_2_ID && r.title === 'xy'), '2-char query "xy" must find Alice Note "xy"');
    assert(!res2Char.some(r => r.entity_id === NOTE_BOB_PRIVATE_ID), '2-char query must NOT leak Bob private note');
    assert(!res2Char.some(r => r.entity_id === NOTE_TRASHED_ID), '2-char query must NOT leak soft-deleted note');
    assert(!res2Char.some(r => r.entity_id === CAPTURE_BOB_ID), '2-char query must NOT leak Bob quick capture');
    console.log('  ✅ PASSED: 2-character query ("xy") returns authorized matches and zero unauthorized rows');

    // 1C: 3+ character FULLTEXT query ("Quantum")
    const resFulltext = await SearchService.universalSearch(pool, ALICE_ID, 'Quantum');
    const ftIds = resFulltext.map(r => `${r.entity_type}:${r.entity_id}`);
    assert(ftIds.includes(`project:${PROJ_ALICE_ID}`), '3+ char FULLTEXT query must find Alice project');
    assert(ftIds.includes(`board:${BOARD_ALICE_ID}`), '3+ char FULLTEXT query must find Alice board');
    assert(ftIds.includes(`note:${NOTE_ALICE_ID}`), '3+ char FULLTEXT query must find Alice note');
    assert(ftIds.includes(`task:${TASK_ALICE_ID}`), '3+ char FULLTEXT query must find Alice task');
    assert(!ftIds.includes(`note:${NOTE_BOB_PRIVATE_ID}`), '3+ char query must NOT leak Bob private note');
    assert(!ftIds.includes(`note:${NOTE_TRASHED_ID}`), '3+ char query must NOT leak soft-deleted note');
    assert(!ftIds.includes(`capture:${CAPTURE_BOB_ID}`), '3+ char query must NOT leak Bob quick capture');
    console.log('  ✅ PASSED: 3+ character FULLTEXT query ("Quantum") returns all authorized entities and blocks unauthorized ones');

    // 1D: Substring fallback query ("Entangle")
    const resSubstr = await SearchService.universalSearch(pool, ALICE_ID, 'Entangle');
    assert(resSubstr.some(r => r.entity_id === NOTE_ALICE_ID), 'Substring query "Entangle" must find "Quantum Entanglement Note"');
    console.log('  ✅ PASSED: Substring fallback query ("Entangle") works with full authorization');

    // 1E: LIKE Wildcard Escaping ("% and _ must not match all rows")
    const resPercent = await SearchService.universalSearch(pool, ALICE_ID, '%');
    // Only NOTE_SHORT_2_ID contains a literal '%' ("100%_literal")
    assert.strictEqual(resPercent.length, 1, 'Searching literal "%" must only match entity containing literal "%"');
    assert.strictEqual(resPercent[0].entity_id, NOTE_SHORT_2_ID);
    const resUnderscore = await SearchService.universalSearch(pool, ALICE_ID, '100%_literal');
    assert.strictEqual(resUnderscore.length, 1, 'Searching literal "100%_literal" must match only NOTE_SHORT_2_ID');
    assert.strictEqual(resUnderscore[0].entity_id, NOTE_SHORT_2_ID);
    console.log('  ✅ PASSED: LIKE wildcard characters (% and _) are properly escaped');

    // 1F: Revoked membership & Cross-project sharing check on short queries
    await pool.query('INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES (?, ?, \'viewer\', NULL)', [PROJ_BOB_SECRET_ID, ALICE_ID]);
    // Share NOTE_BOB_PRIVATE_ID into PROJ_BOB_SECRET_ID (already there) -> Alice is active member now
    const resSharedShort = await SearchService.universalSearch(pool, ALICE_ID, 'z');
    assert(resSharedShort.some(r => r.entity_id === NOTE_BOB_PRIVATE_ID), 'Active member must find shared note via 1-char query');
    // Now revoke Alice's membership
    await pool.query('UPDATE project_members SET revoked_at = NOW() WHERE project_id = ? AND user_id = ?', [PROJ_BOB_SECRET_ID, ALICE_ID]);
    const resRevokedShort = await SearchService.universalSearch(pool, ALICE_ID, 'z');
    assert(!resRevokedShort.some(r => r.entity_id === NOTE_BOB_PRIVATE_ID), 'Revoked member must immediately lose access in 1-char query');
    await pool.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [PROJ_BOB_SECRET_ID, ALICE_ID]);
    console.log('  ✅ PASSED: Active membership sharing & revoked membership exclusion enforced on 1-char queries');

    // ------------------------------------------------------------------------
    // PART 2: REAL HEADLESS CHROME BROWSER VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n--- PART 2: Real Browser UI Verification (Headless Chrome) ---');
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9224',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9224/json');
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

    async function captureScreenshot(filename) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), Buffer.from(data, 'base64'));
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: aliceToken,
      domain: 'localhost',
      path: '/'
    });

    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/overview' });
    await sleep(1800);

    // Check 1: Universal Search appears in the sidebar and navigates to #/search
    const sidebarCheck = await evaluate(`
      (() => {
        const el = document.querySelector('#app-sidebar a.nav-item[href="#/search"]');
        if (!el) return { exists: false };
        const label = el.querySelector('.nav-item-label')?.textContent?.trim();
        el.click();
        return { exists: true, label };
      })()
    `);
    await sleep(800);
    const hashAfterSidebar = await evaluate(`window.location.hash`);
    assert.strictEqual(sidebarCheck.exists, true, 'Sidebar must have #/search nav-item');
    assert.strictEqual(sidebarCheck.label, 'Universal Search');
    assert.strictEqual(hashAfterSidebar, '#/search', 'Clicking sidebar Universal Search must navigate to #/search');
    console.log('  ✅ PASSED [Browser 1]: Universal Search appears in the sidebar and navigates to #/search');

    // Check 2: Ctrl+K finds an existing Note and clicking it opens the Note in Vault
    await evaluate(`window.CommandPalette.open()`);
    await sleep(300);
    await evaluate(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.value = 'Entanglement';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(600);
    await captureScreenshot('e2e_ctrlk_note_search.png');

    const ctrlKNoteFound = await evaluate(`
      (() => {
        const item = document.querySelector('.command-palette-item[data-entity-type="note"]');
        if (!item) return { found: false };
        const text = item.textContent.trim();
        const url = item.getAttribute('data-url');
        item.click();
        return { found: true, text, url };
      })()
    `);
    await sleep(1000);
    const hashAfterNoteClick = await evaluate(`window.location.hash`);
    assert.strictEqual(ctrlKNoteFound.found, true, 'Ctrl+K must find existing Note');
    assert(ctrlKNoteFound.text.includes('Quantum Entanglement Note'));
    assert.strictEqual(hashAfterNoteClick, `#/vault/${NOTE_ALICE_ID}`);
    console.log(`  ✅ PASSED [Browser 2]: Ctrl+K found Note ("Quantum Entanglement Note") and navigated to ${hashAfterNoteClick}`);

    // Check 3: Ctrl+K finds an existing Task and clicking it opens the Task in Workflow
    await evaluate(`window.CommandPalette.open()`);
    await sleep(300);
    await evaluate(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.value = 'Calibrate';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(600);

    const ctrlKTaskFound = await evaluate(`
      (() => {
        const item = document.querySelector('.command-palette-item[data-entity-type="task"]');
        if (!item) return { found: false };
        const text = item.textContent.trim();
        const url = item.getAttribute('data-url');
        item.click();
        return { found: true, text, url };
      })()
    `);
    await sleep(1200);
    const hashAfterTaskClick = await evaluate(`window.location.hash`);
    assert.strictEqual(ctrlKTaskFound.found, true, 'Ctrl+K must find existing Task');
    assert(ctrlKTaskFound.text.includes('Calibrate Quantum Sensor'));
    assert.strictEqual(hashAfterTaskClick, `#/workflow?taskId=${TASK_ALICE_ID}`);
    // Close the auto-opened task modal
    await evaluate(`if (window.Modal) window.Modal.close();`);
    console.log(`  ✅ PASSED [Browser 3]: Ctrl+K found Task ("Calibrate Quantum Sensor") and navigated to ${hashAfterTaskClick}`);

    // Check 4: Pressing Enter in Ctrl+K opens the full Search page (#/search?q=...)
    await evaluate(`window.CommandPalette.open()`);
    await sleep(300);
    await evaluate(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.value = 'Quantum';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(600);
    await evaluate(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(1200);
    await captureScreenshot('e2e_search_page_quantum.png');

    const searchPageState = await evaluate(`
      (() => {
        const hash = window.location.hash;
        const text = document.getElementById('search-results-output')?.innerText || '';
        const cards = Array.from(document.querySelectorAll('.search-item-card')).map(c => ({
          url: c.getAttribute('data-url'),
          text: c.innerText.trim()
        }));
        return { hash, text, cards };
      })()
    `);
    assert.strictEqual(searchPageState.hash, '#/search?q=Quantum', 'Enter in Ctrl+K must navigate to #/search?q=Quantum');
    assert(searchPageState.text.includes('Quantum Entanglement Note'), 'Search page must display matching note');
    assert(searchPageState.text.includes('Calibrate Quantum Sensor'), 'Search page must display matching task');
    assert(searchPageState.text.includes('Quantum Spatial Canvas'), 'Search page must display matching board');
    assert(!searchPageState.text.includes('Bob Secret Vault Note'), 'Search page must NOT leak unauthorized note');
    assert(!searchPageState.text.includes('Trashed Quantum Note'), 'Search page must NOT leak soft-deleted note');
    assert(!searchPageState.text.includes('Bob Private Quick Capture'), 'Search page must NOT leak foreign capture');
    console.log('  ✅ PASSED [Browser 4, 6, 8]: Enter opens full Search page with all authorized FULLTEXT results and zero leakage');

    // Check 5: 1-char ("z") and 2-char ("xy") queries in the browser Search page
    await evaluate(`
      (() => {
        const input = document.getElementById('search-page-input');
        input.value = 'z';
        document.getElementById('btn-execute-search').click();
      })()
    `);
    await sleep(800);
    const short1Browser = await evaluate(`document.getElementById('search-results-output')?.innerText || ''`);
    assert(short1Browser.includes('Found 1 result for "z"'), `Expected 1 result for "z" in browser, got: ${short1Browser}`);

    await evaluate(`
      (() => {
        const input = document.getElementById('search-page-input');
        input.value = 'xy';
        document.getElementById('btn-execute-search').click();
      })()
    `);
    await sleep(800);
    const short2Browser = await evaluate(`document.getElementById('search-results-output')?.innerText || ''`);
    assert(short2Browser.includes('Found 1 result for "xy"'), `Expected 1 result for "xy" in browser, got: ${short2Browser}`);
    console.log('  ✅ PASSED [Browser 5]: 1-character ("z") and 2-character ("xy") queries return valid matches in browser');

    // Check 7: Board search results navigate to /projects/:projectId/board and open the correct Board
    await evaluate(`
      (() => {
        const input = document.getElementById('search-page-input');
        input.value = 'Canvas';
        document.getElementById('btn-execute-search').click();
      })()
    `);
    await sleep(800);
    const boardClickResult = await evaluate(`
      (() => {
        const card = document.querySelector('.search-item-card[aria-label*="Quantum Spatial Canvas"]');
        if (!card) return { found: false };
        const url = card.getAttribute('data-url');
        card.click();
        return { found: true, url };
      })()
    `);
    await sleep(1500);
    await captureScreenshot('e2e_board_opened_from_search.png');

    const boardPageCheck = await evaluate(`
      (() => {
        return {
          hash: window.location.hash,
          hasViewport: !!document.getElementById('spatial-board-wrapper') && !!document.getElementById('board-toolbar')
        };
      })()
    `);
    assert.strictEqual(boardClickResult.found, true, 'Board card must be rendered in search results');
    assert.strictEqual(boardClickResult.url, `/projects/${PROJ_ALICE_ID}/board`, 'Board card data-url must be /projects/:projectId/board');
    assert.strictEqual(boardPageCheck.hash, `#/projects/${PROJ_ALICE_ID}/board`, 'Clicking Board search result must navigate to #/projects/:projectId/board');
    assert.strictEqual(boardPageCheck.hasViewport, true, 'Spatial Board canvas must load on navigation');

    // Also verify Board whose entities.primary_project_id is NULL (resolved from boards.project_id)
    const fallbackBoardRes = await evaluate(`
      (async () => {
        const data = await window.API.get('/search?q=Fallback');
        return data.results.boards;
      })()
    `);
    assert(fallbackBoardRes && fallbackBoardRes.length >= 1, 'Fallback board must be returned by /api/v1/search');
    assert.strictEqual(fallbackBoardRes[0].project_id, PROJ_ALICE_ID, 'Board project_id must be resolved from boards.project_id when primary_project_id is null');
    console.log(`  ✅ PASSED [Browser 7]: Board search results navigate to /projects/${PROJ_ALICE_ID}/board and load the Spatial Board`);

    // Check 9: Existing navigation commands in Ctrl+K still work
    await evaluate(`window.CommandPalette.open()`);
    await sleep(300);
    await evaluate(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.value = 'Go to Overview';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(400);
    const navCmdResult = await evaluate(`
      (() => {
        const items = Array.from(document.querySelectorAll('.command-palette-item'));
        const navItem = items.find(el => el.innerText.includes('Go to Overview Dashboard'));
        if (!navItem) return { found: false };
        navItem.click();
        return { found: true };
      })()
    `);
    await sleep(800);
    const finalHash = await evaluate(`window.location.hash`);
    assert.strictEqual(navCmdResult.found, true, 'Existing navigation command "Go to Overview Dashboard" must be present');
    assert.strictEqual(finalHash, '#/overview', 'Clicking navigation command must navigate to #/overview');
    console.log('  ✅ PASSED [Browser 9]: Existing navigation commands in Ctrl+K remain functional');

    assert.strictEqual(uncaughtExceptions.length, 0, `Expected 0 browser exceptions, got: ${uncaughtExceptions.join('; ')}`);
    console.log('  ✅ PASSED: 0 uncaught browser exceptions across all interactions');

    console.log('\n================================================================');
    console.log('  🎉 ALL UNIVERSAL SEARCH E2E VERIFICATION TESTS PASSED (9/9)');
    console.log('================================================================\n');
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill('SIGKILL');
    await cleanupFixtures(pool);
    await pool.end();
  }
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ UNIVERSAL SEARCH E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
