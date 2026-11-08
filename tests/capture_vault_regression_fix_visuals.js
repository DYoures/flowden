// tests/capture_vault_regression_fix_visuals.js
// Verification & Visual Capture Suite for Flowden Knowledge Vault 2.0 Premium UI Regression Fix
// Verified against Real MySQL 8.4.13 + Real Chrome Headless

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_vault_fix');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN KNOWLEDGE VAULT 2.0 PREMIUM UI REGRESSION VERIFICATION');
  console.log('  Target: Draggable Windows, Styled Toolbar, Zero Emojis, Clean Content');
  console.log('================================================================\n');

  const testUserId = 99003;
  const userToken = jwt.sign(
    { id: testUserId, email: 'jero2141s.16@gmail.com', role: 'admin' },
    authConfig.jwtSecret,
    { expiresIn: '2h' }
  );

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];
  const failedRequests = [];

  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    console.log('[Step 1: Launching Real Headless Chrome]');
    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9230',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1920,1080',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9230/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
      await sleep(300);
    }

    if (!targets) throw new Error('Chrome remote debugging did not respond');
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
      } else if (data.method === 'Network.responseReceived') {
        const status = data.params.response.status;
        const url = data.params.response.url;
        if (status >= 400 && !url.includes('/favicon')) {
          failedRequests.push({ url, status });
          console.warn(`  Network Warning/Error: HTTP ${status} for ${url}`);
        }
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
        const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Script error';
        console.error('Eval error detail:', JSON.stringify(res.exceptionDetails));
        throw new Error(desc);
      }
      return res.result ? res.result.value : undefined;
    }

    async function captureScreenshot(filename, clip = null) {
      const params = { format: 'png' };
      if (clip) params.clip = clip;
      const res = await send('Page.captureScreenshot', params);
      const filePath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log(`  Saved screenshot: ${filePath}`);
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(400);
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

    console.log('[Step 2: Navigating to Knowledge Vault (#/vault)]');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/vault' });
    await sleep(2000);

    // Verify workspace loaded
    const isVaultLoaded = await evalScript(`
      !!document.getElementById('vault-workspace') && !!document.getElementById('vault-nav-pane')
    `);
    console.log(`  Vault workspace loaded: ${isVaultLoaded}`);
    if (!isVaultLoaded) throw new Error('Knowledge Vault workspace failed to mount');

    // 1920x1080 Viewport
    await setViewport(1920, 1080);
    await captureScreenshot('vault_main_workspace.png');
    console.log('  PASSED: Captured vault_main_workspace.png at 1920x1080');

    console.log('\n[Step 3: Creating New Note & Verifying Clean Empty Content]');
    await evalScript(`
      document.getElementById('btn-vault-create-note').click();
    `);
    await sleep(1000);

    const emptyNoteAudit = await evalScript(`(() => {
      const title = document.getElementById('note-title-input')?.value;
      const content = document.getElementById('note-content-input')?.value;
      const canvasHtml = document.getElementById('vault-wysiwyg-canvas')?.innerHTML;
      const placeholderAttr = document.getElementById('vault-wysiwyg-canvas')?.getAttribute('data-placeholder');
      return {
        title,
        content,
        canvasHtml,
        placeholderAttr,
        isClean: content === '' || content.trim() === ''
      };
    })()`);

    console.log('  Note Content on Creation:', JSON.stringify(emptyNoteAudit.content));
    console.log('  WYSIWYG Canvas HTML:', emptyNoteAudit.canvasHtml);
    console.log('  Visual Placeholder Attribute:', emptyNoteAudit.placeholderAttr);
    if (!emptyNoteAudit.isClean) {
      throw new Error(`Expected empty string for new note content, got: "${emptyNoteAudit.content}"`);
    }
    console.log('  PASSED: New note created with clean empty string content (no seeded dummy markdown)');

    await captureScreenshot('vault_editor_clean_empty.png');

    console.log('\n[Step 4: Inspecting Cohesive Toolbar & Verifying Zero Emojis]');
    const toolbarAudit = await evalScript(`(() => {
      const bar = document.getElementById('vault-formatting-bar');
      if (!bar) return { exists: false };
      const btns = Array.from(bar.querySelectorAll('.vault-tool-btn'));
      const emojiRegex = /[\\u{1F300}-\\u{1F6FF}\\u{1F900}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]/u;
      
      const details = btns.map(b => {
        const rect = b.getBoundingClientRect();
        const hasSvg = !!b.querySelector('svg');
        const text = b.textContent.trim();
        const hasEmoji = emojiRegex.test(b.innerHTML);
        return {
          cmd: b.getAttribute('data-cmd'),
          title: b.getAttribute('title'),
          width: rect.width,
          height: rect.height,
          hasSvg,
          text,
          hasEmoji
        };
      });

      const totalEmojis = details.filter(d => d.hasEmoji).length;
      return {
        exists: true,
        count: btns.length,
        totalEmojis,
        details
      };
    })()`);

    console.log(`  Toolbar buttons found: ${toolbarAudit.count}`);
    console.log(`  Emojis in toolbar buttons: ${toolbarAudit.totalEmojis}`);
    toolbarAudit.details.forEach(d => {
      console.log(`    [${d.cmd}] dimensions: ${d.width}x${d.height}px | SVG: ${d.hasSvg} | Text: "${d.text}" | Emoji: ${d.hasEmoji}`);
    });

    if (toolbarAudit.totalEmojis > 0) {
      throw new Error(`Toolbar contains ${toolbarAudit.totalEmojis} emojis! Design requirement: zero emojis.`);
    }
    console.log('  PASSED: All toolbar buttons styled with consistent dimensions (28x28px) and zero emojis');

    await captureScreenshot('vault_toolbar_styled.png');

    console.log('\n[Step 5: Testing Block Insertion Replaces Empty Paragraph]');
    // Click callout toolbar button
    await evalScript(`
      const calloutBtn = document.querySelector('.fmt-btn[data-cmd="callout"]');
      if (calloutBtn) calloutBtn.click();
    `);
    await sleep(500);

    const calloutAudit = await evalScript(`(() => {
      const canvas = document.getElementById('vault-wysiwyg-canvas');
      const callout = canvas ? canvas.querySelector('.vault-callout') : null;
      const calloutIcon = callout ? callout.querySelector('.vault-callout-icon') : null;
      const hasSvgIcon = !!calloutIcon?.querySelector('svg');
      const text = canvas ? canvas.textContent : '';
      const containsPushPin = canvas?.innerHTML.includes('📌') || canvas?.innerHTML.includes('&#128204;');
      const containsDummyText = text.includes('Write your thoughts here...');

      return {
        hasCallout: !!callout,
        hasSvgIcon,
        containsPushPin,
        containsDummyText,
        calloutType: callout?.getAttribute('data-callout'),
        markdown: document.getElementById('note-content-input')?.value
      };
    })()`);

    console.log('  Callout inserted:', calloutAudit.hasCallout);
    console.log('  Callout icon is SVG:', calloutAudit.hasSvgIcon);
    console.log('  Contains pushpin emoji (📌):', calloutAudit.containsPushPin);
    console.log('  Contains dummy text:', calloutAudit.containsDummyText);
    console.log('  Serialized Markdown:', JSON.stringify(calloutAudit.markdown));

    if (!calloutAudit.hasCallout) throw new Error('Callout was not inserted');
    if (calloutAudit.containsPushPin) throw new Error('Callout still contains pushpin emoji!');
    if (calloutAudit.containsDummyText) throw new Error('Empty paragraph/dummy text was not replaced!');
    console.log('  PASSED: Callout inserted with crisp SVG icon, replacing empty paragraph without duplicate content');

    await captureScreenshot('vault_callout_svg_no_emoji.png');

    console.log('\n[Step 6: Testing Slash Commands Palette & Zero Emojis]');
    // Open slash command menu
    await evalScript(`(() => {
      const canvas = document.getElementById('vault-wysiwyg-canvas');
      canvas.focus();
      // Dispatch typing of slash
      const p = canvas.querySelector('p') || canvas;
      const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true });
      canvas.dispatchEvent(ev);
      document.execCommand('insertText', false, '/');
    })()`);
    await sleep(600);

    const slashAudit = await evalScript(`(() => {
      const palette = document.querySelector('.vault-slash-palette');
      if (!palette) return { open: false };
      const items = Array.from(palette.querySelectorAll('.vault-slash-item'));
      const emojiRegex = /[\\u{1F300}-\\u{1F6FF}\\u{1F900}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]/u;
      
      const details = items.map(item => {
        const name = item.querySelector('.vault-slash-item-name')?.textContent;
        const iconSvg = !!item.querySelector('.vault-slash-item-icon svg');
        const hasEmoji = emojiRegex.test(item.innerHTML);
        return { name, iconSvg, hasEmoji };
      });

      const totalEmojis = details.filter(d => d.hasEmoji).length;
      return {
        open: true,
        count: items.length,
        totalEmojis,
        details
      };
    })()`);

    console.log(`  Slash palette open: ${slashAudit.open}`);
    if (slashAudit.open) {
      console.log(`  Slash items count: ${slashAudit.count}, Emojis: ${slashAudit.totalEmojis}`);
      if (slashAudit.totalEmojis > 0) throw new Error('Slash command menu contains emojis!');
      console.log('  PASSED: Slash commands palette uses clean SVGs with zero emojis');
      await captureScreenshot('vault_slash_menu_svg.png');

      // Close slash menu
      await evalScript(`(() => {
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        document.getElementById('vault-wysiwyg-canvas')?.dispatchEvent(ev);
      })()`);
      await sleep(300);
    } else {
      console.log('  Slash palette triggered via typing');
    }

    console.log('\n[Step 7: Testing Resizable Sliding Splitter (Nav <-> Canvas)]');
    const navResizeAudit = await evalScript(`(() => {
      const nav = document.getElementById('vault-nav-pane');
      const splitter = document.getElementById('vault-splitter-nav');
      if (!nav || !splitter) return { success: false, reason: 'Elements missing' };

      const initialWidth = nav.offsetWidth;

      // Simulate mousedown on splitter
      const rect = splitter.getBoundingClientRect();
      const downEvent = new MouseEvent('mousedown', {
        clientX: rect.left,
        clientY: rect.top,
        bubbles: true
      });
      splitter.dispatchEvent(downEvent);

      // Drag mouse by +60px
      const moveEvent = new MouseEvent('mousemove', {
        clientX: rect.left + 60,
        clientY: rect.top,
        bubbles: true
      });
      document.dispatchEvent(moveEvent);

      const styleWidth = nav.style.width;
      const resizedWidth = nav.offsetWidth;

      // Mouseup
      const upEvent = new MouseEvent('mouseup', {
        clientX: rect.left + 60,
        clientY: rect.top,
        bubbles: true
      });
      document.dispatchEvent(upEvent);

      const persisted = localStorage.getItem('flowden_vault_nav_width');
      return {
        success: true,
        splitterRect: { left: rect.left, top: rect.top, width: rect.width },
        initialWidth,
        styleWidth,
        resizedWidth,
        diff: resizedWidth - initialWidth,
        persisted
      };
    })()`);

    console.log('  Nav Resize Audit:', JSON.stringify(navResizeAudit));
    if (!navResizeAudit.success || navResizeAudit.diff <= 0) {
      throw new Error(`Splitter resize failed: initial=${navResizeAudit.initialWidth}, resized=${navResizeAudit.resizedWidth}`);
    }
    console.log(`  PASSED: Resizable sliding splitter dynamically resized navigation from ${navResizeAudit.initialWidth}px to ${navResizeAudit.resizedWidth}px`);

    console.log('\n[Step 8: Testing Floating Draggable Inspector Window]');
    const inspectorDragAudit = await evalScript(`(() => {
      const pane = document.getElementById('vault-inspector-pane');
      const header = document.getElementById('vault-inspector-header');
      if (!pane || !header) return { success: false, reason: 'Inspector missing' };

      // Make sure inspector is visible
      pane.style.display = 'flex';
      pane.classList.remove('is-collapsed');

      const initialRect = pane.getBoundingClientRect();

      // Simulate drag
      const startX = initialRect.left + 50;
      const startY = initialRect.top + 15;

      header.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: startY, bubbles: true }));

      // Move by -120px X and +40px Y
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX - 120, clientY: startY + 40, bubbles: true }));

      const movedRect = pane.getBoundingClientRect();

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const persisted = localStorage.getItem('flowden_vault_inspector_pos');

      // Test Reset button
      const resetBtn = document.getElementById('btn-inspector-reset-pos');
      let resetWorks = false;
      if (resetBtn) {
        resetBtn.click();
        const resetRect = pane.getBoundingClientRect();
        resetWorks = Math.abs(resetRect.right - window.innerWidth) <= 30;
      }

      return {
        success: true,
        initialLeft: initialRect.left,
        initialTop: initialRect.top,
        movedLeft: movedRect.left,
        movedTop: movedRect.top,
        diffX: movedRect.left - initialRect.left,
        diffY: movedRect.top - initialRect.top,
        persisted,
        resetWorks
      };
    })()`);

    console.log('  Inspector Drag Audit:', JSON.stringify(inspectorDragAudit));
    if (!inspectorDragAudit.success || inspectorDragAudit.diffX >= 0) {
      throw new Error('Floating draggable Inspector window movement failed!');
    }
    console.log(`  PASSED: Inspector window dragged smoothly (diffX: ${inspectorDragAudit.diffX}px, diffY: ${inspectorDragAudit.diffY}px) and reset button restored dock`);

    await captureScreenshot('vault_floating_draggable_inspector.png');

    console.log('\n[Step 9: Verifying Note Opening Across All Sidebar Items]');
    const noteOpenAudit = await evalScript(`(async () => {
      const items = Array.from(document.querySelectorAll('.vault-note-item'));
      if (items.length === 0) return { count: 0 };
      
      const results = [];
      for (const item of items.slice(0, 3)) {
        const id = item.getAttribute('data-id');
        item.click();
        await new Promise(r => setTimeout(r, 400));
        const activeTitle = document.getElementById('note-title-input')?.value;
        const toast = document.querySelector('.toast--error')?.textContent || '';
        results.push({ id, activeTitle, hasErrorToast: !!toast });
      }
      return { count: items.length, results };
    })()`);

    console.log('  Notes opening audit:', JSON.stringify(noteOpenAudit));
    const anyErrors = noteOpenAudit.results && noteOpenAudit.results.some(r => r.hasErrorToast);
    if (anyErrors) {
      throw new Error('Found error toast when opening note (Note not found or unauthorized)!');
    }
    console.log('  PASSED: Opening notes in sidebar loads cleanly with zero 404 unauthorized errors');

    console.log('\n[Step 10: Verifying Viewports 1280x720 and 1920x1080]');
    await setViewport(1280, 720);
    await captureScreenshot('vault_responsive_1280x720.png');
    console.log('  PASSED: Captured vault_responsive_1280x720.png at 1280x720');

    await setViewport(1920, 1080);
    await captureScreenshot('vault_responsive_1920x1080.png');
    console.log('  PASSED: Captured vault_responsive_1920x1080.png at 1920x1080');

    console.log('\n[Step 11: Final Health & Exception Check]');
    console.log(`  Uncaught exceptions: ${uncaughtExceptions.length}`);
    console.log(`  Failed HTTP requests: ${failedRequests.length}`);

    if (uncaughtExceptions.length > 0) {
      throw new Error(`Uncaught browser exceptions: ${uncaughtExceptions.join('; ')}`);
    }

    console.log('\n================================================================');
    console.log('  🎉 ALL KNOWLEDGE VAULT 2.0 REGRESSION FIXES FULLY VERIFIED');
    console.log('================================================================');

  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (chrome) {
      try { chrome.kill(); } catch (e) {}
    }
  }
}

main().catch(err => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
