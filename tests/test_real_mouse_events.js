const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.chrome_emergency_mouse');

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
    '--remote-debugging-port=9241',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await sleep(2000);

  const listRes = await fetch('http://127.0.0.1:9241/json/list');
  const targets = await listRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const callbacks = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
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

  await sendCmd('Page.navigate', { url: 'http://localhost:3000/app.html#/vault/5' });
  await sleep(2500);

  // Setup content
  await evaluate(`(() => {
    const ed = window.vaultEditorInstance;
    const testMd = [
      '# Test Note for Real Mouse',
      '',
      '[Flowden Link](https://flowden.org)',
      '',
      '[mention: GitHub](https://github.com)',
      '',
      '[bookmark: Flowden Workspace](https://flowden.org "Flowden description")',
      '',
      '[embed: youtube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'
    ].join('\\n');
    ed.setContentMarkdown(testMd);
  })()`);
  await sleep(500);

  // Track window.open calls
  await evaluate(`(() => {
    window.__openedUrls = [];
    window.open = (u) => { window.__openedUrls.push(u); };
  })()`);

  // Get coordinates of the elements
  const coords = await evaluate(`(() => {
    const link = document.querySelector('a.editor-link');
    const mention = document.querySelector('.vault-mention-link');
    const bookmark = document.querySelector('.vault-bookmark-card');
    const playBtn = document.querySelector('.vault-yt-play-btn');

    function getCenter(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    }

    return {
      link: getCenter(link),
      mention: getCenter(mention),
      bookmark: getCenter(bookmark),
      playBtn: getCenter(playBtn)
    };
  })()`);

  console.log('[Element Coords]', coords);

  // Dispatch real mouse click on Link
  if (coords.link) {
    await sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.link.x, y: coords.link.y, button: 'left', clickCount: 1 });
    await sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.link.x, y: coords.link.y, button: 'left', clickCount: 1 });
    await sleep(200);
  }

  // Dispatch real mouse click on Mention
  if (coords.mention) {
    await sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.mention.x, y: coords.mention.y, button: 'left', clickCount: 1 });
    await sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.mention.x, y: coords.mention.y, button: 'left', clickCount: 1 });
    await sleep(200);
  }

  // Dispatch real mouse click on Bookmark
  if (coords.bookmark) {
    await sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.bookmark.x, y: coords.bookmark.y, button: 'left', clickCount: 1 });
    await sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.bookmark.x, y: coords.bookmark.y, button: 'left', clickCount: 1 });
    await sleep(200);
  }

  // Dispatch real mouse click on YouTube Play button
  if (coords.playBtn) {
    await sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.playBtn.x, y: coords.playBtn.y, button: 'left', clickCount: 1 });
    await sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.playBtn.x, y: coords.playBtn.y, button: 'left', clickCount: 1 });
    await sleep(300);
  }

  const results = await evaluate(`(() => {
    const hasIframe = !!document.querySelector('.vault-yt-active-iframe');
    return {
      openedUrls: window.__openedUrls,
      hasIframe
    };
  })()`);

  console.log('[Real Mouse Click Results]', results);

  ws.close();
  chrome.kill();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

