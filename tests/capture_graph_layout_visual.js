// tests/capture_graph_layout_visual.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_graph_visual');
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'knowledge_graph_spacious_layout.png');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  let chrome = null;
  let ws = null;

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    // Register / login user to get a fresh token from running server
    const email = 'graph_viewer_' + Date.now() + '@flowden.test';
    const regRes = await fetch('http://127.0.0.1:3000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: 'Solar System Viewer', password: 'Password123!Safe' })
    });
    const regData = await regRes.json();
    const token = regData.token;

    // Import solar-system-research.md
    const solarMdPath = path.resolve(__dirname, '../docs/knowledge-exchange/examples/solar-system-research.md');
    const inspectForm = new FormData();
    inspectForm.append('file', new Blob([fs.readFileSync(solarMdPath)], { type: 'text/markdown' }), 'solar-system-research.md');

    const inspectRes = await fetch('http://127.0.0.1:3000/api/v1/exchange/inspect', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: inspectForm
    });
    const inspectData = await inspectRes.json();

    const commitForm = new FormData();
    commitForm.append('inspection_token', inspectData.inspection_token);
    commitForm.append('package_sha256', inspectData.package_sha256);
    commitForm.append('import_mode', 'new_project');
    commitForm.append('approved', 'true');
    commitForm.append('idempotency_key', 'solar_visual_' + Date.now());

    await fetch('http://127.0.0.1:3000/api/v1/exchange/commit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: commitForm
    });

    console.log('Project imported for test user. Launching Chrome...');

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9229',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1600,1050',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9229/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
      await sleep(250);
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
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Network.enable');
    await send('Page.enable');

    // Set auth cookie
    await send('Network.setCookie', {
      name: 'flowden_token',
      value: token,
      domain: '127.0.0.1',
      path: '/'
    });

    // Navigate to Knowledge Graph
    console.log('Navigating to http://127.0.0.1:3000/app.html#/graph...');
    await send('Page.navigate', { url: 'http://127.0.0.1:3000/app.html#/graph' });

    // Wait for graph DOM to render nodes
    let nodeCount = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      try {
        const evalRes = await send('Runtime.evaluate', {
          expression: 'document.querySelectorAll(".graph-node-circle").length'
        });
        nodeCount = evalRes.result.value || 0;
        if (nodeCount >= 30) {
          console.log(`Rendered ${nodeCount} graph nodes in DOM.`);
          break;
        }
      } catch (e) {}
    }

    // Allow layout settling and fitView animation to complete
    await sleep(2500);

    // Capture screenshot
    const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshotRes.data, 'base64');
    fs.writeFileSync(SCREENSHOT_PATH, buffer);
    console.log(`Saved screenshot to ${SCREENSHOT_PATH} (${buffer.length} bytes)`);

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
    process.exit(0);
  }
})();
