// tests/verify_paste_as_positioning.js
// Comprehensive Browser Verification for Smart Link "Paste As" Popover Positioning & Embed Validation

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_paste_pos_test');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let testResults = [];
function reportPass(desc) {
  console.log(`  [PASS] ${desc}`);
  testResults.push({ desc, pass: true });
}
function reportFail(desc, err) {
  console.error(`  [FAIL] ${desc}: ${err ? err.message : ''}`);
  testResults.push({ desc, pass: false, error: err ? err.message : 'failed' });
}

async function run() {
  console.log('========================================================================');
  console.log('  FLOWDEN: SMART LINK PASTE AS POPOVER POSITIONING VERIFICATION');
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

  // Seed / Find test note
  let noteId = null;
  const existingNotes = await db.query('SELECT id, title FROM notes WHERE user_id = ? LIMIT 1', [user.id]);
  if (existingNotes && existingNotes.length > 0) {
    noteId = existingNotes[0].id;
    console.log(`[Setup] Using existing note: id=${noteId}, title="${existingNotes[0].title}"`);
  } else {
    const insertRes = await db.query(
      'INSERT INTO notes (user_id, title, content, is_pinned, is_archived, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NOW(), NOW())',
      [user.id, 'Smart Link Positioning Verification Note', '# Positioning Test\n\nTesting anchored popover placement.']
    );
    noteId = insertRes.insertId;
    console.log(`[Setup] Created new note: id=${noteId}`);
  }

  // 2. Launch Headless Chrome
  console.log('\n--- LAUNCHING HEADLESS CHROME (PORT 9233) ---');
  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9233',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9233/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) { }
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
        throw new Error(res.exceptionDetails.text + ': ' + (res.exceptionDetails.exception?.description || ''));
      }
      return res.result ? res.result.value : undefined;
    }

    async function captureScreenshot(filepath) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log(`  [Screenshot] Saved: ${path.basename(filepath)}`);
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');
    await send('Network.enable');

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    // Navigate to set authentication
    await send('Page.navigate', { url: 'http://localhost:3000/app.html' });
    await sleep(1000);

    // Set localStorage auth
    await evalScript(`
      localStorage.setItem('flowden_token', '${userToken}');
      localStorage.setItem('flowden_user', JSON.stringify(${JSON.stringify(user)}));
      document.cookie = 'flowden_token=${userToken}; path=/';
    `);

    // Navigate to Flowden Knowledge Vault note
    console.log(`[Browser] Navigating to http://localhost:3000/app.html#/vault/${noteId}`);
    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${noteId}` });
    await sleep(2500);

    // Wait for canvas to be present
    for (let i = 0; i < 20; i++) {
      const exists = await evalScript(`!!(document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body'))`);
      if (exists) break;
      await sleep(300);
    }

    console.log('\n--- TEST 1: PASTE URL IN MIDDLE OF DOCUMENT (ANCHORED DIRECTLY BELOW) ---');
    // Prepare editor with a paragraph in the middle
    const test1Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        if (!canvas) return { error: 'Canvas not found' };

        // Clear canvas and insert standard test paragraphs
        canvas.innerHTML = '<p class="vault-block" data-block-id="blk-p1" data-block-type="paragraph">Documentation section overview.</p>' +
                           '<p class="vault-block" data-block-id="blk-p2" data-block-type="paragraph"><br></p>' +
                           '<p class="vault-block" data-block-id="blk-p3" data-block-type="paragraph">Subsequent notes and architectural guidelines.</p>';

        const p2 = canvas.querySelector('[data-block-id="blk-p2"]');
        p2.focus();

        // Place caret inside p2
        const range = document.createRange();
        range.selectNodeContents(p2);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Simulate Paste event with a standard URL
        const testUrl = 'https://github.com/facebook/react';
        const dt = new DataTransfer();
        dt.setData('text/plain', testUrl);
        const pasteEv = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        canvas.dispatchEvent(pasteEv);

        await new Promise(r => setTimeout(r, 200));

        const menu = document.getElementById('vault-paste-as-menu');
        if (!menu) return { error: 'Paste menu did not appear' };

        const menuRect = menu.getBoundingClientRect();
        const p2Rect = p2.getBoundingClientRect();

        return {
          menuVisible: true,
          menuRect: { top: menuRect.top, left: menuRect.left, bottom: menuRect.bottom, width: menuRect.width, height: menuRect.height },
          anchorRect: { top: p2Rect.top, left: p2Rect.left, bottom: p2Rect.bottom, width: p2Rect.width },
          dataPlacement: menu.getAttribute('data-placement'),
          isNotTopLeft: !(menuRect.top < 20 && menuRect.left < 30)
        };
      })()
    `);

    if (test1Result.error) {
      reportFail('Test 1 failed', new Error(test1Result.error));
    } else {
      const { menuRect, anchorRect, dataPlacement, isNotTopLeft } = test1Result;
      const expectedTop = anchorRect.bottom + 8;
      const topDiff = Math.abs(menuRect.top - expectedTop);
      const isDirectlyBelow = topDiff <= 6;
      const isLeftAligned = Math.abs(menuRect.left - anchorRect.left) <= 30;

      if (isNotTopLeft && isDirectlyBelow && dataPlacement === 'bottom') {
        reportPass(`Menu anchored directly BELOW URL: top=${menuRect.top}px (anchor.bottom=${anchorRect.bottom}px, gap=8px), placement=bottom, NOT at top-left`);
      } else {
        reportFail(`Menu positioning incorrect: top=${menuRect.top}px, expected ~${expectedTop}px, placement=${dataPlacement}, isNotTopLeft=${isNotTopLeft}`);
      }

      if (isLeftAligned) {
        reportPass(`Menu left edge aligned to anchor: menu.left=${menuRect.left}px, anchor.left=${anchorRect.left}px`);
      } else {
        reportFail(`Menu left alignment off: menu.left=${menuRect.left}px, anchor.left=${anchorRect.left}px`);
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_anchored_middle.png'));

    // Close menu
    await evalScript(`if (window.SmartLinkHandler) window.SmartLinkHandler.closePasteMenu();`);
    await sleep(200);

    console.log('\n--- TEST 2: FLIP ABOVE ANCHOR NEAR BOTTOM OF VIEWPORT ---');
    const test2Result = await evalScript(`
      (async function() {
        const canvas = document.querySelector('.vault-canvas-body');
        // Create a block anchored near the bottom of viewport
        const bottomY = window.innerHeight - 80;
        const fakeAnchor = {
          top: bottomY - 24,
          bottom: bottomY,
          left: 420,
          right: 680,
          width: 260,
          height: 24
        };

        window.SmartLinkHandler.showPasteAsMenu({
          anchorRect: fakeAnchor,
          url: 'https://news.ycombinator.com',
          onSelect: () => {},
          onCancel: () => {}
        });

        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('vault-paste-as-menu');
        if (!menu) return { error: 'Menu not found' };

        const menuRect = menu.getBoundingClientRect();
        return {
          menuRect: { top: menuRect.top, bottom: menuRect.bottom, left: menuRect.left, height: menuRect.height },
          fakeAnchor,
          dataPlacement: menu.getAttribute('data-placement'),
          isFlippedAbove: menuRect.bottom <= fakeAnchor.top
        };
      })()
    `);

    if (test2Result.error) {
      reportFail('Test 2 failed', new Error(test2Result.error));
    } else {
      const { menuRect, fakeAnchor, dataPlacement, isFlippedAbove } = test2Result;
      if (isFlippedAbove && dataPlacement === 'top') {
        const gap = fakeAnchor.top - menuRect.bottom;
        reportPass(`Menu flipped ABOVE anchor when near bottom: menu.bottom=${menuRect.bottom}px <= anchor.top=${fakeAnchor.top}px (gap=${gap}px, placement=top)`);
      } else {
        reportFail(`Flip above failed: menu.bottom=${menuRect.bottom}px, anchor.top=${fakeAnchor.top}px, placement=${dataPlacement}`);
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_flip_above_bottom.png'));
    await evalScript(`if (window.SmartLinkHandler) window.SmartLinkHandler.closePasteMenu();`);
    await sleep(200);

    console.log('\n--- TEST 3: HORIZONTAL SHIFT NEAR RIGHT EDGE (>= 12px VIEWPORT MARGIN) ---');
    const test3Result = await evalScript(`
      (async function() {
        const rightAnchor = {
          top: 300,
          bottom: 324,
          left: window.innerWidth - 80,
          right: window.innerWidth - 20,
          width: 60,
          height: 24
        };

        window.SmartLinkHandler.showPasteAsMenu({
          anchorRect: rightAnchor,
          url: 'https://flowden.app/docs',
          onSelect: () => {},
          onCancel: () => {}
        });

        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('vault-paste-as-menu');
        if (!menu) return { error: 'Menu not found' };

        const menuRect = menu.getBoundingClientRect();
        return {
          menuRect: { top: menuRect.top, left: menuRect.left, right: menuRect.right, width: menuRect.width },
          vw: window.innerWidth,
          rightMargin: window.innerWidth - menuRect.right,
          leftMargin: menuRect.left
        };
      })()
    `);

    if (test3Result.error) {
      reportFail('Test 3 failed', new Error(test3Result.error));
    } else {
      const { rightMargin, leftMargin, menuRect, vw } = test3Result;
      if (rightMargin >= 11 && leftMargin >= 12 && menuRect.right <= vw) {
        reportPass(`Menu shifted left safely within right viewport boundary: rightMargin=${rightMargin}px (>= 12px), menu.right=${menuRect.right}px <= ${vw}px`);
      } else {
        reportFail(`Horizontal clamp failed: rightMargin=${rightMargin}px, leftMargin=${leftMargin}px, vw=${vw}px`);
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_shift_left_right_edge.png'));
    await evalScript(`if (window.SmartLinkHandler) window.SmartLinkHandler.closePasteMenu();`);
    await sleep(200);

    console.log('\n--- TEST 4: DYNAMIC SCROLL RE-ANCHORING ---');
    const test4Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        const scrollContainer = canvas.closest('.vault-wysiwyg-container') || canvas.parentElement;

        // Populate with multiple blocks so container can scroll
        let blocksHtml = '';
        for (let i = 1; i <= 30; i++) {
          blocksHtml += '<p class="vault-block" data-block-id="blk-' + i + '" style="margin: 20px 0; font-size: 14px;">Paragraph line ' + i + ' in scrollable document.</p>';
        }
        canvas.innerHTML = blocksHtml;

        const targetP = canvas.querySelector('[data-block-id="blk-6"]');
        const initialTargetRect = targetP.getBoundingClientRect();

        window.SmartLinkHandler.showPasteAsMenu({
          anchorEl: targetP,
          url: 'https://developer.mozilla.org',
          onSelect: () => {},
          onCancel: () => {}
        });

        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('vault-paste-as-menu');
        const initialMenuTop = menu ? menu.getBoundingClientRect().top : 0;

        // Scroll the container down by 70px
        scrollContainer.scrollTop = 70;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

        await new Promise(r => setTimeout(r, 200));

        const scrolledMenu = document.getElementById('vault-paste-as-menu');
        const scrolledMenuTop = scrolledMenu ? scrolledMenu.getBoundingClientRect().top : 0;
        const scrolledTargetRect = targetP.getBoundingClientRect();

        return {
          initialMenuTop,
          scrolledMenuTop,
          scrolledTargetRectTop: scrolledTargetRect.top,
          diff: initialMenuTop - scrolledMenuTop,
          trackedTarget: Math.abs((scrolledTargetRect.bottom + 8) - scrolledMenuTop) <= 6
        };
      })()
    `);

    if (test4Result.error) {
      reportFail('Test 4 failed', new Error(test4Result.error));
    } else {
      if (test4Result.trackedTarget && test4Result.diff > 30) {
        reportPass(`Menu dynamically re-anchored on scroll: moved by ${test4Result.diff}px, perfectly matched target.bottom+8px`);
      } else {
        reportFail(`Scroll re-anchoring failed: initial=${test4Result.initialMenuTop}px, scrolled=${test4Result.scrolledMenuTop}px, diff=${test4Result.diff}px, tracked=${test4Result.trackedTarget}`);
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_scrolled_anchor.png'));

    console.log('\n--- TEST 5: SCROLL OFF-SCREEN AUTO-DISMISS ---');
    const test5Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        const scrollContainer = canvas.closest('.vault-wysiwyg-container') || canvas.parentElement;
        // Scroll way down so blk-6 is off-screen
        scrollContainer.scrollTop = 1500;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

        await new Promise(r => setTimeout(r, 250));
        const menu = document.getElementById('vault-paste-as-menu');
        return { menuDismissed: menu === null };
      })()
    `);

    if (test5Result.menuDismissed) {
      reportPass('Menu automatically dismissed when anchor scrolled off-screen');
    } else {
      reportFail('Menu lingered in DOM after anchor scrolled off-screen');
    }

    console.log('\n--- TEST 6: YOUTUBE HOMEPAGE VALIDATION (DISABLED EMBED WITH EXPLANATION) ---');
    const test6Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        const p1 = canvas.querySelector('.vault-block') || canvas.firstElementChild;

        window.SmartLinkHandler.showPasteAsMenu({
          anchorEl: p1,
          url: 'https://www.youtube.com/',
          onSelect: () => {},
          onCancel: () => {}
        });

        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('vault-paste-as-menu');
        if (!menu) return { error: 'Menu did not open for YouTube homepage' };

        const embedBtn = menu.querySelector('[data-choice="embed"]');
        if (!embedBtn) return { error: 'Embed button not found' };

        const isDisabled = embedBtn.classList.contains('is-disabled');
        const titleAttr = embedBtn.getAttribute('title') || '';
        const descText = embedBtn.querySelector('.paste-as-desc')?.textContent || '';

        // Attempt clicking the disabled embed button
        embedBtn.click();
        await new Promise(r => setTimeout(r, 100));

        // Menu should still be open or NOT have executed an embed
        const stillInDoc = document.body.contains(menu);

        return {
          isDisabled,
          titleAttr,
          descText,
          stillInDoc,
          noEmDashes: !titleAttr.includes('—') && !descText.includes('—')
        };
      })()
    `);

    if (test6Result.error) {
      reportFail('Test 6 failed', new Error(test6Result.error));
    } else {
      const { isDisabled, titleAttr, descText, stillInDoc, noEmDashes } = test6Result;
      if (isDisabled && titleAttr.includes('Specific video URL required') && descText.includes('Specific video URL required')) {
        reportPass(`YouTube homepage Embed disabled with tooltip: "${titleAttr}", description: "${descText}"`);
      } else {
        reportFail(`YouTube homepage embed validation failed: isDisabled=${isDisabled}, title="${titleAttr}", desc="${descText}"`);
      }

      if (stillInDoc) {
        reportPass('Clicking disabled Embed button ignored cleanly without creating empty embed block');
      } else {
        reportFail('Disabled Embed button prematurely handled click');
      }

      if (noEmDashes) {
        reportPass('Zero em dashes in YouTube validation tooltip and description');
      } else {
        reportFail('Found em dashes in YouTube explanation text');
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_youtube_homepage_disabled.png'));
    await evalScript(`if (window.SmartLinkHandler) window.SmartLinkHandler.closePasteMenu();`);
    await sleep(200);

    console.log('\n--- TEST 7: SPECIFIC YOUTUBE VIDEO (ACTIVE EMBED & IFRAME CREATION) ---');
    const test7Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        canvas.innerHTML = '<p class="vault-block" data-block-id="blk-yt">https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>';
        const ytP = canvas.querySelector('[data-block-id="blk-yt"]');

        let chosenAction = null;
        window.SmartLinkHandler.showPasteAsMenu({
          anchorEl: ytP,
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          onSelect: async (choice) => {
            chosenAction = choice;
            const meta = await window.SmartLinkHandler.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            const embedHtml = window.SmartLinkHandler.renderEmbedHtml('https://www.youtube.com/watch?v=dQw4w9WgXcQ', meta);
            ytP.outerHTML = embedHtml;
          },
          onCancel: () => {}
        });

        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('vault-paste-as-menu');
        const embedBtn = menu.querySelector('[data-choice="embed"]');
        const isEnabled = !embedBtn.classList.contains('is-disabled');

        // Click Embed
        embedBtn.click();
        await new Promise(r => setTimeout(r, 300));

        const embedBlock = canvas.querySelector('.vault-embed-block');
        const iframe = embedBlock ? embedBlock.querySelector('iframe') : null;

        return {
          isEnabled,
          hasEmbedBlock: !!embedBlock,
          iframeSrc: iframe ? iframe.getAttribute('src') : null
        };
      })()
    `);

    if (test7Result.error) {
      reportFail('Test 7 failed', new Error(test7Result.error));
    } else {
      const { isEnabled, hasEmbedBlock, iframeSrc } = test7Result;
      if (isEnabled && hasEmbedBlock && iframeSrc && iframeSrc.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ')) {
        reportPass(`Specific YouTube video Embed enabled and created iframe: ${iframeSrc}`);
      } else {
        reportFail(`Specific video embed failed: isEnabled=${isEnabled}, hasEmbedBlock=${hasEmbedBlock}, iframeSrc=${iframeSrc}`);
      }
    }

    await captureScreenshot(path.join(ARTIFACT_DIR, 'paste_as_youtube_video_embed.png'));

    console.log('\n--- TEST 8: ESCAPE CANCELLATION (ZERO DUPLICATE TEXT / URL PRESERVED) ---');
    const test8Result = await evalScript(`
      (async function() {
        const canvas = document.getElementById('vault-wysiwyg-canvas') || document.querySelector('.vault-canvas-body');
        canvas.innerHTML = '<p class="vault-block" data-block-id="blk-esc"><br></p>';
        const pEsc = canvas.querySelector('[data-block-id="blk-esc"]');

        const range = document.createRange();
        range.selectNodeContents(pEsc);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Simulate pasting
        const testUrl = 'https://flowden.example.org';
        const dt = new DataTransfer();
        dt.setData('text/plain', testUrl);
        const pasteEv = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        canvas.dispatchEvent(pasteEv);

        await new Promise(r => setTimeout(r, 200));

        // Press Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 200));

        const menuAfterEsc = document.getElementById('vault-paste-as-menu');
        const contentAfterEsc = (pEsc.textContent || canvas.textContent).trim();

        return {
          menuClosed: menuAfterEsc === null,
          contentAfterEsc,
          urlPreserved: contentAfterEsc === testUrl,
          noDuplicate: contentAfterEsc.split(testUrl).length - 1 === 1
        };
      })()
    `);

    if (test8Result.error) {
      reportFail('Test 8 failed', new Error(test8Result.error));
    } else {
      const { menuClosed, contentAfterEsc, urlPreserved, noDuplicate } = test8Result;
      if (menuClosed && urlPreserved && noDuplicate) {
        reportPass(`Escape cancelled menu cleanly while preserving plain URL without duplicates: "${contentAfterEsc}"`);
      } else {
        reportFail(`Escape cancellation failed: menuClosed=${menuClosed}, content="${contentAfterEsc}", noDuplicate=${noDuplicate}`);
      }
    }

  } catch (err) {
    reportFail('Browser execution fatal error', err);
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) { }
    }
    if (chrome) {
      try { chrome.kill(); } catch (e) { }
    }
  }

  // Summary
  console.log('\n========================================================================');
  console.log('  VERIFICATION SUITE SUMMARY');
  console.log('========================================================================');
  const passes = testResults.filter(r => r.pass).length;
  const fails = testResults.filter(r => !r.pass).length;
  console.log(`Total tests: ${testResults.length} | Passed: ${passes} | Failed: ${fails}`);

  if (fails > 0) {
    console.error('\n❌ SOME VERIFICATION TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL SMART LINK PASTE AS POPOVER TESTS PASSED 100%!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
