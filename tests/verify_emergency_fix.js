const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.chrome_emergency_verify');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('[1/5] Initializing test DB & generating admin auth token...');
  await db.initDB();
  const users = await db.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
  const user = users[0];
  const userToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    authConfig.jwtSecret,
    { expiresIn: '7d' }
  );

  console.log('[2/5] Launching Chrome headless instance...');
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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
      // console.log(`[Browser Console ${msg.params.type}]`, text);
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

  const testReport = {
    task1_smart_link_clicks: {},
    task2_vault_block_selection: {},
    regressions: {}
  };

  console.log('[3/5] Navigating to Knowledge Vault Note 5...');
  await sendCmd('Page.navigate', { url: 'http://localhost:3000/app.html#/vault/5' });
  await sleep(2500);

  // Setup rich document with various block types
  await evaluate(`(() => {
    const ed = window.vaultEditorInstance;
    if (!ed) return;

    const testDoc = [
      '# Architectural Blueprint',
      '',
      'First paragraph with bare URL: https://flowden.org and more notes.',
      '',
      'Second paragraph with markdown link: [Official Site](https://flowden.org)',
      '',
      '> [!NOTE]',
      '> This is a callout block to verify selection.',
      '',
      '[mention: Flowden Mention](https://flowden.org)',
      '',
      '[bookmark: Flowden Workspace](https://flowden.org "A unified workspace for tasks and notes")',
      '',
      '[embed: youtube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
      '',
      '[@note:5:Architectural Blueprint]'
    ].join('\\n');

    ed.setContentMarkdown(testDoc);
  })()`);
  await sleep(500);

  console.log('[4/5] Executing TASK 1: Smart Link & Clicks Verification...');

  // Test 1.1: Clicking Bare URL
  const test1_1 = await evaluate(`(() => {
    let opened = null;
    const orig = window.open;
    window.open = (u) => { opened = u; };
    const linkWrapper = document.querySelector('.vault-link-wrapper a.editor-link');
    if (linkWrapper) linkWrapper.click();
    window.open = orig;
    return { opened, target: !!linkWrapper };
  })()`);
  testReport.task1_smart_link_clicks.bare_url_click = (test1_1.opened === 'https://flowden.org');

  // Test 1.2: Clicking Markdown Link
  const test1_2 = await evaluate(`(() => {
    let opened = null;
    const orig = window.open;
    window.open = (u) => { opened = u; };
    const links = Array.from(document.querySelectorAll('a.editor-link'));
    const mdLink = links.find(a => a.textContent.includes('Official Site'));
    if (mdLink) mdLink.click();
    window.open = orig;
    return { opened, target: !!mdLink };
  })()`);
  testReport.task1_smart_link_clicks.markdown_link_click = (test1_2.opened === 'https://flowden.org');

  // Test 1.3: Clicking Mention Chip
  const test1_3 = await evaluate(`(() => {
    let opened = null;
    const orig = window.open;
    window.open = (u) => { opened = u; };
    const mention = document.querySelector('.vault-mention-link');
    if (mention) mention.click();
    window.open = orig;
    return { opened, target: !!mention };
  })()`);
  testReport.task1_smart_link_clicks.mention_click = (test1_3.opened === 'https://flowden.org');

  // Test 1.4: Clicking Bookmark Card components (Title, Domain, Card Background)
  const test1_4 = await evaluate(`(() => {
    const results = {};
    const orig = window.open;
    const bmark = document.querySelector('.vault-bookmark-card');
    if (!bmark) return { error: 'no-bmark' };

    let opened = null;
    window.open = (u) => { opened = u; };
    const title = bmark.querySelector('.vault-bookmark-title');
    if (title) title.click();
    results.title_click = opened;

    opened = null;
    const domain = bmark.querySelector('.vault-bookmark-domain');
    if (domain) domain.click();
    results.domain_click = opened;

    opened = null;
    bmark.click();
    results.card_body_click = opened;

    window.open = orig;
    return results;
  })()`);
  testReport.task1_smart_link_clicks.bookmark_title_click = (test1_4.title_click === 'https://flowden.org');
  testReport.task1_smart_link_clicks.bookmark_domain_click = (test1_4.domain_click === 'https://flowden.org');
  testReport.task1_smart_link_clicks.bookmark_card_body_click = (test1_4.card_body_click === 'https://flowden.org');

  // Test 1.5: Clicking Convert Trigger opens Convert Menu WITHOUT opening URL
  const test1_5 = await evaluate(`(() => {
    let opened = null;
    const orig = window.open;
    window.open = (u) => { opened = u; };
    const trigger = document.querySelector('.vault-bookmark-card .vault-link-convert-trigger');
    if (trigger) trigger.click();
    window.open = orig;
    const menu = document.getElementById('vault-link-convert-menu');
    const isMenuVisible = !!menu;
    if (menu) menu.remove();
    return { opened, isMenuVisible };
  })()`);
  testReport.task1_smart_link_clicks.convert_trigger_isolated = (test1_5.opened === null && test1_5.isMenuVisible === true);

  // Test 1.6: YouTube Thumbnail Play Button swaps active iframe
  const test1_6 = await evaluate(`(() => {
    const ytThumb = document.querySelector('.vault-yt-thumb-wrapper');
    if (!ytThumb) return { error: 'no-yt-thumb' };
    ytThumb.click();
    const iframe = document.querySelector('.vault-yt-active-iframe');
    return {
      hasIframe: !!iframe,
      src: iframe ? iframe.getAttribute('src') : null
    };
  })()`);
  testReport.task1_smart_link_clicks.youtube_play_activates_iframe = (test1_6.hasIframe === true && test1_6.src.includes('autoplay=1'));

  // Test 1.7: YouTube Toolbar "Open on YouTube" link
  const test1_7 = await evaluate(`(() => {
    let opened = null;
    const orig = window.open;
    window.open = (u) => { opened = u; };
    const outlink = document.querySelector('.vault-yt-outlink');
    if (outlink) outlink.click();
    window.open = orig;
    return { opened };
  })()`);
  testReport.task1_smart_link_clicks.youtube_outlink_click = (test1_7.opened && test1_7.opened.includes('youtube.com'));

  // Test 1.8: Conversion without duplicate content
  const test1_8 = await evaluate(`(async () => {
    const ed = window.vaultEditorInstance;
    ed.setContentMarkdown('Convert me: https://flowden.org');
    const trigger = document.querySelector('.vault-link-convert-trigger');
    if (!trigger) return { error: 'no-trigger' };
    trigger.click();
    await new Promise(r => setTimeout(r, 100));

    // Choose Bookmark
    const choice = document.querySelector('.vault-convert-choice[data-to="bookmark"]');
    if (choice) choice.click();
    await new Promise(r => setTimeout(r, 400));

    const finalMd = ed.getContentMarkdown();
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    const bmarks = canvas.querySelectorAll('.vault-bookmark-card');
    const canvasText = canvas.textContent;
    const duplicateTextCount = (canvasText.match(/Convert me:/g) || []).length;

    return {
      finalMd,
      bookmarkCount: bmarks.length,
      duplicateTextCount,
      canvasText
    };
  })()`);
  console.log('[Test 1.8 result]', JSON.stringify(test1_8));
  testReport.task1_smart_link_clicks.conversion_no_duplicate = (test1_8.bookmarkCount === 1 && test1_8.duplicateTextCount === 1);

  console.log('[5/5] Executing TASK 2: Knowledge Vault Right-Drag Selection Box & Marquee...');

  // Reset document with multiple block types
  await evaluate(`(() => {
    const ed = window.vaultEditorInstance;
    const multiBlockDoc = [
      '# Heading Block Alpha',
      '',
      'Paragraph Block Beta with some text to drag over.',
      '',
      '> [!NOTE]',
      '> Callout Block Gamma with important notes.',
      '',
      '- List Item Delta 1',
      '- List Item Delta 2'
    ].join('\\n');
    ed.setContentMarkdown(multiBlockDoc);
  })()`);
  await sleep(500);

  // Test 2.1: Native Context Menu Suppression on Knowledge Vault Canvas
  const test2_1 = await evaluate(`(() => {
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    const p = canvas.querySelector('p');
    const ev = new MouseEvent('contextmenu', {
      button: 2,
      clientX: 300,
      clientY: 300,
      bubbles: true,
      cancelable: true
    });
    p.dispatchEvent(ev);
    return {
      defaultPrevented: ev.defaultPrevented
    };
  })()`);
  testReport.task2_vault_block_selection.context_menu_suppressed = (test2_1.defaultPrevented === true);

  // Test 2.2: Real Right-Drag Marquee Selection over Paragraph & Heading
  const blockCoords = await evaluate(`(() => {
    const h1 = document.querySelector('h1.vault-block');
    const p = document.querySelector('p.vault-block');
    const callout = document.querySelector('.vault-callout');
    const h1Rect = h1.getBoundingClientRect();
    const pRect = p.getBoundingClientRect();
    const cRect = callout ? callout.getBoundingClientRect() : pRect;

    return {
      startX: Math.round(pRect.left + 20),
      startY: Math.round(h1Rect.top - 10),
      midX: Math.round(pRect.right - 20),
      midY: Math.round(cRect.bottom + 10)
    };
  })()`);

  // Simulate hardware right pointer down, move, and up using CDP Input
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'right',
    buttons: 2,
    x: blockCoords.startX,
    y: blockCoords.startY
  });
  await sleep(50);

  // Move right mouse button to trigger marquee
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'right',
    buttons: 2,
    x: blockCoords.midX,
    y: blockCoords.midY
  });
  await sleep(100);

  // Inspect marquee state while dragging
  const test2_2_active = await evaluate(`(() => {
    const marquee = document.getElementById('vault-selection-marquee');
    const isMarqueeVisible = marquee && marquee.style.display !== 'none';
    const selectedBlocks = Array.from(document.querySelectorAll('.vault-block--selected')).map(b => b.getAttribute('data-block-type'));
    const isBodyActive = document.body.classList.contains('vault-marquee-active');

    return {
      isMarqueeVisible,
      isBodyActive,
      selectedBlocks
    };
  })()`);

  testReport.task2_vault_block_selection.marquee_drawn_while_dragging = test2_2_active.isMarqueeVisible === true;
  testReport.task2_vault_block_selection.body_marquee_active_class = test2_2_active.isBodyActive === true;
  testReport.task2_vault_block_selection.blocks_intersected = test2_2_active.selectedBlocks.length >= 2;

  // Release right mouse button
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'right',
    buttons: 0,
    x: blockCoords.midX,
    y: blockCoords.midY
  });
  await sleep(100);

  // Inspect selection state after release
  const test2_2_released = await evaluate(`(() => {
    const marquee = document.getElementById('vault-selection-marquee');
    const isMarqueeHidden = !marquee || marquee.style.display === 'none';
    const selectedCount = document.querySelectorAll('.vault-block--selected').length;
    return {
      isMarqueeHidden,
      selectedCount
    };
  })()`);

  testReport.task2_vault_block_selection.marquee_hidden_on_release = test2_2_released.isMarqueeHidden === true;
  testReport.task2_vault_block_selection.selection_persists_after_release = test2_2_released.selectedCount >= 2;

  // Test 2.3: Left-click clears selection
  const emptyCanvasCoords = await evaluate(`(() => {
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    const r = canvas.getBoundingClientRect();
    return { x: Math.round(r.right - 30), y: Math.round(r.bottom - 20) };
  })()`);

  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    buttons: 1,
    x: emptyCanvasCoords.x,
    y: emptyCanvasCoords.y
  });
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    buttons: 0,
    x: emptyCanvasCoords.x,
    y: emptyCanvasCoords.y
  });
  await sleep(100);

  const test2_3 = await evaluate(`(() => {
    return {
      selectedCount: document.querySelectorAll('.vault-block--selected').length
    };
  })()`);
  testReport.task2_vault_block_selection.left_click_clears_selection = (test2_3.selectedCount === 0);

  // Test 2.4: Selection on All Block Types (Paragraph, Heading, List, Callout)
  // Marquee across whole document surface
  const canvasBounds = await evaluate(`(() => {
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    const r = canvas.getBoundingClientRect();
    return {
      startX: Math.round(r.left + 15),
      startY: Math.round(r.top + 5),
      endX: Math.round(r.right - 15),
      endY: Math.round(r.bottom - 5)
    };
  })()`);

  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'right',
    buttons: 2,
    x: canvasBounds.startX,
    y: canvasBounds.startY
  });
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    button: 'right',
    buttons: 2,
    x: canvasBounds.endX,
    y: canvasBounds.endY
  });
  await sleep(100);
  await sendCmd('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'right',
    buttons: 0,
    x: canvasBounds.endX,
    y: canvasBounds.endY
  });
  await sleep(100);

  const test2_4 = await evaluate(`(() => {
    const selected = Array.from(document.querySelectorAll('.vault-block--selected'));
    const types = selected.map(b => b.getAttribute('data-block-type') || b.tagName.toLowerCase());
    return {
      types,
      count: selected.length
    };
  })()`);
  testReport.task2_vault_block_selection.all_block_types_selectable = (test2_4.count >= 4);

  // Test 2.5: Escape key clears selection
  await sendCmd('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape'
  });
  await sleep(50);
  const test2_5 = await evaluate(`(() => {
    return {
      selectedCount: document.querySelectorAll('.vault-block--selected').length
    };
  })()`);
  testReport.task2_vault_block_selection.escape_clears_selection = (test2_5.selectedCount === 0);

  // Test 2.6: Left click editing and typing not broken
  const test2_6 = await evaluate(`(() => {
    const canvas = document.getElementById('vault-wysiwyg-canvas');
    const p = canvas.querySelector('p');
    if (!p) return { text: false };
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, 'Typed prefix: ');
    return {
      text: p.textContent.startsWith('Typed prefix: ')
    };
  })()`);
  testReport.task2_vault_block_selection.left_click_typing_intact = (test2_6.text === true);

  // Test 3: Verify Spatial Board & Knowledge Graph Marquee No Regressions
  console.log('[Checking Board & Graph for marquee regressions...]');
  const projs = await db.query('SELECT id FROM projects LIMIT 1');
  const projId = projs.length > 0 ? projs[0].id : 1;

  await evaluate(`(() => { window.location.hash = '#/projects/${projId}/board'; })()`);
  await sleep(2500);
  const boardCheck = await evaluate(`(() => {
    const vp = document.getElementById('spatial-viewport');
    const mq = document.getElementById('selection-marquee');
    return { hasViewport: !!vp, hasMarquee: !!mq };
  })()`);
  testReport.regressions.board_marquee_present = (boardCheck.hasViewport && boardCheck.hasMarquee);

  await evaluate(`(() => { window.location.hash = '#/graph'; })()`);
  await sleep(2500);
  const graphCheck = await evaluate(`(() => {
    const vp = document.getElementById('graph-viewport');
    const mq = document.getElementById('graph-marquee');
    return { hasViewport: !!vp, hasMarquee: !!mq };
  })()`);
  testReport.regressions.graph_marquee_present = (graphCheck.hasViewport && graphCheck.hasMarquee);

  ws.close();
  chrome.kill();

  console.log('\n======================================================');
  console.log('         EMERGENCY FIX VERIFICATION REPORT');
  console.log('======================================================');
  console.log(JSON.stringify(testReport, null, 2));

  // Determine pass/fail
  let allPassed = true;
  for (const [section, checks] of Object.entries(testReport)) {
    for (const [name, val] of Object.entries(checks)) {
      if (!val) {
        console.error(`[FAIL] ${section}.${name} is ${val}`);
        allPassed = false;
      }
    }
  }

  if (allPassed) {
    console.log('\n>>> ALL EMERGENCY FIX CHECKS PASSED [DONE-VERIFIED] <<<');
    process.exit(0);
  } else {
    console.error('\n>>> SOME CHECKS FAILED <<<');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
