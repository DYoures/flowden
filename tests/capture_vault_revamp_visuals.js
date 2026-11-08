// tests/capture_vault_revamp_visuals.js
// Real Headless Chrome Capture for Knowledge Vault 2.0 Visual Revamp & Advanced Editor

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_vault_revamp');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN KNOWLEDGE VAULT 2.0 VISUAL REVAMP & EDITOR VERIFICATION');
  console.log('  Target: 7 Browser Screenshots across 1440x900 and 1280x720');
  console.log('================================================================\n');

  // Generate test user token
  const testUserId = 1;
  const userToken = jwt.sign(
    { id: testUserId, email: 'alex.founder@flowden.io', role: 'admin' },
    authConfig.jwtSecret,
    { expiresIn: '2h' }
  );

  // Setup sample rich knowledge note via REST API
  const sampleNoteContent = [
    '# Distributed Consensus Architecture',
    '',
    '> [!NOTE]',
    '> This document outlines the core architecture of our consensus mechanism, comparing Paxos, Raft, and Byzantine Fault Tolerance.',
    '',
    '## System Invariants and Safety Guarantees',
    '',
    'State machine replication relies on ensuring that no two nodes commit differing transitions at identical log indices.',
    '',
    '- [x] Implement deterministic state transition log',
    '- [x] Verify quorum calculation under partition',
    '- [ ] Benchmark network heartbeats across availability zones',
    '',
    '### Protocol Properties',
    '',
    '| Property | Paxos | Raft | Flowden Core |',
    '| --- | --- | --- | --- |',
    '| Leader Election | Randomized retry | Randomized election timer | Multi-tiered heartbeat |',
    '| Log Matching | Slot agreement | Prefix invariant | Continuous merkle verification |',
    '| Complexity | High | Understandable | Modular & Verified |',
    '',
    'For concrete implementation details, inspect [[Raft Protocol Implementation]] and cross-reference with [[Byzantine Tolerance Analysis]].',
    '',
    '```javascript',
    'function verifyQuorum(nodes, responses) {',
    '  const majority = Math.floor(nodes.length / 2) + 1;',
    '  return responses.filter(r => r.granted).length >= majority;',
    '}',
    '```'
  ].join('\n');

  console.log('[1/4] Provisioning Rich Vault Note via API...');
  let createdNoteId = null;
  let targetNoteBId = null;
  try {
    const createRes = await fetch('http://localhost:3000/api/v1/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        title: 'Distributed Consensus Architecture',
        content: sampleNoteContent
      })
    });
    const createData = await createRes.json();
    createdNoteId = createData.note ? createData.note.id : null;
    console.log(`  Created Note 1: id=${createdNoteId}`);

    // Create Note 2 for connection
    const createBRes = await fetch('http://localhost:3000/api/v1/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        title: 'Raft Protocol Implementation',
        content: '# Raft Protocol Implementation\n\nLeader election and invariant verification logic.'
      })
    });
    const createBData = await createBRes.json();
    targetNoteBId = createBData.note ? createBData.note.id : null;
    console.log(`  Created Note 2: id=${targetNoteBId}`);

    // Establish connection
    if (createdNoteId && targetNoteBId) {
      await fetch(`http://localhost:3000/api/v1/notes/${createdNoteId}/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          targetNoteId: targetNoteBId,
          relationship: 'supports'
        })
      });
      console.log('  Established semantic connection: Note 1 -> supports -> Note 2');

      // Create connected task
      await fetch(`http://localhost:3000/api/v1/notes/${createdNoteId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          title: 'Implement Quorum Verification Spec',
          description: 'Formal verification with TLA+',
          status: 'in_progress',
          priority: 'high'
        })
      });
      console.log('  Connected Workflow Task: "Implement Quorum Verification Spec"');
    }
  } catch (err) {
    console.error('  Failed to seed fixtures via API:', err);
  }

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];

  try {
    console.log('\n[2/4] Launching Real Headless Chrome...');
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9229',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9229/json');
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
        console.error(`  Browser Exception: ${desc}`);
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

    // Set auth cookie
    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    console.log('\n[3/4] Navigating to Knowledge Vault and Capturing Visual Artifacts...');

    // Navigate to Vault with the seeded note
    const targetUrl = createdNoteId ? `http://localhost:3000/app.html#/vault/${createdNoteId}` : 'http://localhost:3000/app.html#/vault';
    await send('Page.navigate', { url: targetUrl });
    await sleep(2500);

    async function capture(fileName, label) {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const fullPath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(fullPath, Buffer.from(res.data, 'base64'));
      console.log(`  📸 [${label}] -> ${fileName} (${fs.statSync(fullPath).size} bytes)`);
    }

    // 1. vault_workspace_overview.png (Overview of Three-Zone Layout)
    console.log('  Capturing 1: Vault Workspace Overview (1440x900)...');
    await capture('vault_workspace_overview.png', '1/7 Workspace Overview');

    // 2. vault_wysiwyg_edit.png (Active Note in WYSIWYG Edit mode)
    console.log('  Capturing 2: WYSIWYG Edit Mode...');
    await evalScript(`
      (() => {
        const editBtn = document.getElementById('mode-btn-edit');
        if (editBtn) editBtn.click();
      })()
    `);
    await sleep(600);
    await capture('vault_wysiwyg_edit.png', '2/7 WYSIWYG Edit Mode');

    // 3. vault_split_mode.png (Side-by-side editing and live preview)
    console.log('  Capturing 3: Split Mode...');
    await evalScript(`
      (() => {
        const splitBtn = document.getElementById('mode-btn-split');
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(600);
    await capture('vault_split_mode.png', '3/7 Split Mode');

    // 4. vault_read_mode.png (Clean Read Mode)
    console.log('  Capturing 4: Read Presentation Mode...');
    await evalScript(`
      (() => {
        const readBtn = document.getElementById('mode-btn-read');
        if (readBtn) readBtn.click();
      })()
    `);
    await sleep(600);
    await capture('vault_read_mode.png', '4/7 Read Presentation Mode');

    // Return to Edit mode
    await evalScript(`
      (() => {
        const editBtn = document.getElementById('mode-btn-edit');
        if (editBtn) editBtn.click();
      })()
    `);
    await sleep(400);

    // 5. vault_slash_commands.png (Formatting toolbar and active floating Slash Commands menu)
    console.log('  Capturing 5: Floating Slash Commands Menu...');
    await evalScript(`
      (() => {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        if (canvas) {
          canvas.focus();
          // Place cursor and trigger slash menu
          const p = document.createElement('p');
          p.id = 'slash-trigger-p';
          p.innerHTML = '/';
          canvas.appendChild(p);

          // Dispatch input event with slash
          const evt = new KeyboardEvent('keyup', { key: '/', bubbles: true });
          canvas.dispatchEvent(evt);
        }
      })()
    `);
    await sleep(800);
    await capture('vault_slash_commands.png', '5/7 Slash Commands Palette');

    // Clean up temporary slash trigger
    await evalScript(`
      (() => {
        const p = document.getElementById('slash-trigger-p');
        if (p) p.remove();
        const menu = document.getElementById('vault-slash-palette');
        if (menu) menu.remove();
      })()
    `);
    await sleep(300);

    // 6. vault_inspector_connections.png (Connections tab: Connected Notes, Backlinks, Unlinked Mentions, Tasks)
    console.log('  Capturing 6: Right Inspector Connections Tab...');
    await evalScript(`
      (() => {
        const inspector = document.getElementById('vault-inspector-pane');
        if (inspector) inspector.style.display = 'flex';
        const connTab = document.getElementById('tab-btn-connections');
        if (connTab) connTab.click();
      })()
    `);
    await sleep(600);
    await capture('vault_inspector_connections.png', '6/7 Inspector Connections');

    // 7. vault_inspector_outline.png (Outline tab: Headings tree with click-to-scroll)
    console.log('  Capturing 7: Right Inspector Outline Tab...');
    await evalScript(`
      (() => {
        const outlineTab = document.getElementById('tab-btn-outline');
        if (outlineTab) outlineTab.click();
      })()
    `);
    await sleep(600);
    await capture('vault_inspector_outline.png', '7/7 Inspector Outline');

    // Also verify at 1280x720 viewport
    console.log('\n[4/4] Verifying Responsiveness at 1280x720 Viewport...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);
    await capture('vault_responsive_1280x720.png', 'Responsive 1280x720 View');

    console.log('\n================================================================');
    console.log('  🎉 ALL 7 VISUAL ARTIFACTS CAPTURED & SAVED SUCCESSFULLY');
    console.log(`  Uncaught Browser Exceptions: ${uncaughtExceptions.length}`);
    console.log('================================================================');

  } finally {
    if (ws) {
      try { ws.terminate(); } catch (e) {}
    }
    if (chrome) {
      try { chrome.kill(); } catch (e) {}
    }
  }
}

main().catch(err => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});
