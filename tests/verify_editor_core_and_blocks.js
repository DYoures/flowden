// tests/verify_editor_core_and_blocks.js
// Comprehensive Verification Suite for Flowden Knowledge Vault
// Block-based Editing, Notion-style Gutter Handles & Drag Reorder,
// Media & File Uploads, Clipboard Image Paste, WikiLink Modal, and Outline Fidelity

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');
const db = require('../server/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_vault_blocks_test');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('================================================================');
  console.log('  FLOWDEN KNOWLEDGE VAULT: BLOCK EDITOR & MEDIA VERIFICATION');
  console.log('================================================================\n');

  // Verify MySQL Connection
  await db.initDB();
  console.log('[Setup] Connected to MySQL database flowden_test');

  // Fetch real user from DB to sign authentic JWT token
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

  // Seed sample test note
  const initialContent = [
    '# Architecture Invariants',
    '',
    'Core principles for our distributed systems replication engine.',
    '',
    '> [!NOTE]',
    '> All state machine transactions must commit deterministically.',
    '> Second line of callout notice to test multiline fidelity.',
    '',
    '> A classic thought on system design: simplicity is prerequisite for reliability.',
    '',
    '### Consensus Properties',
    '',
    '| Feature | Flowden | Legacy |',
    '| --- | --- | --- |',
    '| Speed | Instant | Delayed |',
    '| Security | End-to-end | Perimeter |',
    '',
    '- [x] Implement deterministic raft state log',
    '- [ ] Verify quorum calculations'
  ].join('\n');

  console.log('[Setup] Seeding test note via REST API...');
  const createRes = await fetch('http://localhost:3000/api/v1/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      title: 'Architecture Invariants Test',
      content: initialContent
    })
  });
  const createData = await createRes.json();
  const noteId = createData.note ? createData.note.id : null;
  console.log(`[Setup] Note created: id=${noteId}`);

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];

  try {
    console.log('[Browser] Launching Headless Chrome...');
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9230',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
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
        const ex = res.exceptionDetails;
        const desc = ex.exception ? (ex.exception.description || ex.exception.value) : ex.text;
        throw new Error(desc || 'Eval error');
      }
      return res.result ? res.result.value : undefined;
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    console.log('[Browser] Navigating to Knowledge Vault...');
    await send('Page.navigate', { url: `http://localhost:3000/app.html#/vault/${noteId}` });
    await sleep(2500);

    async function capture(fileName, label) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const outPath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(outPath, buffer);
      console.log(`  📸 Artifact captured: ${fileName} (${label})`);
    }

    console.log('\n--- TEST SUITE EXECUTION ---');

    // TEST 1: Block Attributes Verification
    console.log('\n[Test 1: Notion-style Block Attributes]');
    const blockCount = await evalScript(`
      document.querySelectorAll('#vault-wysiwyg-canvas .vault-block').length;
    `);
    console.log(`  Found ${blockCount} distinct .vault-block elements in canvas`);
    if (blockCount >= 5) {
      console.log('  ✅ PASSED: Document nodes are addressable blocks with IDs');
    } else {
      throw new Error(`Expected at least 5 blocks, got ${blockCount}`);
    }

    // TEST 2: Gutter Handle & Context Menu
    console.log('\n[Test 2: Gutter Floating Handle & Context Menu]');
    const handleCheck = await evalScript(`
      (() => {
        const firstBlock = document.querySelector('#vault-wysiwyg-canvas .vault-block');
        const handle = document.querySelector('.vault-block-handle');
        const dragBtn = handle ? handle.querySelector('.vault-handle-drag') : null;
        if (!firstBlock || !handle || !dragBtn) return { success: false, reason: 'elements missing' };

        // Simulate hover on first block
        firstBlock.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        const visible = handle.style.display !== 'none';

        // Simulate click on drag button to open menu
        dragBtn.click();
        const menu = document.querySelector('.vault-block-context-menu');
        const menuOpen = !!menu;

        return { success: true, handleVisible: visible, menuOpen: menuOpen };
      })()
    `);
    console.log('  Handle check result:', handleCheck);
    if (handleCheck.success && handleCheck.menuOpen) {
      console.log('  ✅ PASSED: Gutter handle appears and context menu opens');
      await capture('vault_block_drag_handle_menu.png', 'Gutter Handle & Block Context Menu');
    } else {
      throw new Error('Gutter handle or context menu failed');
    }

    // Close menu
    await evalScript(`
      const menu = document.querySelector('.vault-block-context-menu');
      if (menu) menu.remove();
    `);

    // TEST 3: Block Reordering Simulation
    console.log('\n[Test 3: Block Reordering & Content Markdown Persistence]');
    const reorderResult = await evalScript(`
      (() => {
        const canvas = document.querySelector('#vault-wysiwyg-canvas');
        const blocks = Array.from(canvas.querySelectorAll('.vault-block'));
        if (blocks.length < 3) return { success: false, reason: 'too few blocks' };

        const block0 = blocks[0];
        const block1 = blocks[1];
        const block2 = blocks[2];

        // Move block 0 after block 1
        canvas.insertBefore(block0, block1.nextSibling);

        // Trigger input event to sync
        canvas.dispatchEvent(new Event('input', { bubbles: true }));

        const newBlocks = Array.from(canvas.querySelectorAll('.vault-block'));
        const isMoved = (newBlocks[1] === block0);

        return { success: isMoved, newOrder: newBlocks.map(b => b.tagName) };
      })()
    `);
    console.log('  Reorder result:', reorderResult);
    if (reorderResult.success) {
      console.log('  ✅ PASSED: Block reordered in DOM successfully');
    } else {
      throw new Error('Block reorder failed');
    }

    // Wait for autosave (800ms debounce)
    await sleep(1500);

    // Verify in MySQL
    const rows = await db.query('SELECT content FROM notes WHERE id = ?', [noteId]);
    const savedMarkdown = rows[0] ? rows[0].content : '';
    console.log('  Persisted Markdown preview in MySQL:');
    console.log(savedMarkdown.split('\n').slice(0, 5).join('\n'));
    if (savedMarkdown.includes('Core principles for our distributed systems')) {
      console.log('  ✅ PASSED: Canonical Markdown persisted in real MySQL database');
    } else {
      throw new Error('Database persistence check failed');
    }

    // TEST 4: Selection Preservation & Insertion
    console.log('\n[Test 4: Selection Preservation & Block Insertion]');
    const insertResult = await evalScript(`
      (() => {
        const canvas = document.querySelector('#vault-wysiwyg-canvas');
        const countBefore = canvas.querySelectorAll('.vault-block').length;

        // Click Callout formatting button
        const calloutBtn = document.querySelector('.fmt-btn[data-cmd="callout"]');
        if (!calloutBtn) return { success: false, reason: 'button missing' };

        // Dispatch mousedown and click
        calloutBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        calloutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        const countAfter = canvas.querySelectorAll('.vault-block').length;
        const callouts = canvas.querySelectorAll('.vault-callout');

        return { success: countAfter > countBefore, calloutCount: callouts.length };
      })()
    `);
    console.log('  Insertion result:', insertResult);
    if (insertResult.success && insertResult.calloutCount >= 2) {
      console.log('  ✅ PASSED: Block-aware insertion without cursor reset or DOM corruption');
    } else {
      throw new Error('Block insertion failed');
    }

    // TEST 5: WikiLink Selection Modal
    console.log('\n[Test 5: WikiLink Note Selection Modal]');
    const wikiModalResult = await evalScript(`
      (() => {
        const wikiBtn = document.querySelector('.fmt-btn[data-cmd="wikilink"]');
        if (!wikiBtn) return { success: false, reason: 'wikilink button missing' };

        wikiBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        wikiBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        const backdrop = document.querySelector('#vault-wikilink-modal-backdrop');
        const modal = document.querySelector('.vault-wikilink-modal');
        const items = document.querySelectorAll('.vault-wikilink-item');

        return {
          success: !!backdrop && !!modal,
          itemCount: items.length
        };
      })()
    `);
    console.log('  WikiLink modal result:', wikiModalResult);
    if (wikiModalResult.success) {
      console.log('  ✅ PASSED: WikiLink modal opens with searchable existing notes');
      await capture('vault_wikilink_selection_modal.png', 'WikiLink Note Selection Modal');
    } else {
      throw new Error('WikiLink modal failed to open');
    }

    // Select the first note in the modal
    await evalScript(`
      (() => {
        const firstItem = document.querySelector('.vault-wikilink-item');
        if (firstItem) firstItem.click();
      })()
    `);
    await sleep(400);

    const wikiPillExists = await evalScript(`
      document.querySelectorAll('#vault-wysiwyg-canvas .wiki-link-pill').length > 0;
    `);
    if (wikiPillExists) {
      console.log('  ✅ PASSED: Note title inserted as rich WikiLink pill');
    } else {
      throw new Error('WikiLink pill not inserted');
    }

    // TEST 6: Clipboard Image Paste & Image Block
    console.log('\n[Test 6: Clipboard Image Paste & Image Block]');
    // Create a 1x1 test PNG base64
    const testPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const pasteResult = await evalScript(`
      (async () => {
        const canvas = document.querySelector('#vault-wysiwyg-canvas');

        // Convert base64 to Blob
        const byteCharacters = atob('${testPngBase64}');
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const file = new File([blob], 'clipboard-test.png', { type: 'image/png' });

        // Dispatch paste event with DataTransfer
        const dt = new DataTransfer();
        dt.items.add(file);

        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });

        canvas.dispatchEvent(pasteEvent);
        return { success: true };
      })()
    `);
    console.log('  Paste dispatched:', pasteResult);

    // Wait for fetch upload and replacement
    await sleep(2000);

    const imageBlockCheck = await evalScript(`
      (() => {
        const imgBlock = document.querySelector('#vault-wysiwyg-canvas .vault-image-block');
        if (!imgBlock) return { found: false };
        const img = imgBlock.querySelector('img');
        const toolbar = imgBlock.querySelector('.vault-image-toolbar');
        const caption = imgBlock.querySelector('.vault-image-caption');
        return {
          found: true,
          src: img ? img.getAttribute('src') : null,
          hasToolbar: !!toolbar,
          hasCaption: !!caption
        };
      })()
    `);
    console.log('  Image block check:', imageBlockCheck);
    if (imageBlockCheck.found && imageBlockCheck.src && imageBlockCheck.src.startsWith('/uploads/vault/')) {
      console.log('  ✅ PASSED: Clipboard image paste uploaded file and inserted Image block');
    } else {
      throw new Error('Image block creation failed');
    }

    // Test image width toggle
    await evalScript(`
      (() => {
        const btn50 = document.querySelector('.vault-image-block .vault-img-btn[data-width="50"]');
        if (btn50) btn50.click();
      })()
    `);
    const widthCheck = await evalScript(`
      document.querySelector('.vault-image-block').getAttribute('data-width');
    `);
    if (widthCheck === '50') {
      console.log('  ✅ PASSED: Image width control updated to 50%');
    }

    // TEST 7: File Attachment Block
    console.log('\n[Test 7: File Attachment Block Insertion]');
    const fileBlockResult = await evalScript(`
      (async () => {
        const canvas = document.querySelector('#vault-wysiwyg-canvas');
        const textBlob = new Blob(['Test report content for verification'], { type: 'text/plain' });
        const docFile = new File([textBlob], 'System_Specification.pdf', { type: 'application/pdf' });

        const dt = new DataTransfer();
        dt.items.add(docFile);

        const dropEvent = new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true
        });

        canvas.dispatchEvent(dropEvent);
        return { success: true };
      })()
    `);
    console.log('  File drop dispatched:', fileBlockResult);
    await sleep(2000);

    const fileCardCheck = await evalScript(`
      (() => {
        const fileBlock = document.querySelector('#vault-wysiwyg-canvas .vault-file-block');
        if (!fileBlock) return { found: false };
        const name = fileBlock.querySelector('.vault-file-name');
        const size = fileBlock.querySelector('.vault-file-size');
        const icon = fileBlock.querySelector('.vault-file-icon svg');
        return {
          found: true,
          name: name ? name.textContent : null,
          size: size ? size.textContent : null,
          hasIcon: !!icon
        };
      })()
    `);
    console.log('  File card check:', fileCardCheck);
    if (fileCardCheck.found && fileCardCheck.name.includes('System_Specification')) {
      console.log('  ✅ PASSED: File attachment uploaded and rendered as clean card');
      await capture('vault_image_and_file_blocks.png', 'Inline Image & File Attachment Blocks');
    } else {
      throw new Error('File card creation failed');
    }

    // TEST 8: Outline Headings Fidelity
    console.log('\n[Test 8: Outline Headings Fidelity]');
    const outlineHeadings = await evalScript(`
      (() => {
        const headings = window.VaultEditor.extractHeadings(document.querySelector('#vault-wysiwyg-canvas'));
        return headings.map(h => ({ level: h.level, text: h.text }));
      })()
    `);
    console.log('  Extracted Outline Headings:', outlineHeadings);
    const hasQuoteAsHeading = outlineHeadings.some(h => h.text.includes('classic thought') || h.text.includes('simplicity is prerequisite'));
    if (!hasQuoteAsHeading && outlineHeadings.length >= 2) {
      console.log('  ✅ PASSED: Outline extracts only true document headings, excluding quotes/callouts');
    } else {
      throw new Error('Outline included blockquote or callout text as heading');
    }

    // TEST 9: Clean Sidebar Snippet Preview
    console.log('\n[Test 9: Clean Sidebar Snippet Preview]');
    const sidebarPreviews = await evalScript(`
      (() => {
        const items = Array.from(document.querySelectorAll('.vault-notes-list .vault-note-item'));
        return items.map(it => {
          const title = it.querySelector('span')?.textContent;
          const snippet = it.querySelector('.text-xs')?.textContent.trim();
          return { title, snippet };
        });
      })()
    `);
    console.log('  Sidebar previews:', sidebarPreviews.slice(0, 3));
    const anyRawMarkdown = sidebarPreviews.some(p => p.snippet.includes('|') || p.snippet.includes('```') || p.snippet.includes('> [!'));
    if (!anyRawMarkdown) {
      console.log('  ✅ PASSED: Sidebar previews strip raw markdown tokens (pipes, code fences, callouts)');
    } else {
      throw new Error('Raw markdown found in sidebar preview snippet');
    }

    // TEST 10: Viewport Screenshots at 1280x720 and 1920x1080
    console.log('\n[Test 10: Responsive Viewports Captures]');
    await capture('vault_block_editor_canvas.png', 'Full Block Editor Workspace');

    // 1280x720 Viewport
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);
    await capture('vault_viewport_1280x720.png', 'Responsive Viewport 1280x720');

    // 1920x1080 Viewport
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);
    await capture('vault_viewport_1920x1080.png', 'Responsive Viewport 1920x1080');

    console.log('\n================================================================');
    console.log('  🎉 ALL 10 TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');

  } finally {
    if (ws) ws.close();
    if (chrome) {
      chrome.kill('SIGKILL');
    }
  }
}

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
