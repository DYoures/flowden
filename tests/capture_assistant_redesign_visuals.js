// tests/capture_assistant_redesign_visuals.js
// Visual inspection and screenshot capture for Flowden AI Assistant Premium UI/UX Redesign
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const User = require('../server/models/User');
const authConfig = require('../server/config/auth');
const serverModule = require('../server/index');

const TEST_PORT = 3089;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.chrome_assistant_visuals');
const ARTIFACT_DIR = 'C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  let serverInstance = null;
  let chromeProcess = null;
  let ws = null;
  let msgId = 1;
  const callbacks = new Map();
  const consoleErrors = [];
  const pageErrors = [];

  function sendCmd(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await sendCmd('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (r && r.exceptionDetails) {
      console.warn(`JS Evaluate Warning: ${JSON.stringify(r.exceptionDetails)} in: ${expr}`);
    }
    return r && r.result ? r.result.value : undefined;
  }

  async function captureScreenshot(filename) {
    const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      const fullPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
      console.log(`  📸 Screenshot saved: ${filename} (${shot.data.length} bytes)`);
      return fullPath;
    }
    throw new Error(`Failed to capture screenshot: ${filename}`);
  }

  async function setViewport(width, height) {
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });
    await sleep(250);
  }

  try {
    console.log('\n================================================================');
    console.log('FLOWDEN AI ASSISTANT — VISUAL VERIFICATION & SCREENSHOT CAPTURE');
    console.log('================================================================\n');

    await db.initDB();

    // 1. Create a real authenticated test user with MCP configured
    const runSuffix = Date.now().toString(36);
    const testEmail = `designer_${runSuffix}@flowden.test`;
    const passwordHash = await bcrypt.hash('DesignPass123!', 10);
    const testUser = await User.create({
      email: testEmail,
      display_name: 'Lead Product Designer',
      password_hash: passwordHash
    });
    const userId = testUser.id;

    // Create 2 test projects
    const p1 = await db.query(
      `INSERT INTO projects (user_id, title, description, color, status) VALUES (?, 'Urban Heat Island Mitigation', 'Adaptive cooling strategies', '#78C8B2', 'active')`,
      [userId]
    );
    const p2 = await db.query(
      `INSERT INTO projects (user_id, title, description, color, status) VALUES (?, 'Autonomous Agent Systems', 'Multi-model orchestration', '#3b82f6', 'active')`,
      [userId]
    );

    // Save MCP settings for this user
    const mcpConfig = {
      serverUrl: 'http://localhost:3000/mcp',
      apiKey: 'fld_mcp_live_token_designer_preview_99199',
      scope: 'read_only',
      enabledProjects: [p1.insertId, p2.insertId],
      projectFilterActive: true
    };
    await db.query(
      'UPDATE users SET settings_json = ? WHERE id = ?',
      [JSON.stringify({ mcp: mcpConfig }), userId]
    );

    const userToken = jwt.sign(
      { id: userId, email: testEmail, role: 'member' },
      authConfig.jwtSecret,
      { expiresIn: '3h' }
    );

    console.log(`  User Created: ID=${userId}, Email=${testEmail}`);

    // 2. Start Express Server
    const app = serverModule.app || serverModule;
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        console.log(`Express server running at ${BASE_URL}`);
        resolve();
      });
    });

    // Clean user data dir
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    // Launch Chrome CDP on port 9265
    const chromeArgs = [
      '--headless=new',
      '--remote-debugging-port=9265',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1440,950',
      'about:blank'
    ];

    chromeProcess = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      try {
        const res = await fetch('http://127.0.0.1:9265/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
    }

    if (!targets || targets.length === 0) {
      throw new Error('Could not connect to Chrome DevTools port 9265');
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    console.log(`  Connected to Chrome page target: ${pageTarget.id}`);

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        const txt = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        if (!txt.includes('favicon.ico')) {
          consoleErrors.push(txt);
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params?.exceptionDetails?.text || 'Uncaught Exception');
      }
      if (msg.id && callbacks.has(msg.id)) {
        const resolve = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        resolve(msg.result || {});
      }
    };

    await sendCmd('Page.enable');
    await sendCmd('Runtime.enable');
    await sendCmd('Network.enable');

    // Set auth cookie for domain localhost
    await sendCmd('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    // Navigate to app.html#/assistant
    await sendCmd('Page.navigate', { url: `${BASE_URL}/app.html#/assistant` });
    await sleep(2000);

    // Set localStorage cache as well
    await evaluate(`(() => {
      localStorage.setItem('flowden_token', ${JSON.stringify(userToken)});
      localStorage.setItem('flowden_user', JSON.stringify({
        id: ${userId},
        email: ${JSON.stringify(testEmail)},
        display_name: 'Lead Product Designer'
      }));
      localStorage.setItem('flowden_theme', 'dark');
    })()`);

    // Ensure page container is rendered
    await sleep(1000);

    // -------------------------------------------------------------------------
    // VIEWPORT 1: DESKTOP (1440 × 950)
    // -------------------------------------------------------------------------
    console.log('\n[Capturing Desktop Viewports — 1440 × 950]');
    await setViewport(1440, 950);

    // 1. Overview View
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-overview') || document.querySelector('a[href="#ai-overview"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_desktop_overview.png');

    // 2. MCP Integration View
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-mcp') || document.querySelector('a[href="#mcp-integration"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_desktop_mcp.png');

    // 3. MCP Security Details Expanded
    await evaluate(`(() => {
      const secSection = document.getElementById('security-privacy-responsible-ai-section');
      if (secSection) {
        secSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_desktop_mcp_security_expanded.png');

    // 4. Knowledge Exchange View
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-exchange') || document.querySelector('a[href="#knowledge-exchange"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_desktop_knowledge_exchange.png');

    // 5. Knowledge Exchange Advanced Documentation Expanded
    await evaluate(`(() => {
      document.querySelectorAll('#knowledge-exchange details').forEach(d => d.open = true);
      const docsCard = document.querySelector('#knowledge-exchange details');
      if (docsCard) docsCard.scrollIntoView({ behavior: 'instant', block: 'start' });
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_desktop_ke_advanced_docs_expanded.png');

    // -------------------------------------------------------------------------
    // VIEWPORT 2: TABLET (768 × 1024)
    // -------------------------------------------------------------------------
    console.log('\n[Capturing Tablet Viewport — 768 × 1024]');
    await setViewport(768, 1024);
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-overview') || document.querySelector('a[href="#ai-overview"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_tablet_overview.png');

    // -------------------------------------------------------------------------
    // VIEWPORT 3: MOBILE (375 × 812)
    // -------------------------------------------------------------------------
    console.log('\n[Capturing Mobile Viewports — 375 × 812]');
    await setViewport(375, 812);

    // Mobile Screenshot 1: Overview
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-overview') || document.querySelector('a[href="#ai-overview"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_mobile_overview.png');

    // Mobile Screenshot 2: MCP Integration
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-mcp') || document.querySelector('a[href="#mcp-integration"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_mobile_mcp.png');

    // Mobile Screenshot 3: Knowledge Exchange
    await evaluate(`(() => {
      const tab = document.querySelector('#tab-btn-exchange') || document.querySelector('a[href="#knowledge-exchange"]');
      if (tab) tab.click();
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTop = 0;
      window.scrollTo(0, 0);
    })()`);
    await sleep(500);
    await captureScreenshot('assistant_redesign_mobile_knowledge_exchange.png');

    // Audit for console / page errors
    console.log('\n[Console & Network Error Audit]');
    console.log(`  Console Errors: ${consoleErrors.length}`);
    console.log(`  Page Exceptions: ${pageErrors.length}`);

    if (consoleErrors.length > 0) {
      console.warn('  ⚠️ Console errors detected:', consoleErrors);
    }
    if (pageErrors.length > 0) {
      console.warn('  ⚠️ Page exceptions detected:', pageErrors);
    }

    console.log('\n================================================================');
    console.log('✅ ALL SCREENSHOTS SUCCESSFULLY CAPTURED');
    console.log('================================================================\n');

    process.exit(0);

  } catch (err) {
    console.error('Fatal error during visual capture:', err);
    process.exit(1);
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (chromeProcess) {
      try { chromeProcess.kill('SIGKILL'); } catch (e) {}
    }
    if (serverInstance) {
      serverInstance.close();
    }
  }
})();
