const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.chrome_phase6_verify');
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('[1/6] Initializing MySQL test DB & generating admin auth token...');
  await db.initDB();
  const users = await db.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
  const user = users[0];
  const userToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    authConfig.jwtSecret,
    { expiresIn: '7d' }
  );

  console.log('[2/6] Launching Chrome headless instance...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9245',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1050'
  ]);

  await sleep(2200);

  const listRes = await fetch('http://127.0.0.1:9245/json/list');
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

  async function captureScreenshot(filename) {
    const shot = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      const fullPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
      console.log(`  [Screenshot saved] ${filename}`);
      return fullPath;
    }
    return null;
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

  const report = {
    multiSelection: {},
    youtubeThumbnails: {},
    genericBookmarks: {},
    regressions: {}
  };

  try {
    // =========================================================================
    // PART A: MULTI-SELECTION & BULK OPERATIONS
    // =========================================================================
    console.log('[3/6] Testing Part A: Complete Notion-Style Multi-Selection & Bulk Operations...');

    // Create a dedicated test note with mixed block types
    const initialMarkdown = [
      '# Section 1: Architecture Overview',
      '',
      'Paragraph Alpha: Core workspace state is synchronized across views.',
      '',
      '- [x] Checklist Beta: Verify multi-block selection state',
      '',
      '> [!NOTE] Callout Gamma: Selected blocks preserve document order.',
      '',
      'Paragraph Delta: Unselected anchor block below the group.',
      '',
      '| Metric | Target |',
      '| --- | --- |',
      '| Latency | 12ms |',
      '',
      '![Diagram Caption](/uploads/sample-diagram.png)'
    ].join('\n');

    const noteResult = await db.query(
      'INSERT INTO notes (user_id, title, content, is_pinned) VALUES (?, ?, ?, 1)',
      [user.id, 'Phase 6 Multi-Selection & Bulk Operations Test', initialMarkdown]
    );
    const multiNoteId = noteResult.insertId;

    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${multiNoteId}` });
    await sleep(1500);
    await evaluate(`localStorage.setItem('flowden_token', '${userToken}');`);
    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${multiNoteId}` });
    await sleep(2500);

    // 1. Measure block coordinates for blocks 1, 2, 3 (Paragraph Alpha, Checklist Beta, Callout Gamma)
    const blockCoords = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        return blocks.map((b, idx) => {
          const r = b.getBoundingClientRect();
          return {
            idx,
            id: b.getAttribute('data-block-id'),
            type: b.getAttribute('data-block-type'),
            text: b.textContent.trim().slice(0, 40),
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right
          };
        });
      })()
    `);

    const startX = Math.round(blockCoords[1].left + 40);
    const startY = Math.round(blockCoords[1].top + 4);
    const endX = Math.round(blockCoords[3].left + 260);
    const endY = Math.round(blockCoords[3].bottom - 4);

    // Right-drag across blocks 1, 2, 3 (Paragraph Alpha, Checklist Beta, Callout Gamma)
    await sendCmd('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: startX,
      y: startY,
      button: 'right',
      buttons: 2,
      clickCount: 1
    });
    await sleep(60);
    await sendCmd('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round((startX + endX) / 2),
      y: Math.round((startY + endY) / 2),
      button: 'right',
      buttons: 2
    });
    await sleep(60);
    await sendCmd('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: endX,
      y: endY,
      button: 'right',
      buttons: 2
    });
    await sleep(120);

    // Capture Screenshot 1: Three selected blocks during/with active marquee & selection
    await captureScreenshot('phase6_multiselect_three_blocks_selected.png');

    await sendCmd('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: endX,
      y: endY,
      button: 'right',
      buttons: 0,
      clickCount: 1
    });
    await sleep(250);

    // Capture Screenshot 2: Multi-Selection Bulk Action Toolbar above the 3 selected blocks
    await captureScreenshot('phase6_multiselect_bulk_toolbar.png');

    const selectionCheck = await evaluate(`
      (function() {
        const selected = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block.vault-block--selected'));
        const tb = document.getElementById('vault-multiselect-toolbar');
        const badge = document.getElementById('vault-ms-count-badge');
        return {
          selectedCount: selected.length,
          selectedTexts: selected.map(b => b.textContent.trim().slice(0, 30)),
          selectedTypes: selected.map(b => b.getAttribute('data-block-type')),
          toolbarVisible: !!(tb && window.getComputedStyle(tb).display !== 'none'),
          badgeText: badge ? badge.textContent.trim() : '',
          hasAllButtons: !!(
            tb &&
            tb.querySelector('[data-bulk-action="move-up"]') &&
            tb.querySelector('[data-bulk-action="move-down"]') &&
            tb.querySelector('[data-bulk-action="duplicate"]') &&
            tb.querySelector('[data-bulk-action="copy"]') &&
            tb.querySelector('[data-bulk-action="cut"]') &&
            tb.querySelector('[data-bulk-action="delete"]') &&
            tb.querySelector('[data-bulk-action="deselect"]')
          )
        };
      })()
    `);
    report.multiSelection.selectionAndToolbar = selectionCheck;
    console.log('  [Step A.1-3 Selection & Toolbar]', JSON.stringify(selectionCheck));

    // 4-5. Move the 3 selected blocks together BELOW Paragraph Delta (using Move Down button on toolbar)
    await evaluate(`
      document.querySelector('#vault-multiselect-toolbar [data-bulk-action="move-down"]').click();
    `);
    await sleep(300);

    await captureScreenshot('phase6_multiselect_group_move_result.png');

    const afterMoveOrder = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        return {
          domTexts: blocks.map(b => b.textContent.trim().slice(0, 25)),
          selectedStillCount: document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block.vault-block--selected').length
        };
      })()
    `);
    report.multiSelection.groupMoveDown = afterMoveOrder;
    console.log('  [Step A.4-5 Group Move Result]', JSON.stringify(afterMoveOrder));

    // 6-7. Save, navigate away to #/dashboard, reopen #/vault/${multiNoteId}, and verify new order persists!
    await evaluate(`
      (function() {
        const saveBtn = document.getElementById('vault-save-btn') || document.querySelector('[data-action="save-note"]');
        if (saveBtn) saveBtn.click();
      })()
    `);
    await sleep(1200);
    await sendCmd('Page.navigate', { url: 'http://localhost:3000/app.html#/dashboard' });
    await sleep(1000);
    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${multiNoteId}` });
    await sleep(2000);

    const persistedMoveOrder = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        return blocks.map(b => b.textContent.trim().slice(0, 25));
      })()
    `);
    report.multiSelection.persistedOrderAfterReload = persistedMoveOrder;
    console.log('  [Step A.6-7 Persisted Order After Reload]', JSON.stringify(persistedMoveOrder));

    // 8-11. Re-select the 3 moved blocks (now at indices 2, 3, 4) and test Bulk Duplicate + Undo + Redo
    await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        // Select indices 2, 3, 4 (Paragraph Alpha, Checklist Beta, Callout Gamma)
        blocks[2].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        blocks[3].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        blocks[4].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
      })()
    `);
    await sleep(200);

    // Click Duplicate in the Multi-Selection Toolbar
    await evaluate(`
      document.querySelector('#vault-multiselect-toolbar [data-bulk-action="duplicate"]').click();
    `);
    await sleep(300);

    await captureScreenshot('phase6_multiselect_duplicate_result.png');

    const dupResult = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        const ids = blocks.map(b => b.getAttribute('data-block-id'));
        const uniqueIds = new Set(ids);
        return {
          totalBlocksAfterDup: blocks.length,
          allIdsUnique: uniqueIds.size === blocks.length,
          domTexts: blocks.map(b => b.textContent.trim().slice(0, 22))
        };
      })()
    `);

    // 10. Undo duplication (single transaction removes all 3 duplicated blocks)
    await evaluate(`document.getElementById('vault-undo-btn').click();`);
    await sleep(250);
    const afterUndoDupCount = await evaluate(`document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block').length`);

    // 11. Redo duplication (single transaction restores all 3 duplicated blocks)
    await evaluate(`document.getElementById('vault-redo-btn').click();`);
    await sleep(250);
    const afterRedoDupCount = await evaluate(`document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block').length`);

    // Undo once more to return to clean 7-block state before testing Delete
    await evaluate(`document.getElementById('vault-undo-btn').click();`);
    await sleep(250);

    report.multiSelection.duplicateAndUndoRedo = {
      ...dupResult,
      afterUndoDupCount,
      afterRedoDupCount
    };
    console.log('  [Step A.8-11 Duplicate + Undo/Redo]', JSON.stringify(report.multiSelection.duplicateAndUndoRedo));

    // 12-15. Select 3 blocks and Delete them together, then Undo deletion
    await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        blocks[2].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        blocks[3].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        blocks[4].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
      })()
    `);
    await sleep(150);

    await evaluate(`
      document.querySelector('#vault-multiselect-toolbar [data-bulk-action="delete"]').click();
    `);
    await sleep(250);

    const afterDeleteState = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        return {
          remainingCount: blocks.length,
          remainingTexts: blocks.map(b => b.textContent.trim().slice(0, 22))
        };
      })()
    `);

    // Undo bulk delete -> all 3 deleted blocks return in one step!
    await evaluate(`document.getElementById('vault-undo-btn').click();`);
    await sleep(300);

    await captureScreenshot('phase6_multiselect_delete_and_undo_result.png');

    const afterUndoDeleteState = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        return {
          restoredCount: blocks.length,
          restoredTexts: blocks.map(b => b.textContent.trim().slice(0, 22))
        };
      })()
    `);

    report.multiSelection.deleteAndUndo = {
      afterDeleteState,
      afterUndoDeleteState
    };
    console.log('  [Step A.12-15 Delete + Undo]', JSON.stringify(report.multiSelection.deleteAndUndo));

    // 16-19. Test Copy, Cut, Paste multiple blocks (including table and image block)
    const copyCutPasteResult = await evaluate(`
      (function() {
        const blocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block'));
        // Select Table and Image block (last 2 blocks)
        const tableBlock = blocks.find(b => b.getAttribute('data-block-type') === 'table');
        const imgBlock = blocks.find(b => b.getAttribute('data-block-type') === 'image');
        tableBlock.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        imgBlock.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));

        // Copy via toolbar button
        document.querySelector('#vault-multiselect-toolbar [data-bulk-action="copy"]').click();

        // Dispatch Ctrl+V to paste the copied blocks
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
        const countAfterCopyPaste = document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block').length;

        // Now Cut the currently selected pasted blocks
        document.querySelector('#vault-multiselect-toolbar [data-bulk-action="cut"]').click();
        const countAfterCut = document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block').length;

        // Paste them at the top block
        const firstBlock = document.querySelector('#vault-wysiwyg-canvas > .vault-block');
        firstBlock.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
        const countAfterCutPaste = document.querySelectorAll('#vault-wysiwyg-canvas > .vault-block').length;
        const imgCount = document.querySelectorAll('#vault-wysiwyg-canvas > .vault-image-block img[src="/uploads/sample-diagram.png"]').length;

        return {
          countAfterCopyPaste,
          countAfterCut,
          countAfterCutPaste,
          imgCount
        };
      })()
    `);
    report.multiSelection.copyCutPaste = copyCutPasteResult;
    console.log('  [Step A.16-19 Copy/Cut/Paste]', JSON.stringify(copyCutPasteResult));

    // =========================================================================
    // PART B: YOUTUBE VIDEO THUMBNAIL & PLAYBACK VERIFICATION
    // =========================================================================
    console.log('[4/6] Testing Part B: YouTube Video Thumbnails (Bookmark, Embed, Shorts, Playback & Unavailable Fallback)...');

    const ytUrl1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const ytUrl2 = 'https://youtu.be/jNQXAC9IVRw';
    const ytShortsUrl = 'https://www.youtube.com/shorts/jNQXAC9IVRw';
    const ytInvalidUrl = 'https://www.youtube.com/watch?v=00000000000';

    const ytNoteMarkdown = [
      '# YouTube Video Previews & Playback Verification',
      '',
      `[bookmark: Rick Astley - Never Gonna Give You Up](${ytUrl1} "Official Music Video")`,
      '',
      `[bookmark: Me at the zoo](${ytUrl2} "First YouTube Video")`,
      '',
      `[embed: youtube](${ytUrl1} "Rick Astley - Never Gonna Give You Up")`,
      '',
      `[embed: youtube](${ytShortsUrl} "YouTube Shorts Preview")`,
      '',
      `[embed: youtube](${ytInvalidUrl} "Unavailable Video Test")`
    ].join('\n');

    const ytNoteResult = await db.query(
      'INSERT INTO notes (user_id, title, content, is_pinned) VALUES (?, ?, ?, 1)',
      [user.id, 'Phase 6 YouTube Thumbnails & Player Test', ytNoteMarkdown]
    );
    const ytNoteId = ytNoteResult.insertId;

    await sendCmd('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${ytNoteId}` });
    // Wait for real YouTube thumbnail images from i.ytimg.com to finish loading
    await sleep(4000);

    // Capture Screenshot 6: YouTube Bookmark Thumbnail
    await captureScreenshot('phase6_youtube_bookmark_thumbnail.png');

    // Scroll down slightly so Embed blocks are centered and capture Screenshot 7: YouTube Embed Thumbnail before Play
    await evaluate(`
      (function() {
        const embedBlock = document.querySelector('#vault-wysiwyg-canvas .vault-embed-block');
        if (embedBlock) embedBlock.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `);
    await sleep(500);
    await captureScreenshot('phase6_youtube_embed_thumbnail_before_play.png');

    const ytInspection = await evaluate(`
      (function() {
        const bookmarkBlocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas .vault-bookmark-block'));
        const embedBlocks = Array.from(document.querySelectorAll('#vault-wysiwyg-canvas .vault-embed-block'));

        const bookmarks = bookmarkBlocks.map(b => {
          const img = b.querySelector('.vault-bookmark-thumb img.vault-yt-thumb');
          const fav = b.querySelector('.vault-bookmark-favicon');
          return {
            url: b.getAttribute('data-url'),
            videoId: b.getAttribute('data-video-id'),
            thumbSrc: img ? img.currentSrc || img.src : null,
            complete: img ? img.complete : false,
            naturalWidth: img ? img.naturalWidth : 0,
            naturalHeight: img ? img.naturalHeight : 0,
            faviconSrc: fav ? fav.src : null,
            faviconSeparateFromThumb: !!(img && fav && img.src !== fav.src)
          };
        });

        const embeds = embedBlocks.map(b => {
          const img = b.querySelector('.vault-yt-thumb-wrapper img.vault-yt-thumb');
          const wrapper = b.querySelector('.vault-yt-thumb-wrapper');
          const fallbackEl = b.querySelector('.vault-yt-unavailable-fallback');
          return {
            url: b.getAttribute('data-url'),
            videoId: b.getAttribute('data-video-id'),
            isShorts: b.getAttribute('data-shorts') === 'true',
            thumbSrc: img ? img.currentSrc || img.src : null,
            complete: img ? img.complete : false,
            naturalWidth: img ? img.naturalWidth : 0,
            naturalHeight: img ? img.naturalHeight : 0,
            isUnavailableFallbackActive: !!(wrapper && wrapper.classList.contains('is-unavailable')),
            fallbackVisible: !!(fallbackEl && window.getComputedStyle(fallbackEl).display !== 'none'),
            initialIframeCount: b.querySelectorAll('iframe').length
          };
        });

        return { bookmarks, embeds };
      })()
    `);
    report.youtubeThumbnails.initialRender = ytInspection;
    console.log('  [Step B.1-8,11,12 YouTube Thumbnails Inspection]', JSON.stringify(ytInspection));

    // 9. Click YouTube Bookmark and verify navigation
    const bookmarkClickUrl = await evaluate(`
      (function() {
        window.__openedUrls = [];
        const origOpen = window.open;
        window.open = function(url) { window.__openedUrls.push(url); };
        const firstBm = document.querySelector('#vault-wysiwyg-canvas .vault-bookmark-card');
        if (firstBm) firstBm.click();
        window.open = origOpen;
        return window.__openedUrls[0] || null;
      })()
    `);
    report.youtubeThumbnails.bookmarkClickNavigation = bookmarkClickUrl;

    // 10. Click YouTube Embed Play button and verify iframe activation
    const playActivation = await evaluate(`
      (function() {
        const firstEmbedPlay = document.querySelector('#vault-wysiwyg-canvas .vault-embed-block .vault-yt-play-btn');
        if (firstEmbedPlay) firstEmbedPlay.click();
        const activeIframe = document.querySelector('#vault-wysiwyg-canvas .vault-embed-block iframe.vault-yt-active-iframe');
        return {
          iframeCreated: !!activeIframe,
          iframeSrc: activeIframe ? activeIframe.getAttribute('src') : null
        };
      })()
    `);
    await sleep(1200);
    await captureScreenshot('phase6_youtube_player_after_play.png');
    report.youtubeThumbnails.playActivation = playActivation;
    console.log('  [Step B.9-10 Bookmark Click & Embed Play]', JSON.stringify({ bookmarkClickUrl, playActivation }));

    // =========================================================================
    // PART C: GENERIC BOOKMARK & FALLBACK VERIFICATION
    // =========================================================================
    console.log('[5/6] Testing Part C: Generic Website Bookmarks & Clean Fallbacks...');

    const genericBookmarkTest = await evaluate(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas');
        const h1 = SmartLinkHandler.renderBookmarkHtml('https://localhost:3000/docs', {
          title: 'Flowden Documentation Portal',
          description: 'Valid preview image bookmark card',
          domain: 'flowden.io',
          image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225'%3E%3Crect width='400' height='225' fill='%231e293b'/%3E%3Ccircle cx='200' cy='112' r='50' fill='%2378c8b2'/%3E%3C/svg%3E"
        }, 'blk_gen_1');

        const h2 = SmartLinkHandler.renderBookmarkHtml('https://example.com/article', {
          title: 'Example Article Without OG Image',
          description: 'Clean compact website preview card with no image',
          domain: 'example.com',
          image: ''
        }, 'blk_gen_2');

        const h3 = SmartLinkHandler.renderBookmarkHtml('https://example.org/broken-image', {
          title: 'Website With Broken Image URL & Broken Favicon',
          description: 'Should hide broken thumbnail container and fallback favicon cleanly',
          domain: 'example.org',
          favicon: 'https://localhost:3000/non-existent-favicon-404.ico',
          image: 'https://localhost:3000/non-existent-og-image-404.png'
        }, 'blk_gen_3');

        const wrapper = document.createElement('div');
        wrapper.innerHTML = h1 + h2 + h3;
        while (wrapper.firstElementChild) {
          canvas.appendChild(wrapper.firstElementChild);
        }
        return true;
      })()
    `);
    await sleep(1000);

    await evaluate(`
      (function() {
        const el = document.querySelector('[data-block-id="blk_gen_1"]');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `);
    await sleep(400);
    await captureScreenshot('phase6_generic_bookmark_and_fallback.png');

    const genericResults = await evaluate(`
      (function() {
        const b1 = document.querySelector('[data-block-id="blk_gen_1"]');
        const b2 = document.querySelector('[data-block-id="blk_gen_2"]');
        const b3 = document.querySelector('[data-block-id="blk_gen_3"]');

        const b1Img = b1 ? b1.querySelector('.vault-bookmark-thumb img') : null;
        const b2Thumb = b2 ? b2.querySelector('.vault-bookmark-thumb') : null;
        const b3Thumb = b3 ? b3.querySelector('.vault-bookmark-thumb') : null;
        const b3Fav = b3 ? b3.querySelector('.vault-bookmark-favicon') : null;

        return {
          validOgImageLoaded: !!(b1Img && b1Img.complete && b1Img.naturalWidth > 0),
          noImageCardHasNoThumbElement: !b2Thumb,
          brokenImageThumbHiddenCleanly: !!(b3Thumb && (b3Thumb.getAttribute('data-thumb-hidden') === 'true' || window.getComputedStyle(b3Thumb).display === 'none')),
          brokenFaviconFellBackToSvg: !!(b3Fav && b3Fav.src.startsWith('data:image/svg+xml'))
        };
      })()
    `);
    report.genericBookmarks = genericResults;
    console.log('  [Step C Generic Bookmarks & Fallbacks]', JSON.stringify(genericResults));

    console.log('[6/6] All Phase 6 browser verifications complete!');
    fs.writeFileSync(
      path.join(__dirname, 'phase6_verification_results.json'),
      JSON.stringify(report, null, 2)
    );
  } finally {
    ws.close();
    chrome.kill();
  }
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
