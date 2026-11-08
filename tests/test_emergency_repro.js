const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.chrome_emergency_test');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  await db.initDB();
  const users = await db.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
  const user = users[0];
  const userToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    authConfig.jwtSecret,
    { expiresIn: '7d' }
  );

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9240',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await sleep(2000);

  const versionRes = await fetch('http://127.0.0.1:9240/json/version');
  const versionData = await versionRes.json();
  console.log('[Chrome]', versionData.Browser);

  const listRes = await fetch('http://127.0.0.1:9240/json/list');
  const targets = await listRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const callbacks = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
      console.log(`[Browser Console ${msg.params.type}]`, text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', JSON.stringify(msg.params.exceptionDetails));
    }
    if (msg.id && callbacks.has(msg.id)) {
      const resolve = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      resolve(msg.result || {});
    }
  };

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
      throw new Error(JSON.stringify(r.exceptionDetails));
    }
    return r && r.result ? r.result.value : undefined;
  }

  await sendCmd('Page.enable');
  await sendCmd('DOM.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('Network.enable');

  await sendCmd('Network.setCookie', {
    name: 'flowden_token',
    value: userToken,
    domain: 'localhost',
    path: '/'
  });

  console.log('[Navigating to Vault note 5]');
  await sendCmd('Page.navigate', { url: 'http://localhost:3000/app.html#/vault/5' });
  await sleep(2500);

  // Set note content to have raw URL, mention, bookmark, embed
  const setupResult = await evaluate(`(() => {
    const ed = window.vaultEditorInstance;
    if (!ed) return { error: 'no-editorInstance' };

    const testMd = [
      '# Test Note with Links',
      '',
      'Raw link: https://flowden.org',
      '',
      'Markdown link: [Flowden Link](https://flowden.org)',
      '',
      '[mention: GitHub](https://github.com)',
      '',
      '[bookmark: Flowden Workspace](https://flowden.org "Flowden description")',
      '',
      '[embed: youtube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
      '',
      '[@note:5:Test Note]'
    ].join('\\n');

    ed.setContentMarkdown(testMd);

    const canvas = document.getElementById('vault-wysiwyg-canvas');
    return {
      canvasHtml: canvas.innerHTML
    };
  })()`);

  console.log('[Setup Result from Markdown]\n', setupResult.canvasHtml);

  // Test what happens when we click each element
  const clickDiagnostics = await evaluate(`(() => {
    const results = [];
    let openedUrl = null;
    let windowLocationHash = null;
    const origOpen = window.open;
    window.open = (u) => { openedUrl = u; };

    // 1. Click on raw link (from plain text 'Raw link: https://flowden.org')
    const rawParagraph = Array.from(document.querySelectorAll('.vault-block')).find(b => b.textContent.includes('Raw link:'));
    if (rawParagraph) {
      openedUrl = null;
      const a = rawParagraph.querySelector('a');
      results.push({ item: 'rawUrl in paragraph', hasAnchor: !!a, text: rawParagraph.textContent });
    }

    // 2. Click on markdown link
    const mdLink = document.querySelector('a.editor-link');
    if (mdLink) {
      openedUrl = null;
      mdLink.click();
      results.push({ item: 'mdLink.click()', openedUrl, href: mdLink.getAttribute('href') });
    }

    // 3. Click on mention link
    const mentionLink = document.querySelector('.vault-mention-link');
    if (mentionLink) {
      openedUrl = null;
      mentionLink.click();
      results.push({ item: 'mentionLink.click()', openedUrl });
    }

    // 4. Click on bookmark card
    const bmarkCard = document.querySelector('.vault-bookmark-card');
    if (bmarkCard) {
      // Click title
      openedUrl = null;
      const title = bmarkCard.querySelector('.vault-bookmark-title');
      if (title) title.click();
      results.push({ item: 'bmarkTitle.click()', openedUrl });

      // Click domain
      openedUrl = null;
      const domain = bmarkCard.querySelector('.vault-bookmark-domain');
      if (domain) domain.click();
      results.push({ item: 'bmarkDomain.click()', openedUrl });

      // Click card
      openedUrl = null;
      bmarkCard.click();
      results.push({ item: 'bmarkCard.click()', openedUrl });
    }

    // 5. Click on YouTube thumbnail
    const ytThumb = document.querySelector('.vault-yt-thumb-wrapper');
    if (ytThumb) {
      ytThumb.click();
      const iframe = document.querySelector('.vault-yt-active-iframe');
      results.push({ item: 'ytThumb.click()', hasIframe: !!iframe });
    }

    window.open = origOpen;
    return results;
  })()`);

  console.log('[Click Diagnostics from Markdown]', JSON.stringify(clickDiagnostics, null, 2));

  // Now test right-click and right-drag in Knowledge Vault
  const kvDragTest = await evaluate(`(() => {
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    if (!canvas) return { error: 'no-canvas' };

    // Dispatch contextmenu on canvas
    const ev = new MouseEvent('contextmenu', { button: 2, clientX: 200, clientY: 200, bubbles: true, cancelable: true });
    canvas.dispatchEvent(ev);
    const contextMenuPrevented = ev.defaultPrevented;

    return {
      contextMenuPrevented,
      hasVaultMarquee: !!document.getElementById('vault-selection-marquee')
    };
  })()`);

  console.log('[KV Drag Test]', JSON.stringify(kvDragTest, null, 2));

  ws.close();
  chrome.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
