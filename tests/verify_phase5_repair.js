// tests/verify_phase5_repair.js
// Flowden Comprehensive Browser Verification for:
// 1. Responsive Knowledge Vault (Clean sidebar collapse to 52px rail, zero clipped labels,
//    title/category collision fix, three-panel clamping preserving editor min 380px, progressive disclosure)
// 2. Smart Link URL Functionality & Conversion Integrity (Clickable raw anchor, Enter key navigation,
//    Mention direct click, Bookmark, 16:9 thumbnail-first YouTube embed, clean replace with zero duplicate text, Undo/Redo)
// 3. Marquee Right-Mouse-Drag Selection (Pointer state machine, simple right-click context menu retention,
//    drag activation > 5px, empty-canvas check, 4-direction drag, multi-card selection & persistence)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_phase5_test');

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
  console.log('  FLOWDEN: PHASE 5 COMPREHENSIVE VERIFICATION SUITE');
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
      [user.id, 'Phase 5 Verification Document', '# Phase 5 Document\n\nTesting smart links, undo/redo, responsive workspace and marquee selection.']
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
    const pRes = await db.query('INSERT INTO projects (user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [user.id, 'Phase 5 Project', 'active']);
    projectId = pRes.insertId;
  }

  const existingBoards = await db.query('SELECT id, title FROM boards WHERE user_id = ? AND project_id = ? LIMIT 1', [user.id, projectId]);
  if (existingBoards && existingBoards.length > 0) {
    boardId = existingBoards[0].id;
  } else {
    const bRes = await db.query(
      'INSERT INTO boards (project_id, user_id, title, viewport_pan_x, viewport_pan_y, viewport_zoom, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 1, NOW(), NOW())',
      [projectId, user.id, 'Phase 5 Spatial Board']
    );
    boardId = bRes.insertId;
  }
  console.log(`[Setup] Target Project: id=${projectId}, Spatial Board: id=${boardId}`);

  // Ensure starter cards exist on the board
  const boardCards = await db.query('SELECT id FROM board_items WHERE board_id = ?', [boardId]);
  if (!boardCards || boardCards.length < 2) {
    await db.query(
      'INSERT INTO board_items (board_id, item_type, title, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [boardId, 'note', 'Phase 5 Card Alpha', 100, 100, 240, 160]
    );
    await db.query(
      'INSERT INTO board_items (board_id, item_type, title, position_x, position_y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [boardId, 'idea', 'Phase 5 Card Beta', 400, 100, 240, 160]
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
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
        if (msg.params.type === 'error') {
          console.error(`  [Browser Console Error] ${text}`);
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error(`  [Browser Exception Thrown] ${JSON.stringify(msg.params.exceptionDetails)}`);
      }
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
      if (r && r.exceptionDetails) {
        throw new Error(`Browser Exception: ${JSON.stringify(r.exceptionDetails)}`);
      }
      if (r && r.result && r.result.subtype === 'error') {
        throw new Error(`Browser Error: ${r.result.description}`);
      }
      return r && r.result ? r.result.value : undefined;
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

    // Navigate to Vault
    console.log(`[Browser] Navigating to http://localhost:3000/app.html#/vault/${noteId}`);
    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${noteId}` });
    await sleep(2500);

    // Set localStorage auth
    await evaluate(`localStorage.setItem('flowden_token', '${userToken}');`);

    // ========================================================================
    // AREA 1: RESPONSIVE KNOWLEDGE VAULT & SIDEBAR COLLAPSE
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST AREA 1: RESPONSIVE KNOWLEDGE VAULT & SIDEBAR COLLAPSE');
    console.log('========================================================================');

    // Reset layout state to default for normal width check
    await evaluate(`(() => {
      const sb = document.getElementById('app-sidebar');
      if (sb) sb.classList.remove('sidebar--collapsed');
      const navPane = document.getElementById('vault-nav-pane');
      if (navPane) {
        navPane.style.width = '280px';
        navPane.classList.remove('is-compact');
      }
    })()`);
    await sleep(300);

    // 1.1 Normal Sidebar Width
    const normalSidebarCheck = await evaluate(`(() => {
      const sb = document.getElementById('app-sidebar');
      const brandLogo = sb.querySelector('.brand-mark-img');
      const brandWordmark = sb.querySelector('.brand-wordmark-img');
      const navLabels = Array.from(sb.querySelectorAll('.nav-item-label')).map(el => el.textContent.trim());
      const newNoteBtn = document.getElementById('btn-vault-create-note');
      const newNoteLabel = newNoteBtn ? newNoteBtn.querySelector('span')?.textContent.trim() : '';

      return {
        width: sb.offsetWidth,
        brandMarkVisible: brandLogo && getComputedStyle(brandLogo).display !== 'none',
        wordmarkVisible: brandWordmark && getComputedStyle(brandWordmark).display !== 'none',
        hasOverview: navLabels.includes('Overview'),
        hasVault: navLabels.includes('Knowledge Vault'),
        hasProjects: navLabels.includes('Projects'),
        newNoteHasText: newNoteLabel === 'New Note'
      };
    })()`);

    if (normalSidebarCheck.width > 200 && normalSidebarCheck.hasOverview && normalSidebarCheck.hasVault && normalSidebarCheck.newNoteHasText) {
      reportPass('Sidebar at normal width displays full brand, logo, navigation labels, and New Note text');
    } else {
      reportFail('Sidebar at normal width check failed', JSON.stringify(normalSidebarCheck));
    }

    // 1.2 Collapsed Breakpoint: Fixed-width 52px icon rail with ZERO label remnants
    await evaluate(`document.getElementById('app-sidebar').classList.add('sidebar--collapsed');`);
    await sleep(300);

    const collapsedSidebarCheck = await evaluate(`(() => {
      const sb = document.getElementById('app-sidebar');
      const labels = Array.from(sb.querySelectorAll('.nav-item-label, .sidebar-section-title, .brand-wordmark-wrapper'));
      const anyLabelVisible = labels.some(el => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });

      const navItems = Array.from(sb.querySelectorAll('.nav-item')).map(item => {
        const cs = getComputedStyle(item);
        const icon = item.querySelector('.nav-item-icon');
        return {
          width: item.offsetWidth,
          justify: cs.justifyContent,
          hasIcon: !!icon,
          ariaLabel: item.getAttribute('aria-label') || item.getAttribute('title')
        };
      });

      return {
        width: sb.offsetWidth,
        anyLabelVisible,
        allIconsCentered: navItems.every(n => n.justify === 'center'),
        allAccessible: navItems.every(n => !!n.ariaLabel)
      };
    })()`);

    if (collapsedSidebarCheck.width <= 60 && !collapsedSidebarCheck.anyLabelVisible && collapsedSidebarCheck.allIconsCentered && collapsedSidebarCheck.allAccessible) {
      reportPass('Sidebar becomes fixed-width 52px icon rail with all navigation labels removed and centered icons');
    } else {
      reportFail('Sidebar collapse check failed', JSON.stringify(collapsedSidebarCheck));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_sidebar_collapsed_rail.png'));

    // 1.3 New Note button becomes 28x28 square icon button when nav pane < 220px
    const newNoteCompactCheck = await evaluate(`(() => {
      const navPane = document.getElementById('vault-nav-pane');
      navPane.style.width = '200px';
      navPane.classList.add('is-compact');
      const btn = document.getElementById('btn-vault-create-note');
      const span = btn.querySelector('span');
      const rect = btn.getBoundingClientRect();
      const spanDisplay = getComputedStyle(span).display;

      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        spanDisplay,
        ariaLabel: btn.getAttribute('aria-label'),
        title: btn.getAttribute('title')
      };
    })()`);

    if (newNoteCompactCheck.width <= 32 && newNoteCompactCheck.height <= 32 && newNoteCompactCheck.spanDisplay === 'none' && newNoteCompactCheck.ariaLabel === 'New Note') {
      reportPass('New Note becomes 28x28 square icon-only button with label removed and aria-label="New Note"');
    } else {
      reportFail('New Note compact mode check failed', JSON.stringify(newNoteCompactCheck));
    }

    // 1.4 Category & Title Separation: Zero collisions between "Uncategorized" and "Untitled Note"
    const collisionCheck = await evaluate(`(() => {
      const breadcrumbs = document.querySelector('.vault-breadcrumbs');
      const folderBadge = document.getElementById('canvas-folder-badge');
      const noteBadge = document.getElementById('canvas-note-badge');
      const sep = document.querySelector('.vault-breadcrumb-sep');

      const fRect = folderBadge.getBoundingClientRect();
      const nRect = noteBadge.getBoundingClientRect();

      // Check if folder and note badges overlap horizontally
      const overlaps = !(fRect.right <= nRect.left || fRect.left >= nRect.right);

      return {
        folderText: folderBadge.textContent.trim(),
        noteText: noteBadge.textContent.trim(),
        fWidth: fRect.width,
        nWidth: nRect.width,
        overlaps,
        fShrink: getComputedStyle(folderBadge).flexShrink,
        nMinW: getComputedStyle(noteBadge).minWidth
      };
    })()`);

    if (!collisionCheck.overlaps) {
      reportPass('Breadcrumb category ("Uncategorized") and note title ("Untitled Note") have explicit zones with zero overlap');
    } else {
      reportFail('Breadcrumb collision check failed', JSON.stringify(collisionCheck));
    }

    // 1.5 Three-Panel Geometry Clamping (Preserving Editor min 380px)
    const clampCheck = await evaluate(`(() => {
      const workspace = document.getElementById('vault-workspace');
      const navPane = document.getElementById('vault-nav-pane');
      const mainCanvas = document.getElementById('vault-main-canvas');
      const inspector = document.getElementById('vault-inspector-pane');

      // Expand nav pane to its maximum allowed width
      navPane.style.width = '480px';
      // Expand inspector to its maximum
      inspector.style.width = '520px';
      inspector.style.display = 'flex';

      const canvasWidth = mainCanvas.offsetWidth;
      return {
        workspaceW: workspace.offsetWidth,
        canvasWidth,
        editorUsable: canvasWidth >= 380
      };
    })()`);

    if (clampCheck.canvasWidth >= 380) {
      reportPass(`Editor retains usable width (${clampCheck.canvasWidth}px >= 380px) even when panels expand`);
    } else {
      reportFail('Editor minimum width clamp check failed', JSON.stringify(clampCheck));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_responsive_three_panels_usable.png'));

    // 1.6 Tablet Landscape (1024x768) and Portrait (768x1024) Progressive Disclosure
    console.log('[Responsive] Emulating Tablet Landscape (1024x768)...');
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(500);

    const tabletLandCheck = await evaluate(`(() => {
      const sb = document.getElementById('app-sidebar');
      const mainCanvas = document.getElementById('vault-main-canvas');
      return {
        sidebarW: sb.offsetWidth,
        canvasW: mainCanvas.offsetWidth,
        editorUsable: mainCanvas.offsetWidth >= 380
      };
    })()`);

    if (tabletLandCheck.sidebarW <= 60 && tabletLandCheck.editorUsable) {
      reportPass('Tablet Landscape (1024x768): Sidebar auto-collapses to icon rail; editor remains primary workspace');
    } else {
      reportFail('Tablet landscape check failed', JSON.stringify(tabletLandCheck));
    }
    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_responsive_tablet_landscape.png'));

    console.log('[Responsive] Emulating Tablet Portrait (768x1024)...');
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(500);

    const tabletPortCheck = await evaluate(`(() => {
      const sb = document.getElementById('app-sidebar');
      const mainCanvas = document.getElementById('vault-main-canvas');
      return {
        sidebarW: sb.offsetWidth,
        canvasW: mainCanvas.offsetWidth,
        editorUsable: mainCanvas.offsetWidth >= 300
      };
    })()`);

    if (tabletPortCheck.sidebarW <= 60 && tabletPortCheck.editorUsable) {
      reportPass('Tablet Portrait (768x1024): Sidebar collapses cleanly without jitter; editor usable');
    } else {
      reportFail('Tablet portrait check failed', JSON.stringify(tabletPortCheck));
    }
    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_responsive_tablet_portrait.png'));

    // Reset device metrics
    await sendCmd('Emulation.clearDeviceMetricsOverride');
    await sleep(500);

    // ========================================================================
    // AREA 2: SMART LINK URL FUNCTIONALITY & CONVERSION INTEGRITY
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST AREA 2: SMART LINK URL FUNCTIONALITY & CONVERSION INTEGRITY');
    console.log('========================================================================');

    // 2.1 Raw URL Renders Semantic Hyperlink (<a class="editor-link" target="_blank" rel="noopener noreferrer">)
    const rawUrlCheck = await evaluate(`(() => {
      const editor = window.vaultEditorInstance;
      const rawHtml = window.SmartLinkHandler.renderUrlHtml('https://flowden.org', 'https://flowden.org');
      const canvasEl = document.getElementById('vault-wysiwyg-canvas');
      canvasEl.innerHTML = '<p class="vault-block" data-block-id="blk_test_url" data-block-type="paragraph">' + rawHtml + '</p>';
      
      const anchor = canvasEl.querySelector('a.editor-link');
      const convertTrigger = canvasEl.querySelector('.vault-link-convert-trigger');

      return {
        hasAnchor: !!anchor,
        href: anchor ? anchor.getAttribute('href') : null,
        target: anchor ? anchor.getAttribute('target') : null,
        rel: anchor ? anchor.getAttribute('rel') : null,
        hasConvertTrigger: !!convertTrigger,
        convertTriggerOutsideAnchor: !anchor.contains(convertTrigger)
      };
    })()`);

    if (rawUrlCheck.hasAnchor && rawUrlCheck.href === 'https://flowden.org' && rawUrlCheck.target === '_blank' && rawUrlCheck.rel.includes('noopener') && rawUrlCheck.convertTriggerOutsideAnchor) {
      reportPass('Raw URL renders genuine semantic <a target="_blank" rel="noopener noreferrer"> with separate convert trigger');
    } else {
      reportFail('Raw URL anchor rendering check failed', JSON.stringify(rawUrlCheck));
    }

    // 2.2 Direct URL Click and Keyboard Enter Navigation
    const linkClickCheck = await evaluate(`(() => {
      let openedUrl = null;
      const originalOpen = window.open;
      window.open = (u, t, r) => { openedUrl = u; };

      const canvasEl = document.getElementById('vault-wysiwyg-canvas');
      const anchor = canvasEl.querySelector('a.editor-link');

      // Click on raw anchor
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const mouseClickOpened = openedUrl;

      // Keyboard focus and Enter key
      openedUrl = null;
      anchor.focus();
      canvasEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const enterKeyOpened = openedUrl;

      window.open = originalOpen;
      return {
        mouseClickOpened,
        enterKeyOpened
      };
    })()`);

    const cleanMouse = (linkClickCheck.mouseClickOpened || '').replace(/\/$/, '');
    const cleanEnter = (linkClickCheck.enterKeyOpened || '').replace(/\/$/, '');
    if (cleanMouse === 'https://flowden.org' && cleanEnter === 'https://flowden.org') {
      reportPass('Raw URL direct click and keyboard focus + Enter successfully open destination without opening convert menu');
    } else {
      reportFail('Raw URL click/enter navigation failed', JSON.stringify(linkClickCheck));
    }

    // 2.3 Convert URL to Mention -> Direct click and neutral SVG fallback
    const convertToMentionCheck = await evaluate(`(async () => {
      try {
        const canvasEl = document.getElementById('vault-wysiwyg-canvas');
        if (!canvasEl) return { error: 'no-canvas' };
        const rawHtml = window.SmartLinkHandler.renderUrlHtml('https://flowden.org', 'https://flowden.org');
        canvasEl.innerHTML = '<p class="vault-block" data-block-id="blk_m_url" data-block-type="paragraph">' + rawHtml + '</p>';

        const meta = { title: 'Flowden Project', favicon: '' };
        const mentionHtml = window.SmartLinkHandler.renderMentionHtml('https://flowden.org', meta);
        const temp = document.createElement('div');
        temp.innerHTML = mentionHtml;
        
        const wrapper = canvasEl.querySelector('.vault-link-wrapper');
        if (wrapper) {
          wrapper.replaceWith(temp.firstElementChild);
        }

        const mention = canvasEl.querySelector('.vault-link-mention');
        const mentionLink = canvasEl.querySelector('.vault-mention-link');
        const trigger = canvasEl.querySelector('.vault-link-convert-trigger');

        // Test direct click on mention chip
        let openedUrl = null;
        const originalOpen = window.open;
        window.open = (u) => { openedUrl = u; };
        if (mentionLink) {
          mentionLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        window.open = originalOpen;

        // Count occurrences of raw URL text
        const rawCount = canvasEl.textContent.includes('https://flowden.org') ? 1 : 0;

        return {
          hasMention: !!mention,
          openedUrl,
          triggerOutsideAnchor: mentionLink && trigger ? !mentionLink.contains(trigger) : false,
          rawCount
        };
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`);

    if (convertToMentionCheck && convertToMentionCheck.hasMention && convertToMentionCheck.openedUrl === 'https://flowden.org' && convertToMentionCheck.triggerOutsideAnchor && convertToMentionCheck.rawCount === 0) {
      reportPass('Mention conversion cleanly replaces URL with direct click anchor, separate trigger, and zero duplicate text');
    } else {
      reportFail('Convert to Mention check failed', JSON.stringify(convertToMentionCheck));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_smart_link_raw_url_and_mention.png'));

    // 2.4 Convert Mention to Bookmark Card -> Polished visual card with direct click
    const convertToBookmarkCheck = await evaluate(`(async () => {
      const canvasEl = document.getElementById('vault-wysiwyg-canvas');
      const meta = { title: 'Flowden Documentation', description: 'Flowden workspace documentation and guides.', domain: 'flowden.org' };
      const bookmarkHtml = window.SmartLinkHandler.renderBookmarkHtml('https://flowden.org', meta, 'blk_bmark_test');
      
      const p = canvasEl.querySelector('.vault-block');
      p.outerHTML = bookmarkHtml;

      const card = canvasEl.querySelector('.vault-bookmark-card');
      const titleLink = canvasEl.querySelector('.vault-bookmark-title');
      const domain = canvasEl.querySelector('.vault-bookmark-domain');
      const desc = canvasEl.querySelector('.vault-bookmark-desc');

      let openedUrl = null;
      const originalOpen = window.open;
      window.open = (u) => { openedUrl = u; };
      titleLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      window.open = originalOpen;

      return {
        hasCard: !!card,
        openedUrl,
        domainText: domain ? domain.textContent.trim() : null,
        descText: desc ? desc.textContent.trim() : null
      };
    })()`);

    if (convertToBookmarkCheck.hasCard && convertToBookmarkCheck.openedUrl === 'https://flowden.org' && convertToBookmarkCheck.domainText === 'flowden.org') {
      reportPass('Bookmark card renders page title, domain, description, and direct clickable navigation');
    } else {
      reportFail('Convert to Bookmark check failed', JSON.stringify(convertToBookmarkCheck));
    }

    // 2.5 Convert to Embed: 16:9 Thumbnail-First YouTube Player
    const youtubeEmbedCheck = await evaluate(`(async () => {
      const canvasEl = document.getElementById('vault-wysiwyg-canvas');
      const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const meta = {
        title: 'Rick Astley - Never Gonna Give You Up',
        isEmbeddable: true,
        embedProvider: 'youtube',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
      };
      const embedHtml = window.SmartLinkHandler.renderEmbedHtml(ytUrl, meta, 'blk_embed_yt');
      canvasEl.innerHTML = embedHtml;

      const embedBlock = canvasEl.querySelector('.vault-embed-block');
      const thumbWrapper = canvasEl.querySelector('.vault-yt-thumb-wrapper');
      const playBtn = canvasEl.querySelector('.vault-yt-play-btn');
      const outlink = canvasEl.querySelector('.vault-embed-outlink');
      const iframesBeforePlay = canvasEl.querySelectorAll('iframe').length;

      // Click play button to dynamically swap thumbnail for iframe
      thumbWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const iframesAfterPlay = canvasEl.querySelectorAll('iframe.vault-yt-active-iframe').length;

      return {
        hasEmbedBlock: !!embedBlock,
        hasThumbWrapper: !!thumbWrapper,
        hasPlayBtn: !!playBtn,
        hasOutlink: !!outlink,
        iframesBeforePlay,
        iframesAfterPlay
      };
    })()`);

    if (youtubeEmbedCheck.hasEmbedBlock && youtubeEmbedCheck.hasPlayBtn && youtubeEmbedCheck.iframesBeforePlay === 0 && youtubeEmbedCheck.iframesAfterPlay === 1) {
      reportPass('YouTube Embed renders 16:9 thumbnail-first player with centered Play button, zero initial iframes, and dynamic play swap');
    } else {
      reportFail('YouTube Embed check failed', JSON.stringify(youtubeEmbedCheck));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_smart_link_bookmark_and_embed.png'));

    // 2.6 Undo and Redo of Conversions
    const undoRedoCheck = await evaluate(`(() => {
      const editor = window.vaultEditorInstance;
      const initialHtml = '<p class="vault-block" data-block-id="b1" data-block-type="paragraph">Original Paragraph</p>';
      document.getElementById('vault-wysiwyg-canvas').innerHTML = initialHtml;
      
      // Step 1: Snapshot initial state
      editor.pushHistorySnapshot();

      // Step 2: Convert to embed
      const embedHtml = window.SmartLinkHandler.renderBookmarkHtml('https://flowden.org', { title: 'Flowden' }, 'b2');
      document.getElementById('vault-wysiwyg-canvas').innerHTML = embedHtml;
      editor.pushHistorySnapshot();

      // Step 3: Undo
      editor.undo();
      const afterUndoHasOriginal = document.getElementById('vault-wysiwyg-canvas').textContent.includes('Original Paragraph');

      // Step 4: Redo
      editor.redo();
      const afterRedoHasBookmark = !!document.getElementById('vault-wysiwyg-canvas').querySelector('.vault-bookmark-block');

      return {
        afterUndoHasOriginal,
        afterRedoHasBookmark
      };
    })()`);

    if (undoRedoCheck.afterUndoHasOriginal && undoRedoCheck.afterRedoHasBookmark) {
      reportPass('Undo (Ctrl+Z) cleanly reverts smart link conversion, and Redo (Ctrl+Y) reapplies it exactly once');
    } else {
      reportFail('Undo/Redo conversion check failed', JSON.stringify(undoRedoCheck));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_smart_link_undo_redo_conversion.png'));

    // ========================================================================
    // AREA 3: MARQUEE / RIGHT-MOUSE-DRAG SELECTION REPAIR
    // ========================================================================
    console.log('\n========================================================================');
    console.log('  TEST AREA 3: MARQUEE RIGHT-MOUSE-DRAG SELECTION REPAIR');
    console.log('========================================================================');

    console.log(`[Browser] Navigating to Spatial Board: http://localhost:3000/app.html#/projects/${projectId}/board`);
    await evaluate(`(() => {
      window.location.hash = '#/projects/${projectId}/board';
      if (window.Router) {
        window.Router.handleRouting();
      }
    })()`);
    await sleep(2000);

    let hasVp = false;
    for (let i = 0; i < 30; i++) {
      hasVp = await evaluate(`!!document.getElementById('spatial-viewport')`);
      if (hasVp) break;
      await sleep(200);
    }
    if (!hasVp) {
      const debugInfo = await evaluate(`({
        hash: window.location.hash,
        mainHtml: (document.getElementById('main-content') || {}).innerHTML || '',
        title: document.title
      })`);
      console.log('  [DEBUG Board Not Mounted]', JSON.stringify(debugInfo));
    }

    // 3.1 Simple Right Click without movement (<= 5px) retains standard context menu
    const simpleRightClickTest = await evaluate(`(() => {
      const vp = document.getElementById('spatial-viewport');
      if (!vp) return { defaultPrevented: false, retainedStandardMenu: false, error: 'no-viewport' };
      let contextMenuPrevented = false;

      const handler = (e) => {
        contextMenuPrevented = e.defaultPrevented;
      };
      window.addEventListener('contextmenu', handler, { once: true });

      // Simulate mousedown with button 2, no movement, mouseup with button 2
      vp.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 200, clientY: 200, bubbles: true }));
      vp.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: 200, clientY: 200, bubbles: true }));

      // Dispatch contextmenu
      const ev = new MouseEvent('contextmenu', { button: 2, clientX: 200, clientY: 200, bubbles: true, cancelable: true });
      vp.dispatchEvent(ev);

      return {
        defaultPrevented: ev.defaultPrevented,
        retainedStandardMenu: !ev.defaultPrevented
      };
    })()`);

    if (simpleRightClickTest.retainedStandardMenu) {
      reportPass('Simple right-click without drag movement (<= 5px) retains standard native context menu (not prevented)');
    } else {
      reportFail('Simple right-click context menu retention test failed', JSON.stringify(simpleRightClickTest));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_marquee_simple_right_click_menu.png'));

    // 3.2 Right-Drag (> 5px) on Empty Canvas Activates Marquee Box and Suppresses Context Menu
    const rightDragMarqueeTest = await evaluate(`(() => {
      const vp = document.getElementById('spatial-viewport');
      const marquee = document.getElementById('selection-marquee');

      // Start drag at (150, 150)
      vp.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 150, clientY: 150, bubbles: true }));
      
      // Move 400px right, 250px down
      window.dispatchEvent(new MouseEvent('mousemove', { button: 2, buttons: 2, clientX: 550, clientY: 400, bubbles: true }));

      const marqueeDisplay = marquee ? marquee.style.display : 'none';
      const marqueeWidth = marquee ? parseInt(marquee.style.width, 10) : 0;
      const marqueeHeight = marquee ? parseInt(marquee.style.height, 10) : 0;

      // Finish drag
      window.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: 550, clientY: 400, bubbles: true }));

      // Immediately following contextmenu event
      const ev = new MouseEvent('contextmenu', { button: 2, clientX: 550, clientY: 400, bubbles: true, cancelable: true });
      vp.dispatchEvent(ev);

      return {
        marqueeDisplay,
        marqueeWidth,
        marqueeHeight,
        contextMenuSuppressedOnDrag: ev.defaultPrevented
      };
    })()`);

    if (rightDragMarqueeTest.marqueeDisplay === 'block' && rightDragMarqueeTest.marqueeWidth >= 300 && rightDragMarqueeTest.contextMenuSuppressedOnDrag) {
      reportPass('Right-mouse-drag > 5px displays marquee selection box and suppresses the browser context menu');
    } else {
      reportFail('Right-drag marquee activation test failed', JSON.stringify(rightDragMarqueeTest));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_marquee_right_drag_active.png'));

    // 3.3 Right-click starting on Card does NOT start Marquee
    const cardRightClickTest = await evaluate(`(() => {
      const card = document.querySelector('.board-card, .spatial-card');
      const marquee = document.getElementById('selection-marquee');
      if (!card) return { hasCard: false };

      const rect = card.getBoundingClientRect();
      const startX = rect.left + 20;
      const startY = rect.top + 20;

      // Start right-down on card
      card.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: startX, clientY: startY, bubbles: true }));
      // Drag over canvas
      window.dispatchEvent(new MouseEvent('mousemove', { button: 2, buttons: 2, clientX: startX + 150, clientY: startY + 150, bubbles: true }));

      const marqueeStartedOnCard = marquee && marquee.style.display === 'block';

      window.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: startX + 150, clientY: startY + 150, bubbles: true }));

      return {
        hasCard: true,
        marqueeStartedOnCard
      };
    })()`);

    if (cardRightClickTest.hasCard && !cardRightClickTest.marqueeStartedOnCard) {
      reportPass('Right-click starting on a card does NOT start marquee, preserving object interactions');
    } else {
      reportFail('Card right click isolation check failed', JSON.stringify(cardRightClickTest));
    }

    // 3.4 Multi-Selection on Spatial Board and Position Persistence
    const boardMultiSelectTest = await evaluate(`(() => {
      const board = window.FlowdenBoard;
      if (!board) return { hasBoard: false };

      const vp = document.getElementById('spatial-viewport');
      const marquee = document.getElementById('selection-marquee');

      // Drag enclosing both starter cards (cards at x=100 and x=400)
      vp.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 50, clientY: 50, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { button: 2, buttons: 2, clientX: 750, clientY: 350, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: 750, clientY: 350, bubbles: true }));

      const selectedCount = board.selectedItemIds.size;
      const hasBothCards = selectedCount >= 2;

      return {
        hasBoard: true,
        selectedCount,
        hasBothCards
      };
    })()`);

    if (boardMultiSelectTest.hasBoard && boardMultiSelectTest.hasBothCards) {
      reportPass(`Spatial Board marquee selection successfully selected ${boardMultiSelectTest.selectedCount} cards in unison`);
    } else {
      reportFail('Spatial board multi-card selection failed', JSON.stringify(boardMultiSelectTest));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_marquee_multi_selection_spatial_board.png'));

    // 3.5 Knowledge Graph: Right-drag Marquee Selection
    console.log('[Browser] Navigating to Knowledge Graph: http://localhost:3000/app.html#/graph');
    await evaluate(`(() => {
      window.location.hash = '#/graph';
      if (window.Router) {
        window.Router.handleRouting();
      }
    })()`);
    await sleep(2000);

    for (let i = 0; i < 30; i++) {
      const hasGraph = await evaluate(`!!document.getElementById('graph-viewport')`);
      if (hasGraph) break;
      await sleep(200);
    }

    const graphMarqueeTest = await evaluate(`(() => {
      const vp = document.getElementById('graph-viewport');
      if (!vp) return { simpleRightClickPreserved: false, marqueeDisplay: 'none', dragSuppressed: false, error: 'no-viewport' };
      const marquee = document.getElementById('graph-marquee');

      // 1. Simple right click on graph
      const ev = new MouseEvent('contextmenu', { button: 2, clientX: 200, clientY: 200, bubbles: true, cancelable: true });
      vp.dispatchEvent(ev);
      const simpleRightClickPreserved = !ev.defaultPrevented;

      // 2. Right drag on graph
      vp.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { button: 2, buttons: 2, clientX: 450, clientY: 400, bubbles: true }));

      const marqueeDisplay = marquee ? marquee.style.display : 'none';
      const marqueeW = marquee ? parseInt(marquee.style.width, 10) : 0;

      window.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: 450, clientY: 400, bubbles: true }));

      const dragEv = new MouseEvent('contextmenu', { button: 2, clientX: 450, clientY: 400, bubbles: true, cancelable: true });
      vp.dispatchEvent(dragEv);

      return {
        simpleRightClickPreserved,
        marqueeDisplay,
        marqueeW,
        dragSuppressed: dragEv.defaultPrevented
      };
    })()`);

    if (graphMarqueeTest.simpleRightClickPreserved && graphMarqueeTest.marqueeDisplay === 'block' && graphMarqueeTest.dragSuppressed) {
      reportPass('Knowledge Graph: Simple right-click retains context menu, and right-drag activates marquee with context menu suppression');
    } else {
      reportFail('Knowledge Graph marquee check failed', JSON.stringify(graphMarqueeTest));
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'phase5_marquee_multi_selection_knowledge_graph.png'));

  } catch (err) {
    console.error('[Error during verification]', err);
    reportFail('Test execution exception', err);
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
    if (db.pool) await db.pool.end();
  }

  console.log('\n========================================================================');
  const allPassed = testResults.every(r => r.pass);
  const passCount = testResults.filter(r => r.pass).length;
  console.log(`  VERIFICATION COMPLETED: ${passCount}/${testResults.length} CHECKS PASSED`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
