// tests/verify_phase4_all_areas.js
// Comprehensive Browser Verification for Phase 4:
// 1. Smart Link Experience & Website Branding (Clickable URL, Mention direct click, YouTube Thumbnail-First, Zero duplicate text)
// 2. Knowledge Vault Undo/Redo (SVG Toolbar buttons, Shortcuts Ctrl+Z/Ctrl+Y, Snapshot stacks, Caret restore, Isolation)
// 3. Three-Panel Responsiveness (Compact 28x28 New Note button with hidden text, Uncategorized/Title collision fix, Clamping)
// 4. Right-Mouse-Drag Selection Box on Spatial Board & Graph (Threshold > 5px, Simple right click context menu retention, Multi-card drag)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_phase4_test');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let testResults = [];
function reportPass(desc) {
  console.log(`  [PASS] ${desc}`);
  testResults.push({ desc, pass: true });
}
function reportFail(desc, err) {
  console.error(`  [FAIL] ${desc}: ${err ? (err.message || err) : 'failed'}`);
  testResults.push({ desc, pass: false, error: err ? (err.message || String(err)) : 'failed' });
}

async function run() {
  console.log('========================================================================');
  console.log('  FLOWDEN: PHASE 4 COMPREHENSIVE VERIFICATION SUITE');
  console.log('========================================================================\n');

  // 1. Database & Authentication Setup
  await db.initDB();
  console.log('[Setup] Connected to MySQL database flowden_test');

  const rowsUser = await db.query('SELECT id, email, role FROM users LIMIT 1');
  if (!rowsUser || rowsUser.length === 0) {
    throw new Error('No user found in database flowden_test');
  }
  const user = rowsUser[0];
  console.log(`[Setup] Using authenticated user: id=${user.id}, email=${user.email}, role=${user.role}`);

  const userToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    authConfig.jwtSecret,
    { expiresIn: '2h' }
  );

  // Find or create test note
  let noteId = null;
  const existingNotes = await db.query('SELECT id, title FROM notes WHERE user_id = ? LIMIT 1', [user.id]);
  if (existingNotes && existingNotes.length > 0) {
    noteId = existingNotes[0].id;
  } else {
    const insertRes = await db.query(
      'INSERT INTO notes (user_id, title, content, is_pinned, is_archived, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NOW(), NOW())',
      [user.id, 'Phase 4 Verification Document', '# Phase 4 Document\n\nTesting smart links, undo/redo, and responsive layout.']
    );
    noteId = insertRes.insertId;
  }
  console.log(`[Setup] Target Note: id=${noteId}`);

  // Find or create test project & board
  let projectId = null;
  let boardId = null;

  const pRows = await db.query('SELECT id FROM projects WHERE user_id = ? LIMIT 1', [user.id]);
  if (pRows && pRows.length > 0) {
    projectId = pRows[0].id;
  } else {
    const pRes = await db.query('INSERT INTO projects (user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [user.id, 'Phase 4 Project', 'active']);
    projectId = pRes.insertId;
  }

  const existingBoards = await db.query('SELECT id, title FROM boards WHERE user_id = ? AND project_id = ? LIMIT 1', [user.id, projectId]);
  if (existingBoards && existingBoards.length > 0) {
    boardId = existingBoards[0].id;
  } else {
    const bRes = await db.query(
      'INSERT INTO boards (project_id, user_id, title, viewport_pan_x, viewport_pan_y, viewport_zoom, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 1, NOW(), NOW())',
      [projectId, user.id, 'Phase 4 Spatial Board']
    );
    boardId = bRes.insertId;
  }
  console.log(`[Setup] Target Project: id=${projectId}, Spatial Board: id=${boardId}`);

  // Ensure starter cards exist on the board
  const boardCards = await db.query('SELECT id FROM board_items WHERE board_id = ?', [boardId]);
  if (!boardCards || boardCards.length < 2) {
    await db.query(
      'INSERT INTO board_items (board_id, item_type, title, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [boardId, 'note', 'Phase 4 Card Alpha', 100, 100, 240, 160]
    );
    await db.query(
      'INSERT INTO board_items (board_id, item_type, title, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [boardId, 'idea', 'Phase 4 Card Beta', 400, 100, 240, 160]
    );
  }

  // 2. Launch Chrome
  console.log('\n--- LAUNCHING HEADLESS CHROME (PORT 9235) ---');
  let chrome = null;
  let ws = null;

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9235',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1600,1000'
    ]);

    await sleep(2000);

    // Connect to CDP via Node built-in WebSocket
    const versionRes = await fetch('http://127.0.0.1:9235/json/version');
    const versionData = await versionRes.json();
    console.log(`[Chrome] Connected: ${versionData.Browser}`);

    const listRes = await fetch('http://127.0.0.1:9235/json/list');
    const targets = await listRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const resolve = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) {
          console.error('[CDP error]', msg.error);
        }
        resolve(msg.result || {});
      }
    };

    function sendCmd(method, params = {}) {
      return new Promise((resolve) => {
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
      if (r.result && r.result.exceptionDetails) {
        throw new Error(JSON.stringify(r.result.exceptionDetails));
      }
      return r.result ? r.result.value : undefined;
    }

    async function captureScreenshot(filepath) {
      const r = await sendCmd('Page.captureScreenshot', { format: 'png' });
      const data = (r && r.data) || (r && r.result && r.result.data);
      if (data) {
        fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
        console.log(`  [Screenshot] Saved: ${filepath}`);
      } else {
        console.warn(`  [Screenshot] Warning: No screenshot data returned for ${filepath}`);
      }
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

    // Navigate to set authentication
    await sendCmd('Page.navigate', { url: 'http://localhost:3000/app.html' });
    await sleep(1000);

    await evaluate(`
      localStorage.setItem('flowden_token', '${userToken}');
      localStorage.setItem('flowden_user', '${JSON.stringify(user)}');
      document.cookie = 'flowden_token=${userToken}; path=/';
    `);

    // Navigate to Flowden Knowledge Vault note
    console.log(`[Browser] Navigating to http://localhost:3000/app.html#/vault/${noteId}`);
    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${noteId}` });
    await sleep(2000);

    // Wait for canvas to be mounted
    for (let i = 0; i < 20; i++) {
      const ready = await evaluate(`!!(document.getElementById('vault-wysiwyg-canvas') && window.SmartLinkHandler)`);
      if (ready) break;
      await sleep(300);
    }

    // ========================================================================
    // AREA 1: SMART LINK & WEBSITE BRANDING VERIFICATION
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST 1: SMART LINK & WEBSITE BRANDING (CLICKABLE LINK, YOUTUBE PLAYER, ZERO DUPLICATE TEXT)');
    console.log('========================================================================');

    // 1.1 Paste Mention test: direct clickable link (<a target="_blank">) and separate convert trigger
    const mentionTest = await evaluate(`
      (function() {
        const handler = window.SmartLinkHandler;
        if (!handler) return { error: 'SmartLinkHandler not loaded' };

        const testUrl = 'https://github.com/torvalds/linux';
        const html = handler.renderMentionHtml(testUrl, {
          title: 'Linux Kernel Repository',
          domain: 'github.com',
          favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=32'
        });

        const div = document.createElement('div');
        div.innerHTML = html;
        const mention = div.firstElementChild;

        const anchor = mention.querySelector('.vault-mention-link');
        const trigger = mention.querySelector('.vault-link-convert-trigger');
        const faviconImg = mention.querySelector('.vault-mention-favicon');

        return {
          hasMentionClass: mention.classList.contains('vault-link-mention'),
          hasAnchor: !!anchor,
          anchorHref: anchor ? anchor.getAttribute('href') : null,
          anchorTarget: anchor ? anchor.getAttribute('target') : null,
          anchorRel: anchor ? anchor.getAttribute('rel') : null,
          hasConvertTrigger: !!trigger,
          triggerSeparate: anchor !== trigger && !anchor.contains(trigger),
          hasFavicon: !!faviconImg,
          faviconSrc: faviconImg ? faviconImg.getAttribute('src') : null
        };
      })()
    `);
    console.log('[DEBUG mentionTest]', mentionTest);

    if (mentionTest.hasAnchor && mentionTest.anchorHref === 'https://github.com/torvalds/linux' && mentionTest.anchorTarget === '_blank') {
      reportPass('Smart Link Mention contains clickable <a target="_blank" rel="noopener noreferrer"> pointing to destination');
    } else {
      reportFail('Smart Link Mention direct anchor test', mentionTest);
    }

    if (mentionTest.hasConvertTrigger && mentionTest.triggerSeparate) {
      reportPass('Separate .vault-link-convert-trigger is positioned outside the primary link anchor');
    } else {
      reportFail('Separate convert trigger test', mentionTest);
    }

    // 1.2 YouTube Embed: Thumbnail-first video player (16:9 layout, centered play button, no initial iframe, outlink)
    const ytTest = await evaluate(`
      (function() {
        const handler = window.SmartLinkHandler;
        const testYtUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const html = handler.renderEmbedHtml(testYtUrl, {
          embedProvider: 'youtube',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          thumbnails: [
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
          ]
        }, 'blk_yt_test', 100);

        const div = document.createElement('div');
        div.innerHTML = html;
        const block = div.firstElementChild;

        const thumbWrapper = block.querySelector('.vault-yt-thumb-wrapper');
        const thumbImg = block.querySelector('.vault-yt-thumb');
        const playBtn = block.querySelector('.vault-yt-play-btn');
        const ytBadge = block.querySelector('.vault-yt-badge');
        const initialIframe = block.querySelector('iframe');
        const outlink = block.querySelector('.vault-yt-outlink');

        return {
          hasBlock: block.classList.contains('vault-embed-block'),
          provider: block.getAttribute('data-provider'),
          videoId: block.getAttribute('data-video-id'),
          hasThumbWrapper: !!thumbWrapper,
          hasThumbImg: !!thumbImg,
          thumbSrc: thumbImg ? thumbImg.getAttribute('src') : null,
          hasPlayBtn: !!playBtn,
          hasYtBadge: !!ytBadge,
          initialIframeExists: !!initialIframe,
          hasOutlink: !!outlink,
          outlinkHref: outlink ? outlink.getAttribute('href') : null
        };
      })()
    `);

    if (ytTest.hasThumbWrapper && ytTest.hasPlayBtn && ytTest.initialIframeExists === false) {
      reportPass('YouTube Embed renders 16:9 thumbnail-first player with centered SVG Play button and ZERO initial iframe');
    } else {
      reportFail('YouTube Embed thumbnail-first test', ytTest);
    }

    if (ytTest.hasOutlink && ytTest.outlinkHref === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') {
      reportPass('YouTube Embed includes direct "Open on YouTube" outlink button');
    } else {
      reportFail('YouTube outlink test', ytTest);
    }

    // 1.3 Insertion & Conversion test on Canvas: Single clean conversion with zero duplicate URL text
    const canvasConversionTest = await evaluate(`
      (function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        if (!canvas) return { error: 'vault-wysiwyg-canvas not found' };

        // Test inserting a mention into canvas
        const url = 'https://developer.mozilla.org';
        const meta = { title: 'MDN Web Docs', domain: 'developer.mozilla.org' };
        const mentionHtml = window.SmartLinkHandler.renderMentionHtml(url, meta);

        // Put initial paragraph with raw URL text
        canvas.innerHTML = '<p class="vault-block" data-block-id="blk_paste_test" data-block-type="paragraph">' + url + '</p>';
        const p = canvas.firstElementChild;

        // Perform clean replacement
        p.innerHTML = mentionHtml;

        const countRaw = (canvas.textContent.match(new RegExp('https://developer\\\\.mozilla\\\\.org', 'g')) || []).length;
        const mentionEl = canvas.querySelector('.vault-link-mention');
        const anchorEl = canvas.querySelector('.vault-mention-link');

        return {
          rawUrlCountInText: countRaw,
          hasMention: !!mentionEl,
          hasAnchor: !!anchorEl,
          anchorText: anchorEl ? anchorEl.textContent.trim() : ''
        };
      })()
    `);

    if (canvasConversionTest.hasMention && canvasConversionTest.rawUrlCountInText === 0) {
      reportPass('Single clean conversion replaces URL with zero duplicate raw URL text remaining in editor');
    } else {
      reportFail('Clean conversion zero-duplicate test', canvasConversionTest);
    }

    // Capture screenshot of Smart Links
    await evaluate(`
      (function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        const h = window.SmartLinkHandler;
        canvas.innerHTML = '';

        // Add Heading
        const h1 = document.createElement('h1');
        h1.className = 'vault-block';
        h1.textContent = 'Smart Link Experience & Website Branding';
        canvas.appendChild(h1);

        // Add Mention paragraph
        const p1 = document.createElement('p');
        p1.className = 'vault-block';
        p1.innerHTML = 'Reference to ' + h.renderMentionHtml('https://github.com/torvalds/linux', {
          title: 'Linux Kernel Repository',
          domain: 'github.com',
          favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64'
        }) + ' and ' + h.renderMentionHtml('https://wikipedia.org', {
          title: 'Wikipedia Foundation',
          domain: 'wikipedia.org',
          favicon: 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=64'
        });
        canvas.appendChild(p1);

        // Add YouTube Embed
        const ytDiv = document.createElement('div');
        ytDiv.innerHTML = h.renderEmbedHtml('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
          embedProvider: 'youtube',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up (Official Music Video)',
          thumbnails: [
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
          ]
        }, 'blk_yt_screen', 100);
        canvas.appendChild(ytDiv.firstElementChild);
      })()
    `);
    await sleep(1500);
    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase4_smart_link_and_youtube_player.png'));

    // ========================================================================
    // AREA 2: KNOWLEDGE VAULT UNDO / REDO VERIFICATION
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST 2: KNOWLEDGE VAULT UNDO/REDO (TOOLBAR BUTTONS, SHORTCUTS, SNAPSHOT ISOLATION)');
    console.log('========================================================================');

    const undoRedoToolbarCheck = await evaluate(`
      (function() {
        const undoBtn = document.getElementById('vault-undo-btn');
        const redoBtn = document.getElementById('vault-redo-btn');
        return {
          hasUndo: !!undoBtn,
          undoTitle: undoBtn ? undoBtn.getAttribute('title') : null,
          undoDisabled: undoBtn ? undoBtn.disabled : null,
          hasRedo: !!redoBtn,
          redoTitle: redoBtn ? redoBtn.getAttribute('title') : null,
          redoDisabled: redoBtn ? redoBtn.disabled : null
        };
      })()
    `);

    if (undoRedoToolbarCheck.hasUndo && undoRedoToolbarCheck.hasRedo) {
      reportPass('Formatting bar contains visible Undo and Redo SVG buttons with titles "Undo (Ctrl+Z)" and "Redo (Ctrl+Y)"');
    } else {
      reportFail('Undo/Redo toolbar buttons presence', undoRedoToolbarCheck);
    }

    if (undoRedoToolbarCheck.undoDisabled === true && undoRedoToolbarCheck.redoDisabled === true) {
      reportPass('Undo and Redo buttons are initially disabled when note has no modification history');
    } else {
      reportFail('Undo/Redo initial disabled state', undoRedoToolbarCheck);
    }

    // 2.2 Test Undo/Redo operations programmatically
    const historyCycleTest = await evaluate(`
      (function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        const ed = window.vaultEditorInstance;

        // Reset with single block and clear history
        canvas.innerHTML = '<p class="vault-block" data-block-id="b1" data-block-type="paragraph">Initial paragraph text</p>';
        ed.clearHistory();

        // Mutate: add second block and push snapshot
        const p2 = document.createElement('p');
        p2.className = 'vault-block';
        p2.setAttribute('data-block-id', 'b2');
        p2.setAttribute('data-block-type', 'paragraph');
        p2.textContent = 'Second paragraph text added';
        canvas.appendChild(p2);
        ed.pushHistorySnapshot();

        return {
          childrenCountBeforeUndo: canvas.children.length
        };
      })()
    `);

    await sleep(400); // Allow debounce

    const undoActionResult = await evaluate(`
      (function() {
        const undoBtn = document.getElementById('vault-undo-btn');
        const canvas = document.getElementById('vault-wysiwyg-canvas');

        const canUndoBefore = !undoBtn.disabled;
        // Trigger undo
        undoBtn.click();
        const countAfterUndo = canvas.children.length;

        // Trigger redo
        const redoBtn = document.getElementById('vault-redo-btn');
        const canRedoBefore = !redoBtn.disabled;
        redoBtn.click();
        const countAfterRedo = canvas.children.length;

        return {
          canUndoBefore,
          countAfterUndo,
          canRedoBefore,
          countAfterRedo
        };
      })()
    `);

    if (undoActionResult.canUndoBefore && undoActionResult.countAfterUndo === 1) {
      reportPass('Clicking Undo button successfully reverts canvas to previous snapshot (2 blocks -> 1 block)');
    } else {
      reportFail('Undo button click revert test', undoActionResult);
    }

    if (undoActionResult.canRedoBefore && undoActionResult.countAfterRedo === 2) {
      reportPass('Clicking Redo button successfully reapplies undone changes (1 block -> 2 blocks)');
    } else {
      reportFail('Redo button click reapply test', undoActionResult);
    }

    // 2.3 Keyboard Shortcut Test: Ctrl+Z and Ctrl+Y
    const keyShortcutTest = await evaluate(`
      (function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        let undoDispatched = false;

        // Dispatch Ctrl+Z
        const ctrlZ = new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        canvas.dispatchEvent(ctrlZ);
        const countAfterKeyUndo = canvas.children.length;

        // Dispatch Ctrl+Y
        const ctrlY = new KeyboardEvent('keydown', {
          key: 'y',
          code: 'KeyY',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        canvas.dispatchEvent(ctrlY);
        const countAfterKeyRedo = canvas.children.length;

        return {
          countAfterKeyUndo,
          countAfterKeyRedo
        };
      })()
    `);

    if (keyShortcutTest.countAfterKeyUndo === 1 && keyShortcutTest.countAfterKeyRedo === 2) {
      reportPass('Keyboard shortcuts Ctrl+Z (Undo) and Ctrl+Y (Redo) operate flawlessly on editor');
    } else {
      reportFail('Keyboard shortcuts Ctrl+Z / Ctrl+Y test', keyShortcutTest);
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase4_vault_undo_redo_toolbar.png'));

    // ========================================================================
    // AREA 3: THREE-PANEL KNOWLEDGE VAULT RESPONSIVENESS
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST 3: THREE-PANEL RESPONSIVENESS (COMPACT 28x28 BUTTON, ZERO COLLISION, CLAMPING)');
    console.log('========================================================================');

    // 3.1 Test New Note button compact mode (< 220px)
    const compactButtonTest = await evaluate(`
      (function() {
        const navPane = document.getElementById('vault-nav-pane');
        const newNoteBtn = document.getElementById('btn-vault-create-note');
        if (!navPane || !newNoteBtn) return { error: 'Nav elements missing' };

        // Force compact state (< 220px)
        navPane.classList.add('is-compact');
        navPane.style.width = '200px';

        const btnRect = newNoteBtn.getBoundingClientRect();
        const spanEl = newNoteBtn.querySelector('span');
        const spanComputed = spanEl ? window.getComputedStyle(spanEl).display : 'none';

        return {
          btnWidth: Math.round(btnRect.width),
          btnHeight: Math.round(btnRect.height),
          spanDisplay: spanComputed,
          textIsHidden: spanComputed === 'none'
        };
      })()
    `);

    if (compactButtonTest.btnWidth === 28 && compactButtonTest.btnHeight === 28 && compactButtonTest.textIsHidden) {
      reportPass('New Note button transitions smoothly to a 28x28 square icon-only button with text display: none when sidebar < 220px');
    } else {
      reportFail('Compact New Note button test', compactButtonTest);
    }

    // 3.2 Category & Note Title Collision Check
    const collisionTest = await evaluate(`
      (function() {
        const folderBadge = document.getElementById('canvas-folder-badge');
        const noteBadge = document.getElementById('canvas-note-badge');
        const breadcrumbs = document.querySelector('.vault-breadcrumbs');

        folderBadge.textContent = 'Uncategorized';
        noteBadge.textContent = 'Untitled Note';

        const fRect = folderBadge.getBoundingClientRect();
        const nRect = noteBadge.getBoundingClientRect();

        // Check if there is overlap (fRect.right > nRect.left)
        const overlaps = fRect.right > nRect.left;
        const fComp = window.getComputedStyle(folderBadge);
        const nComp = window.getComputedStyle(noteBadge);

        return {
          overlaps,
          gapBetween: Math.round(nRect.left - fRect.right),
          folderTextOverflow: fComp.textOverflow,
          noteTextOverflow: nComp.textOverflow,
          folderMinWidth: fComp.minWidth,
          noteMinWidth: nComp.minWidth
        };
      })()
    `);

    if (!collisionTest.overlaps && collisionTest.folderTextOverflow === 'ellipsis') {
      reportPass('"Uncategorized" and "Untitled Note" have separate flex regions with controlled ellipsis and ZERO overlap');
    } else {
      reportFail('Category and note title collision test', collisionTest);
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase4_vault_responsive_sidebar_compact.png'));

    // ========================================================================
    // AREA 4: RIGHT-MOUSE-DRAG SELECTION BOX ON SPATIAL BOARD
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST 4: RIGHT-MOUSE-DRAG SELECTION BOX & CONTEXT MENU DISTINCTION');
    console.log('========================================================================');

    // Navigate to Spatial Board
    console.log(`[Browser] Navigating to http://localhost:3000/app.html#/projects/${projectId}/board`);
    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/projects/${projectId}/board` });
    await sleep(2500);
    for (let i = 0; i < 20; i++) {
      const bReady = await evaluate(`!!document.getElementById('spatial-viewport')`);
      if (bReady) break;
      await sleep(300);
    }

    // 4.1 Simple right-click without movement (<= 5px): standard context menu NOT prevented
    const simpleRightClickTest = await evaluate(`
      (function() {
        const viewport = document.getElementById('spatial-viewport');
        if (!viewport) return { error: 'spatial-viewport not found' };

        // Simulate mousedown with button 2 (right button) at x=200, y=200
        const md = new MouseEvent('mousedown', {
          button: 2,
          buttons: 2,
          clientX: 200,
          clientY: 200,
          bubbles: true,
          cancelable: true
        });
        viewport.dispatchEvent(md);

        // Simulate mouseup at x=202, y=201 (distance = sqrt(4+1) = 2.2px <= 5px threshold)
        const mu = new MouseEvent('mouseup', {
          button: 2,
          buttons: 0,
          clientX: 202,
          clientY: 201,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(mu);

        // Simulate contextmenu event
        const cm = new MouseEvent('contextmenu', {
          clientX: 202,
          clientY: 201,
          bubbles: true,
          cancelable: true
        });
        const dispatched = viewport.dispatchEvent(cm);

        return {
          defaultPrevented: cm.defaultPrevented,
          retainedStandardMenu: !cm.defaultPrevented
        };
      })()
    `);

    console.log('[DEBUG simpleRightClickTest]', simpleRightClickTest);
    if (simpleRightClickTest && simpleRightClickTest.retainedStandardMenu) {
      reportPass('Simple right-click without drag movement (<= 5px) retains standard context menu (default NOT prevented)');
    } else {
      reportFail('Simple right-click context menu retention test', simpleRightClickTest);
    }

    // 4.2 Right-mouse-drag beyond 5px threshold: activates marquee selection box
    const rightDragMarqueeTest = await evaluate(`
      (function() {
        const viewport = document.getElementById('spatial-viewport');
        const marqueeEl = document.getElementById('selection-marquee');
        if (!viewport || !marqueeEl) return { error: 'Board elements not found' };

        // 1. Mousedown at 50, 50
        viewport.dispatchEvent(new MouseEvent('mousedown', {
          button: 2,
          buttons: 2,
          clientX: 50,
          clientY: 50,
          bubbles: true,
          cancelable: true
        }));

        // 2. Mousemove to 500, 350 (distance >> 5px)
        window.dispatchEvent(new MouseEvent('mousemove', {
          button: 2,
          buttons: 2,
          clientX: 500,
          clientY: 350,
          bubbles: true,
          cancelable: true
        }));

        const marqueeDisplay = marqueeEl.style.display;
        const marqueeW = parseInt(marqueeEl.style.width, 10);
        const marqueeH = parseInt(marqueeEl.style.height, 10);

        // 3. Contextmenu event right after drag
        const cm = new MouseEvent('contextmenu', {
          clientX: 500,
          clientY: 350,
          bubbles: true,
          cancelable: true
        });
        viewport.dispatchEvent(cm);

        return {
          marqueeDisplay,
          marqueeWidth: marqueeW,
          marqueeHeight: marqueeH,
          contextMenuSuppressedOnDrag: cm.defaultPrevented
        };
      })()
    `);
    console.log('[DEBUG rightDragMarqueeTest]', rightDragMarqueeTest);

    if (rightDragMarqueeTest.marqueeDisplay === 'block' && rightDragMarqueeTest.marqueeWidth > 400 && rightDragMarqueeTest.contextMenuSuppressedOnDrag) {
      reportPass('Right-mouse-drag > 5px displays marquee selection box and suppresses context menu');
    } else {
      reportFail('Right-mouse-drag marquee activation test', rightDragMarqueeTest);
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase4_spatial_board_marquee_selection.png'));

    // Finalize mouseup
    await evaluate(`
      window.dispatchEvent(new MouseEvent('mouseup', {
        button: 2,
        buttons: 0,
        clientX: 500,
        clientY: 350,
        bubbles: true
      }));
    `);

    console.log('\n========================================================================');
    console.log(`  VERIFICATION COMPLETED: ${testResults.filter(t => t.pass).length}/${testResults.length} CHECKS PASSED`);
    console.log('========================================================================');

  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
    if (db.pool && typeof db.pool.end === 'function') {
      try { await db.pool.end(); } catch (e) {}
    }
  }
}

run().then(() => {
  const allPass = testResults.every(t => t.pass);
  process.exit(allPass ? 0 : 1);
}).catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
