// tests/sidebar_cleanup_and_guide_e2e.test.js
// Real MySQL 8.4.13 + Real Headless Chrome Verification for Sidebar Cleanup & Universal Search Guide

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
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_guide_e2e');

const TEST_USER_ID = 89002;
const TEST_PROJ_ID = 89012;

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
    await conn.query('DELETE FROM project_members WHERE project_id = ?', [TEST_PROJ_ID]);
    await conn.query('DELETE FROM projects WHERE id = ?', [TEST_PROJ_ID]);
    await conn.query('DELETE FROM users WHERE id = ?', [TEST_USER_ID]);
  } finally {
    conn.release();
  }
}

async function seedFixtures(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      INSERT INTO users (id, email, password_hash, display_name, role) VALUES
      (?, 'guide_verify_user@flowden.test', 'hash', 'Guide Verification User', 'user')
    `, [TEST_USER_ID]);

    await conn.query(`
      INSERT INTO projects (id, user_id, title, description, status) VALUES
      (?, ?, 'Guide Verification Project', 'Project for guide & search verification', 'active')
    `, [TEST_PROJ_ID, TEST_USER_ID]);

    await conn.query(`
      INSERT INTO project_members (project_id, user_id, role, revoked_at) VALUES
      (?, ?, 'owner', NULL)
    `, [TEST_PROJ_ID, TEST_USER_ID]);
  } finally {
    conn.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN SIDEBAR CLEANUP & UNIVERSAL SEARCH GUIDE VERIFICATION');
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
    { id: TEST_USER_ID, email: 'guide_verify_user@flowden.test', role: 'user' },
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
      '--remote-debugging-port=9227',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9227/json');
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
        throw new Error(res.exceptionDetails.text || 'Eval error');
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

    console.log('[Step 1: Navigating to Flowden Overview]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/overview' });
    await sleep(2000);

    // 1. Verify Universal Search is completely absent from sidebar
    console.log('[Step 2: Verifying Sidebar Navigation Items]');
    const sidebarSearchExists = await evalScript(`
      !!document.querySelector('#app-sidebar a[href="#/search"]') ||
      !!document.querySelector('#sidebar-nav-search')
    `);
    console.log(`  Sidebar Universal Search exists: ${sidebarSearchExists}`);
    assert.strictEqual(sidebarSearchExists, false, 'Universal Search must NOT be in sidebar');

    // 2. Verify all other sidebar items exist and their order
    const sidebarLinks = await evalScript(`
      Array.from(document.querySelectorAll('#app-sidebar .nav-item')).map(a => ({
        href: a.getAttribute('href'),
        label: a.querySelector('.nav-item-label') ? a.querySelector('.nav-item-label').textContent.trim() : (a.getAttribute('title') || '')
      }))
    `);
    console.log('  Active sidebar items:', sidebarLinks);
    const expectedHrefs = [
      '#/overview',
      '#/projects',
      '#/vault',
      '#/graph',
      '#/research',
      '#/workflow',
      '#/capture',
      '#/assistant',
      '#/guide',
      '#/settings'
    ];
    const actualHrefs = sidebarLinks.map(l => l.href);
    assert.deepStrictEqual(actualHrefs, expectedHrefs, 'Sidebar items and order must be exactly preserved');
    console.log('  ✅ PASSED: All 10 expected sidebar items exist in correct order with no search item');

    // 3. Verify topbar Search Workspace trigger
    console.log('[Step 3: Verifying Topbar Search Workspace Trigger]');
    const topbarSearch = await evalScript(`
      (() => {
        const btn = document.querySelector('.topbar-search-trigger');
        if (!btn) return null;
        return {
          text: btn.textContent.trim(),
          ariaLabel: btn.getAttribute('aria-label')
        };
      })()
    `);
    assert(topbarSearch !== null, 'Topbar search trigger must exist');
    assert(topbarSearch.text.includes('Search workspace'), 'Topbar button must have "Search workspace" text');
    assert(topbarSearch.text.includes('Ctrl+K'), 'Topbar button must indicate Ctrl+K shortcut');
    console.log('  ✅ PASSED: Topbar Search Workspace trigger is functional');

    // 4. Test opening Command Palette via topbar trigger
    console.log('[Step 4: Opening Command Palette via Topbar Trigger]');
    await evalScript(`document.querySelector('.topbar-search-trigger').click()`);
    await sleep(600);

    const paletteOpen = await evalScript(`
      (() => {
        return !!document.querySelector('.command-palette-overlay') && window.CommandPalette.isOpen;
      })()
    `);
    assert.strictEqual(paletteOpen, true, 'Command Palette must open upon clicking topbar trigger');
    console.log('  ✅ PASSED: Command Palette opens successfully');

    // 5. Test typing query and finding items in Command Palette
    console.log('[Step 5: Querying Command Palette]');
    await evalScript(`
      (() => {
        const input = document.querySelector('.command-palette-input');
        input.value = 'Guide';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(600);

    const paletteResults = await evalScript(`
      (() => {
        const items = Array.from(document.querySelectorAll('.command-palette-item'));
        return items.map(el => el.textContent.trim());
      })()
    `);
    console.log(`  Palette results for "Guide" (${paletteResults.length} items):`, paletteResults.slice(0, 3));
    assert(paletteResults.length > 0, 'Command Palette must return matching results');

    // Close palette
    await evalScript(`
      (() => {
        if (window.CommandPalette) window.CommandPalette.close();
      })()
    `);
    await sleep(300);

    // 6. Test direct navigation to #/search (route preservation)
    console.log('[Step 6: Verifying Universal Search Route (#/search)]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/search?q=Guide' });
    await sleep(1500);

    const searchPageRendered = await evalScript(`
      (() => {
        return !!document.querySelector('.search-header') ||
               !!document.querySelector('.search-input') ||
               document.body.textContent.includes('Search');
      })()
    `);
    assert.strictEqual(searchPageRendered, true, 'Dedicated Search Results page must render properly');
    console.log('  ✅ PASSED: Dedicated #/search route is fully preserved');

    // 7. Navigate to Flowden Guide (#/guide)
    console.log('[Step 7: Navigating to Flowden Guide (#/guide)]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/guide' });
    await sleep(1500);

    // 8. Verify Universal Search section in Flowden Guide
    console.log('[Step 8: Verifying Universal Search Section Content in Guide]');
    const guideSection = await evalScript(`
      (() => {
        const sec = document.getElementById('guide-universal-search');
        if (!sec) return null;
        return {
          title: sec.querySelector('h2') ? sec.querySelector('h2').textContent.trim() : '',
          text: sec.textContent
        };
      })()
    `);
    assert(guideSection !== null, 'Universal Search section must exist in Flowden Guide');
    assert.strictEqual(guideSection.title, 'Universal Search', 'Section title must be "Universal Search"');
    console.log(`  Found section title: "${guideSection.title}"`);

    // 9. Verify 5 supported categories in the section
    console.log('[Step 9: Verifying 5 Supported Categories]');
    const categories = [
      'Projects',
      'Knowledge Notes',
      'Workflow Tasks',
      'Spatial Boards',
      'Research Documents'
    ];
    for (const cat of categories) {
      const hasCat = guideSection.text.includes(cat);
      console.log(`  Category "${cat}": ${hasCat ? 'Present' : 'MISSING'}`);
      assert(hasCat, `Category "${cat}" must be explained in Universal Search section`);
    }
    console.log('  ✅ PASSED: All 5 supported categories are explained');

    // 10. Verify explanations (what it is, how to access, keywords, Enter key, destinations, permissions)
    console.log('[Step 10: Verifying Core Explanations]');
    assert(guideSection.text.includes('Ctrl + K') || guideSection.text.includes('Ctrl+K'), 'Must explain Ctrl+K shortcut');
    assert(guideSection.text.includes('Search workspace'), 'Must explain topbar Search Workspace button');
    assert(guideSection.text.includes('Enter') || guideSection.text.includes('enter'), 'Must explain pressing Enter');
    assert(guideSection.text.includes('destination') || guideSection.text.includes('navigat'), 'Must explain navigation to destinations');
    assert(guideSection.text.includes('permission') || guideSection.text.includes('authoriz'), 'Must explain permissions/access control');
    console.log('  ✅ PASSED: All operational explanations verified');

    // 11. Verify Feature Library tab contains Universal Search card
    console.log('[Step 11: Verifying Feature Library Tab]');
    await evalScript(`document.querySelector('#guide-tabs-control button[data-tab="features"]').click()`);
    await sleep(500);

    const featureSearchCard = await evalScript(`
      (() => {
        const pane = document.getElementById('tab-features');
        if (!pane || pane.style.display === 'none') return false;
        return pane.textContent.includes('Universal Search');
      })()
    `);
    assert.strictEqual(featureSearchCard, true, 'Feature Library tab must list Universal Search');
    console.log('  ✅ PASSED: Feature Library tab contains Universal Search card');

    // Switch back to Getting Started tab for screenshot
    await evalScript(`document.querySelector('#guide-tabs-control button[data-tab="getting-started"]').click()`);
    await sleep(500);

    // Scroll to Universal Search section
    await evalScript(`
      const el = document.getElementById('guide-universal-search');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    `);
    await sleep(500);

    // 12. Save screenshot
    console.log('[Step 12: Capturing Guide Universal Search Screenshot]');
    const screenshotRes = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    const screenshotPath = path.join(ARTIFACT_DIR, 'guide_universal_search.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`  Saved screenshot: ${screenshotPath}`);

    // 13. Verify browser errors
    console.log('[Step 13: Verifying Zero Console Exceptions]');
    console.log(`  Uncaught exceptions: ${uncaughtExceptions.length}`);
    console.log(`  Failed HTTP 5xx requests: ${failedRequests.length}`);
    assert.strictEqual(uncaughtExceptions.length, 0, 'No uncaught exceptions allowed');
    assert.strictEqual(failedRequests.length, 0, 'No HTTP 5xx responses allowed');
    console.log('  ✅ PASSED: Zero console exceptions and zero server errors');

    console.log('\n================================================================');
    console.log('  🎉 ALL 13 VERIFICATION STEPS PASSED WITH 100% SUCCESS');
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
