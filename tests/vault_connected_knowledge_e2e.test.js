// tests/vault_connected_knowledge_e2e.test.js
// Real MySQL 8.4.13 + Real Headless Chrome Verification for Knowledge Vault 2.0: Connected Knowledge & Unified Help System

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const authConfig = require('../server/config/auth');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_vault_e2e');

const TEST_USER_ID = 89201;
const TEST_PROJ_ID = 89211;
const TEST_NOTE_A_ID = 89221;
const TEST_NOTE_B_ID = 89222;
const TEST_TASK_ID = 89231;

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
    await conn.query('DELETE FROM entity_links WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM smart_connections WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM note_versions WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM tasks WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM notes WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM entities WHERE owner_user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM project_entities WHERE added_by = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM project_members WHERE user_id = ?', [TEST_USER_ID]);
    await conn.query('DELETE FROM projects WHERE user_id = ?', [TEST_USER_ID]);
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
      (?, 'vault_connected_tester@flowden.test', 'hash', 'Vault Connected Tester', 'user')
    `, [TEST_USER_ID]);

    // 2. Project
    await conn.query(`
      INSERT INTO projects (id, user_id, title, description, status) VALUES
      (?, ?, 'Distributed Systems Research', 'Core research on distributed consensus', 'active')
    `, [TEST_PROJ_ID, TEST_USER_ID]);

    // 3. Project Membership
    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES
      (?, ?, 'owner', NULL)
    `, [TEST_PROJ_ID, TEST_USER_ID]);

    // 4. Note A
    await conn.query(`
      INSERT INTO notes (id, user_id, project_id, folder_id, title, content, is_pinned, word_count, created_at, updated_at) VALUES
      (?, ?, ?, NULL, 'Distributed Consensus Core', '# Distributed Consensus Core\n\nFoundational notes on Paxos and Raft consensus algorithms and state machine replication.', 0, 16, NOW(), NOW())
    `, [TEST_NOTE_A_ID, TEST_USER_ID, TEST_PROJ_ID]);

    // 5. Note B
    await conn.query(`
      INSERT INTO notes (id, user_id, project_id, folder_id, title, content, is_pinned, word_count, created_at, updated_at) VALUES
      (?, ?, ?, NULL, 'Raft Protocol Implementation', '# Raft Protocol Implementation\n\nPractical implementation considerations for leader election, log replication, and safety.', 0, 14, NOW(), NOW())
    `, [TEST_NOTE_B_ID, TEST_USER_ID, TEST_PROJ_ID]);

    // 6. Connected Task
    await conn.query(`
      INSERT INTO tasks (id, user_id, project_id, title, description, status, priority, created_at, updated_at) VALUES
      (?, ?, ?, 'Verify Quorum Invariants', 'Write TLA+ specifications for Raft safety invariants', 'planned', 'high', NOW(), NOW())
    `, [TEST_TASK_ID, TEST_USER_ID, TEST_PROJ_ID]);

    // Canonical entities
    await conn.query(`
      INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES
      ('uuid-note-89221', 'note', ?, ?, ?, 'Distributed Consensus Core', 'Distributed Consensus Core Paxos Raft', NOW(), NOW()),
      ('uuid-note-89222', 'note', ?, ?, ?, 'Raft Protocol Implementation', 'Raft Protocol Implementation leader election', NOW(), NOW()),
      ('uuid-task-89231', 'task', ?, ?, ?, 'Verify Quorum Invariants', 'Verify Quorum Invariants TLA+ specs', NOW(), NOW())
    `, [TEST_NOTE_A_ID, TEST_USER_ID, TEST_PROJ_ID, TEST_NOTE_B_ID, TEST_USER_ID, TEST_PROJ_ID, TEST_TASK_ID, TEST_USER_ID, TEST_PROJ_ID]);

    // Link Task to Note A
    await conn.query(`
      INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at) VALUES
      (?, 'note', ?, 'task', ?, 'relates_to', 'task_sync', 1, NOW(), NOW())
    `, [TEST_USER_ID, TEST_NOTE_A_ID, TEST_TASK_ID]);

  } finally {
    conn.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN KNOWLEDGE VAULT 2.0 & UNIFIED HELP E2E VERIFICATION');
  console.log('  Environment: Real MySQL 8.4.13 + Real Headless Chrome');
  console.log('================================================================\n');

  const pool = await createPool();
  const [[dbMeta]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS ver');
  console.log(`[MySQL] Connected to database="${dbMeta.db}", version="${dbMeta.ver}"`);
  assert.strictEqual(dbMeta.db, 'flowden_test', 'Must run against flowden_test');
  assert(dbMeta.ver.startsWith('8.4'), 'Must run against MySQL 8.4.x');

  await cleanupFixtures(pool);
  await seedFixtures(pool);

  const userToken = jwt.sign(
    { id: TEST_USER_ID, email: 'vault_connected_tester@flowden.test', role: 'user' },
    authConfig.jwtSecret,
    { expiresIn: '1h' }
  );

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];
  const failedRequests = [];

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9228',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9228/json');
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
        if (resp.status >= 500) {
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

    async function evalScript(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        const ex = res.exceptionDetails;
        const desc = ex.exception ? (ex.exception.description || ex.exception.value) : ex.text;
        throw new Error(desc || 'Eval error');
      }
      return res.result ? res.result.value : undefined;
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    // ------------------------------------------------------------------------
    // Part 1: Navigate to Knowledge Vault & Open Note A
    // ------------------------------------------------------------------------
    console.log('[Step 1: Navigating to Knowledge Vault and Opening Note A]');
    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${TEST_NOTE_A_ID}` });
    await sleep(2000);

    const loc = await evalScript(`window.location.href`);
    console.log(`  Current location: ${loc}`);
    const bodySnippet = await evalScript(`document.body.innerHTML.slice(0, 300)`);
    console.log(`  Body snippet: ${bodySnippet}`);

    const activeNoteTitle = await evalScript(`document.getElementById('note-title-input')?.value`);
    assert.strictEqual(activeNoteTitle, 'Distributed Consensus Core', 'Note A must be loaded and active');
    console.log(`  Active Note: "${activeNoteTitle}"`);

    // Verify Connected Tasks regression: existing task is still rendered
    const connectedTasksText = await evalScript(`document.getElementById('vault-connected-tasks-list')?.textContent`);
    assert(connectedTasksText.includes('Verify Quorum Invariants'), 'Connected task must remain intact');
    console.log('  ✅ PASSED: Existing Connected Tasks intact');

    // ------------------------------------------------------------------------
    // Part 2: Connect Note A to Note B via UI
    // ------------------------------------------------------------------------
    console.log('[Step 2: Connecting Note A to Note B via Connect Note action]');
    const connectBtnExists = await evalScript(`!!document.getElementById('btn-vault-connect-note')`);
    assert.strictEqual(connectBtnExists, true, 'Connect Note button must exist in toolbar');

    // Click Connect Note button
    await evalScript(`document.getElementById('btn-vault-connect-note').click()`);
    await sleep(600);

    // Verify modal is open
    const modalTitle = await evalScript(`document.querySelector('.modal-title')?.textContent`);
    console.log(`  Modal opened with title: "${modalTitle}"`);
    assert(modalTitle.includes('Connect Note'), 'Modal title must indicate Connect Note');

    // Select relationship type 'supports'
    await evalScript(`(() => {
      const sel = document.getElementById('modal-conn-relationship');
      if (sel) {
        sel.value = 'supports';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Click on Note B in candidate list
    await evalScript(`(() => {
      const row = document.querySelector('.modal-note-option-row[data-id="${TEST_NOTE_B_ID}"]');
      if (row) row.click();
    })()`);
    await sleep(300);

    // Click "Connect Note" button in modal footer
    await evalScript(`(() => {
      const btns = Array.from(document.querySelectorAll('.modal-footer button'));
      const connBtn = btns.find(b => b.textContent.includes('Connect Note'));
      if (connBtn) connBtn.click();
    })()`);
    await sleep(1000);

    // ------------------------------------------------------------------------
    // Part 3: Verify Relationship in MySQL entity_links
    // ------------------------------------------------------------------------
    console.log('[Step 3: Verifying Semantic Relationship in MySQL entity_links]');
    const [links] = await pool.query(`
      SELECT * FROM entity_links
      WHERE user_id = ? AND source_type = 'note' AND target_type = 'note' AND deleted_at IS NULL
    `, [TEST_USER_ID]);

    assert.strictEqual(links.length, 1, 'Exactly one semantic note relationship must be stored in entity_links');
    assert.strictEqual(links[0].source_id, TEST_NOTE_A_ID, 'Source must be Note A');
    assert.strictEqual(links[0].target_id, TEST_NOTE_B_ID, 'Target must be Note B');
    assert.strictEqual(links[0].link_type, 'supports', 'Link type must be "supports"');
    console.log(`  ✅ PASSED: Stored in entity_links (id=${links[0].id}, link_type=${links[0].link_type})`);

    // ------------------------------------------------------------------------
    // Part 4: Verify Bidirectional Relationship Display in Both Notes
    // ------------------------------------------------------------------------
    console.log('[Step 4: Verifying Bidirectional Relationship Visibility]');
    // Note A should display "Supports → Raft Protocol Implementation"
    const noteAConns = await evalScript(`document.getElementById('vault-connected-notes-list')?.textContent`);
    console.log(`  Note A Connected Notes Tray: "${noteAConns.trim()}"`);
    assert(noteAConns.includes('Raft Protocol Implementation'), 'Note A must display Note B');
    assert(noteAConns.includes('Supports') || noteAConns.includes('supports'), 'Note A must show relationship "Supports"');

    // Click the connected note pill to navigate directly to Note B
    console.log('  Navigating to connected Note B by clicking pill...');
    await evalScript(`(() => {
      const pill = document.querySelector('.connected-note-pill .note-conn-title');
      if (pill) pill.click();
    })()`);
    await sleep(1000);

    const noteBTitle = await evalScript(`document.getElementById('note-title-input')?.value`);
    assert.strictEqual(noteBTitle, 'Raft Protocol Implementation', 'Must open Note B upon clicking connected note pill');

    // Note B should display "Supports ← Distributed Consensus Core"
    const noteBConns = await evalScript(`document.getElementById('vault-connected-notes-list')?.textContent`);
    console.log(`  Note B Connected Notes Tray: "${noteBConns.trim()}"`);
    assert(noteBConns.includes('Distributed Consensus Core'), 'Note B must display Note A');
    console.log('  ✅ PASSED: Bidirectional relationship displayed without duplicate edges in database');

    // ------------------------------------------------------------------------
    // Part 5: Knowledge Graph Integration
    // ------------------------------------------------------------------------
    console.log('[Step 5: Verifying Knowledge Graph Integration]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/graph' });
    await sleep(2000);

    const graphStats = await evalScript(`
      (() => {
        // Query API directly to verify graph data contracts
        return fetch('/api/v1/graph', {
          headers: { 'Authorization': 'Bearer ${userToken}' }
        }).then(r => r.json());
      })()
    `);

    const noteANode = graphStats.nodes.find(n => n.rawId === TEST_NOTE_A_ID && n.type === 'note');
    const noteBNode = graphStats.nodes.find(n => n.rawId === TEST_NOTE_B_ID && n.type === 'note');
    assert(noteANode !== undefined, 'Note A must exist as node in Knowledge Graph');
    assert(noteBNode !== undefined, 'Note B must exist as node in Knowledge Graph');
    assert.strictEqual(noteANode.link, `#/vault/${TEST_NOTE_A_ID}`, 'Note A node link must point to Note A');

    // Verify private / unauthorized notes belonging to other users are excluded
    const [otherUserNotes] = await pool.query(`
      SELECT id FROM notes WHERE user_id != ? AND deleted_at IS NULL LIMIT 1
    `, [TEST_USER_ID]);
    if (otherUserNotes.length > 0) {
      const unauthorizedId = otherUserNotes[0].id;
      const unauthInGraph = graphStats.nodes.find(n => n.rawId === unauthorizedId);
      assert.strictEqual(unauthInGraph, undefined, 'Unauthorized / other user notes must be strictly excluded from graph');
      console.log(`  Security check passed: unauthorized note id=${unauthorizedId} excluded from user graph`);
    }

    // Verify relationship edge connects note_A and note_B
    const semanticEdge = graphStats.edges.find(e =>
      (e.source === `note_${TEST_NOTE_A_ID}` && e.target === `note_${TEST_NOTE_B_ID}`) ||
      (e.source === `note_${TEST_NOTE_B_ID}` && e.target === `note_${TEST_NOTE_A_ID}`)
    );
    assert(semanticEdge !== undefined, 'Canonical semantic relationship must appear as an edge in Knowledge Graph');
    assert.strictEqual(semanticEdge.relationship, 'supports', 'Edge relationship must match link_type');
    console.log(`  Found Knowledge Graph Edge: id=${semanticEdge.id}, relationship=${semanticEdge.relationship}`);
    console.log('  ✅ PASSED: Knowledge Graph correctly visualizes entity_links relationships');

    // ------------------------------------------------------------------------
    // Part 6: Unified Knowledge Vault Help System (Menu & Feature Explainers)
    // ------------------------------------------------------------------------
    console.log('[Step 6: Verifying Unified Knowledge Vault Help System]');
    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${TEST_NOTE_A_ID}` });
    await sleep(1500);

    // Open Help Hub
    await evalScript(`document.getElementById('btn-vault-help').click()`);
    await sleep(600);

    const helpHubTitle = await evalScript(`document.querySelector('.modal-title')?.textContent`);
    assert(helpHubTitle.includes('Help & Tour Hub'), 'Help Hub modal must open');

    // Click on "Connect Note" feature row in Help Hub to inspect contextual explainer
    await evalScript(`(() => {
      const row = document.querySelector('.vault-help-item-row[data-id="connect-note"]');
      if (row) row.click();
    })()`);
    await sleep(600);

    const explainerTitle = await evalScript(`document.querySelector('.modal-title')?.textContent`);
    const explainerBody = await evalScript(`document.querySelector('.modal-body')?.textContent`);
    assert(explainerTitle.includes('Connect Note'), 'Explainer must open for Connect Note');
    assert(explainerBody.includes('What It Does'), 'Explainer must explain What It Does');
    assert(explainerBody.includes('When To Use It'), 'Explainer must explain When To Use It');
    assert(explainerBody.includes('Practical Example'), 'Explainer must provide practical example');
    console.log(`  Explainer verified for: "${explainerTitle}"`);

    // Close modal
    await evalScript(`document.querySelector('.modal-close-btn')?.click()`);
    await sleep(400);

    // Also inspect contextual explainer for Knowledge Graph
    await evalScript(`window.VaultHelpCatalog.showFeatureExplainer('knowledge-graph')`);
    await sleep(600);

    const kgExplainerTitle = await evalScript(`document.querySelector('.modal-title')?.textContent`);
    const kgExplainerBody = await evalScript(`document.querySelector('.modal-body')?.textContent`);
    assert(kgExplainerTitle.includes('Knowledge Graph'), 'Explainer must open for Knowledge Graph');
    assert(kgExplainerBody.includes('What It Does'), 'Explainer must explain What It Does for Knowledge Graph');
    console.log(`  Explainer verified for: "${kgExplainerTitle}"`);

    // Close modal
    await evalScript(`document.querySelector('.modal-close-btn')?.click()`);
    await sleep(400);

    // ------------------------------------------------------------------------
    // Part 7: Knowledge Vault Interactive Tour Walkthrough (All 8 Steps)
    // ------------------------------------------------------------------------
    console.log('[Step 7: Verifying Knowledge Vault 8-Step Interactive Tour]');
    // Start vault tour
    await evalScript(`window.FlowdenTour.start('vault')`);
    await sleep(600);

    const tourActive = await evalScript(`window.FlowdenTour.isActive()`);
    assert.strictEqual(tourActive, true, 'FlowdenTour must be active');

    // Step 1: Note List and Folders
    const s1Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 1: "${s1Title}"`);
    assert(s1Title.includes('Note List and Folders'), 'Step 1 must be Note List and Folders');

    // Step 2: Editor layout and current Edit, Split, Read modes
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(600);
    const s2Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 2: "${s2Title}"`);
    assert(s2Title.includes('Edit, Split, Read'), 'Step 2 must be Modes');

    // Step 3: Existing Formatting Tools
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(600);
    const s3Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 3: "${s3Title}"`);
    assert(s3Title.includes('Formatting Tools'), 'Step 3 must be Formatting Tools');

    // Step 4: Connect Note
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(600);
    const s4Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 4: "${s4Title}"`);
    assert(s4Title.includes('Connect Note'), 'Step 4 must be Connect Note');

    // Step 5: Connected Notes and Backlinks
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(600);
    const s5Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 5: "${s5Title}"`);
    assert(s5Title.includes('Connected Notes and Backlinks'), 'Step 5 must be Connected Notes and Backlinks');

    // Step 6: Unlinked Mentions
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(600);
    const s6Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Tour Step 6: "${s6Title}"`);
    assert(s6Title.includes('Unlinked Mentions'), 'Step 6 must be Unlinked Mentions');

    // Step 7: Knowledge Graph (Navigates to /graph)
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(1000);
    const s7Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    const s7Route = await evalScript(`window.location.hash`);
    console.log(`  Tour Step 7: "${s7Title}" on route "${s7Route}"`);
    assert(s7Title.includes('Knowledge Graph'), 'Step 7 must be Knowledge Graph');
    assert(s7Route.includes('graph'), 'Tour must navigate to Knowledge Graph route');

    // Step 8: Connected Tasks (Navigates back to /vault)
    await evalScript(`document.getElementById('btn-tour-next')?.click()`);
    await sleep(1200);
    const s8Title = await evalScript(`document.getElementById('tour-title')?.textContent`);
    const s8Route = await evalScript(`window.location.hash`);
    console.log(`  Tour Step 8: "${s8Title}" on route "${s8Route}"`);
    assert(s8Title.includes('Connected Tasks'), 'Step 8 must be Connected Tasks');
    assert(s8Route.includes('vault'), 'Tour must navigate back to Knowledge Vault route');

    // Test Back button (returns to Step 7 Knowledge Graph)
    await evalScript(`document.getElementById('btn-tour-prev')?.click()`);
    await sleep(1000);
    const backStepTitle = await evalScript(`document.getElementById('tour-title')?.textContent`);
    console.log(`  Back button returned to: "${backStepTitle}"`);
    assert(backStepTitle.includes('Knowledge Graph'), 'Back button must return to Step 7 Knowledge Graph');

    // Skip / End tour
    await evalScript(`document.getElementById('btn-tour-skip')?.click()`);
    await sleep(500);
    const tourEnded = await evalScript(`!window.FlowdenTour.isActive()`);
    assert.strictEqual(tourEnded, true, 'Tour must close upon Skip');
    console.log('  ✅ PASSED: Interactive tour walkthrough verified with Next, Back, and Skip across Vault & Graph routes');

    // ------------------------------------------------------------------------
    // Part 8: Flowden Guide Integration & Restarting Vault Tour
    // ------------------------------------------------------------------------
    console.log('[Step 8: Verifying Flowden Guide Integration & Tour Restart]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/guide' });
    await sleep(1500);

    const guideVaultBtn = await evalScript(`!!document.getElementById('btn-start-vault-tour')`);
    assert.strictEqual(guideVaultBtn, true, 'Flowden Guide must have "Start Knowledge Vault Tour" button');

    // Click "Start Knowledge Vault Tour" from Guide
    await evalScript(`document.getElementById('btn-start-vault-tour').click()`);
    await sleep(1000);

    const tourRestartedFromGuide = await evalScript(`window.FlowdenTour.isActive() && window.FlowdenTour.getTourType() === 'vault'`);
    assert.strictEqual(tourRestartedFromGuide, true, 'Knowledge Vault tour must start from Guide and navigate to Vault');
    console.log('  ✅ PASSED: Vault tour successfully restarted from Flowden Guide');

    // Close tour
    await evalScript(`window.FlowdenTour.endTour()`);
    await sleep(400);

    // ------------------------------------------------------------------------
    // Part 9: Unlinking Notes & Confirming Non-Destructive Behavior
    // ------------------------------------------------------------------------
    console.log('[Step 9: Unlinking Notes and Confirming Non-Destructive Behavior]');
    // Navigate back to Note A
    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${TEST_NOTE_A_ID}` });
    await sleep(1500);

    // Auto-accept confirm dialog for unlinking
    await evalScript(`window.confirm = () => true`);

    // Click unlink button
    await evalScript(`(() => {
      const unlinkBtn = document.querySelector('.connected-note-pill .btn-unlink-note');
      if (unlinkBtn) unlinkBtn.click();
    })()`);
    await sleep(1000);

    // Verify entity_links in MySQL is deleted
    const [linksAfterUnlink] = await pool.query(`
      SELECT * FROM entity_links
      WHERE user_id = ? AND source_type = 'note' AND target_type = 'note' AND deleted_at IS NULL
    `, [TEST_USER_ID]);
    assert.strictEqual(linksAfterUnlink.length, 0, 'Relationship must be removed from entity_links');

    // Verify BOTH original notes still exist and are NOT deleted
    const [notesCheck] = await pool.query(`
      SELECT id, title, deleted_at FROM notes WHERE id IN (?, ?)
    `, [TEST_NOTE_A_ID, TEST_NOTE_B_ID]);
    assert.strictEqual(notesCheck.length, 2, 'Both original notes must remain intact in database');
    assert.strictEqual(notesCheck[0].deleted_at, null, 'Note A must not be deleted');
    assert.strictEqual(notesCheck[1].deleted_at, null, 'Note B must not be deleted');
    console.log('  ✅ PASSED: Unlinking successfully removed edge while leaving both notes intact');

    // Verify edge is gone from Knowledge Graph
    const graphStatsAfter = await evalScript(`
      fetch('/api/v1/graph', {
        headers: { 'Authorization': 'Bearer ${userToken}' }
      }).then(r => r.json())
    `);
    const edgeAfter = graphStatsAfter.edges.find(e =>
      (e.source === `note_${TEST_NOTE_A_ID}` && e.target === `note_${TEST_NOTE_B_ID}`) ||
      (e.source === `note_${TEST_NOTE_B_ID}` && e.target === `note_${TEST_NOTE_A_ID}`)
    );
    assert.strictEqual(edgeAfter, undefined, 'Edge must be removed from Knowledge Graph');
    console.log('  ✅ PASSED: Edge automatically removed from Knowledge Graph');

    // ------------------------------------------------------------------------
    // Part 10: Capture Screenshot & Verify Zero Exceptions
    // ------------------------------------------------------------------------
    console.log('[Step 10: Capturing Screenshot & Checking Console Health]');
    // Re-connect Note A to Note B for visual artifact
    await pool.query(`
      INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at) VALUES
      (?, 'note', ?, 'note', ?, 'supports', 'manual', 1, NOW(), NOW())
    `, [TEST_USER_ID, TEST_NOTE_A_ID, TEST_NOTE_B_ID]);

    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${TEST_NOTE_A_ID}` });
    await sleep(1500);

    const screenshotRes = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    const screenshotPath = path.join(ARTIFACT_DIR, 'vault_connected_knowledge.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`  Saved screenshot: ${screenshotPath}`);

    assert.strictEqual(uncaughtExceptions.length, 0, 'No uncaught exceptions allowed');
    assert.strictEqual(failedRequests.length, 0, 'No HTTP 5xx responses allowed');
    console.log('  ✅ PASSED: Zero browser exceptions and zero server errors');

    console.log('\n================================================================');
    console.log('  🎉 ALL 10 KNOWLEDGE VAULT 2.0 ACCEPTANCE CRITERIA PASSED');
    console.log('================================================================');

  } finally {
    if (ws) {
      try { ws.terminate(); } catch (e) {}
    }
    if (chrome) {
      try { chrome.kill(); } catch (e) {}
    }
    await sleep(400);
    await cleanupFixtures(pool);
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
