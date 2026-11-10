// tests/benchmark_graph_performance.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_bench');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  let chrome = null;
  let ws = null;

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    // 1. Get or create a session token
    const email = 'graph_bench_' + Date.now() + '@flowden.test';
    const regRes = await fetch('http://127.0.0.1:3000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: 'Bench User', password: 'Password123!Safe' })
    });
    const regData = await regRes.json();
    const token = regData.token;

    // 2. Import solar-system-research.md
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
    commitForm.append('idempotency_key', 'solar_bench_' + Date.now());

    await fetch('http://127.0.0.1:3000/api/v1/exchange/commit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: commitForm
    });

    console.log('Project imported for bench. Launching Chrome...');

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9235',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1600,1050',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9235/json');
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

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: token,
      domain: '127.0.0.1',
      path: '/'
    });

    console.log('Navigating to http://127.0.0.1:3000/app.html#/graph...');
    await send('Page.navigate', { url: 'http://127.0.0.1:3000/app.html#/graph' });

    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const evalRes = await send('Runtime.evaluate', {
          expression: 'document.querySelectorAll(".graph-node-circle").length'
        });
        if ((evalRes.result.value || 0) >= 30) break;
      } catch (e) {}
    }

    await sleep(1000);

    // Run in-browser benchmark
    const benchResult = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async () => {
          const results = {};

          // Measure 1: Selection latency (clicking 10 different nodes in succession)
          const nodeEls = Array.from(document.querySelectorAll('.graph-node-circle')).slice(0, 10);
          
          const selStart = performance.now();
          for (const el of nodeEls) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
          }
          results.selectionTime10Nodes = performance.now() - selStart;

          // Measure 2: Hover latency (hovering 20 nodes in succession)
          const hoverStart = performance.now();
          for (let i = 0; i < 20; i++) {
            const el = nodeEls[i % nodeEls.length];
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          }
          results.hoverTime20Ops = performance.now() - hoverStart;

          // Measure 3: Dragging simulation (50 mousemove steps)
          const firstNode = nodeEls[0];
          firstNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 500, clientY: 500 }));
          const dragStart = performance.now();
          for (let s = 1; s <= 50; s++) {
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 500 + s * 2, clientY: 500 + s * 2, buttons: 1 }));
          }
          results.dragTime50Steps = performance.now() - dragStart;
          window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

          // Measure 4: Auto-Arrange execution time
          const autoArrangeBtn = document.getElementById('btn-graph-auto-arrange');
          const arrangeStart = performance.now();
          autoArrangeBtn.click();
          results.autoArrangeTime = performance.now() - arrangeStart;

          return results;
        })()
      `
    });

    console.log('BENCHMARK RESULTS:', JSON.stringify(benchResult.result.value, null, 2));

  } catch (err) {
    console.error('Benchmark error:', err);
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
  }
})();

