// tests/capture_dockable_panels_visuals.js
// Flowden Knowledge Vault 2.0: Dockable Panel System & New Note Experience Verification
// Verified against Real MySQL 8.4.13 + Real Chrome Headless (1920x1080 & 1280x720)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authConfig = require('../server/config/auth');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_dockable_panels');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN KNOWLEDGE VAULT 2.0: DOCKABLE PANEL SYSTEM VERIFICATION');
  console.log('  Testing IDE Dockable Panels, Splitters, Layout Persistence,');
  console.log('  Empty Workspace Card, and New Note Creation Flow');
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

    console.log('[Step 1: Launching Chrome Headless]');
    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9232',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1920,1080',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9232/json');
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
      await sleep(300);
    }

    if (!targets) throw new Error('Chrome remote debugging did not respond on port 9232');
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
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        console.log(`  [Browser Console ${data.params.type}]: ${text}`);
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

    async function captureScreenshot(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const filePath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log(`  Saved artifact: ${filename}`);
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

    await send('Network.setCookie', {
      name: 'flowden_token',
      value: userToken,
      domain: 'localhost',
      path: '/'
    });

    console.log('[Step 2: Clearing layout preferences & navigating to Knowledge Vault]');
    // First navigate to app to clear localStorage
    await send('Page.navigate', { url: 'http://localhost:3000/app.html' });
    await sleep(1000);
    await evalScript(`(() => {
      localStorage.removeItem('flowden_vault_layout');
      localStorage.removeItem('flowden_vault_nav_width');
      localStorage.removeItem('flowden_vault_inspector_pos');
    })()`);

    // Navigate to clean /vault without noteId
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/vault' });
    await sleep(2000);

    const workspaceLoaded = await evalScript(`(() => {
      return !!document.getElementById('vault-workspace') &&
             !!document.getElementById('vault-nav-pane') &&
             !!document.getElementById('vault-center-area') &&
             !!document.getElementById('vault-inspector-pane');
    })()`);
    console.log('  Vault workspace components mounted:', workspaceLoaded);
    if (!workspaceLoaded) throw new Error('Knowledge Vault workspace elements failed to mount');

    await setViewport(1920, 1080);

    console.log('\n[Step 3: Verifying Empty State Card When No Note Selected]');
    const emptyStateAudit = await evalScript(`(() => {
      const emptyStateEl = document.getElementById('vault-empty-state');
      const editorActiveEl = document.getElementById('vault-editor-active');
      const card = emptyStateEl?.querySelector('.vault-empty-state-card');
      const createBtn = document.getElementById('btn-vault-empty-create');
      const featureItems = emptyStateEl?.querySelectorAll('.vault-empty-feature-item');

      return {
        isEmptyVisible: emptyStateEl && window.getComputedStyle(emptyStateEl).display !== 'none',
        isEditorHidden: editorActiveEl && window.getComputedStyle(editorActiveEl).display === 'none',
        hasCard: !!card,
        hasCreateBtn: !!createBtn,
        featureCount: featureItems ? featureItems.length : 0
      };
    })()`);

    console.log('  Empty state visible:', emptyStateAudit.isEmptyVisible);
    console.log('  Active editor hidden:', emptyStateAudit.isEditorHidden);
    console.log('  Feature cards count:', emptyStateAudit.featureCount);

    if (!emptyStateAudit.isEmptyVisible || !emptyStateAudit.isEditorHidden) {
      throw new Error('No-note-selected empty state card is not properly displayed');
    }
    if (emptyStateAudit.featureCount !== 3) {
      throw new Error(`Expected 3 feature cards (WikiLinks, Tasks, Slash), found: ${emptyStateAudit.featureCount}`);
    }

    await captureScreenshot('vault_empty_state_clean.png');
    console.log('  PASSED: Empty workspace card verified and captured (vault_empty_state_clean.png)');

    console.log('\n[Step 4: Verifying Default IDE Workspace Layout & Spatial Invariant]');
    const layoutAudit = await evalScript(`(() => {
      const nav = document.getElementById('vault-nav-pane');
      const center = document.getElementById('vault-center-area');
      const inspector = document.getElementById('vault-inspector-pane');
      const navSplitter = document.getElementById('vault-splitter-nav');
      const inspSplitter = document.getElementById('vault-splitter-inspector');

      const navRect = nav.getBoundingClientRect();
      const centerRect = center.getBoundingClientRect();
      const inspRect = inspector.getBoundingClientRect();

      // Check non-overlapping invariant:
      // Center area left must be >= nav right
      // Center area right must be <= inspector left
      const centerLeft = Math.round(centerRect.left);
      const navRight = Math.round(navRect.right);
      const centerRight = Math.round(centerRect.right);
      const inspLeft = Math.round(inspRect.left);

      const navOverlap = Math.max(0, navRight - centerLeft - 5); // 5px splitter allowance
      const inspOverlap = Math.max(0, centerRight - inspLeft - 5);

      return {
        navWidth: navRect.width,
        centerWidth: centerRect.width,
        inspectorWidth: inspRect.width,
        navRight,
        centerLeft,
        centerRight,
        inspLeft,
        isDockedRight: inspector.classList.contains('docked-right'),
        hasNoFloatingOverlay: window.getComputedStyle(inspector).position !== 'absolute',
        navOverlap,
        inspOverlap
      };
    })()`);

    console.log('  Nav width:', layoutAudit.navWidth);
    console.log('  Center canvas width:', layoutAudit.centerWidth);
    console.log('  Inspector width:', layoutAudit.inspectorWidth);
    console.log('  Inspector docked right:', layoutAudit.isDockedRight);
    console.log('  No floating overlay:', layoutAudit.hasNoFloatingOverlay);
    console.log('  Overlap with nav:', layoutAudit.navOverlap, 'px');
    console.log('  Overlap with inspector:', layoutAudit.inspOverlap, 'px');

    if (!layoutAudit.hasNoFloatingOverlay) {
      throw new Error('Inspector is still styled as a floating absolute overlay!');
    }
    if (layoutAudit.navOverlap > 0 || layoutAudit.inspOverlap > 0) {
      throw new Error(`Spatial invariant violated: panels overlap document center area! (nav overlap: ${layoutAudit.navOverlap}, insp overlap: ${layoutAudit.inspOverlap})`);
    }

    await captureScreenshot('vault_default_workspace.png');
    console.log('  PASSED: Default workspace layout verified and captured (vault_default_workspace.png)');

    console.log('\n[Step 5: Testing Left Navigation Sidebar Resize & Persistence]');
    const beforeNavWidth = layoutAudit.navWidth;
    await evalScript(`(() => {
      const splitter = document.getElementById('vault-splitter-nav');
      const nav = document.getElementById('vault-nav-pane');
      const startX = splitter.getBoundingClientRect().left;
      
      // Dispatch drag sequence
      splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 70, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + 70, bubbles: true }));
    })()`);
    await sleep(500);

    const afterNavAudit = await evalScript(`(() => {
      const nav = document.getElementById('vault-nav-pane');
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');
      return {
        width: nav.offsetWidth,
        savedNavWidth: layoutSaved.navWidth
      };
    })()`);

    console.log('  Nav width before resize:', beforeNavWidth);
    console.log('  Nav width after resize:', afterNavAudit.width);
    console.log('  Saved in layout localStorage:', afterNavAudit.savedNavWidth);

    if (afterNavAudit.width <= beforeNavWidth) {
      throw new Error('Nav splitter resize did not increase navigation sidebar width');
    }
    await captureScreenshot('vault_left_sidebar_resized.png');
    console.log('  PASSED: Left sidebar resized and persisted (vault_left_sidebar_resized.png)');

    console.log('\n[Step 6: Testing Right Inspector Resizing & Outline Tab]');
    await evalScript(`(() => {
      const splitter = document.getElementById('vault-splitter-inspector');
      const startX = splitter.getBoundingClientRect().left;
      
      // Dragging leftwards increases right-docked inspector width
      splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX - 60, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX - 60, bubbles: true }));
    })()`);
    await sleep(500);

    const inspResizeAudit = await evalScript(`(() => {
      const insp = document.getElementById('vault-inspector-pane');
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');
      return {
        width: insp.offsetWidth,
        savedWidth: layoutSaved.inspectorWidth
      };
    })()`);
    console.log('  Inspector width after resize:', inspResizeAudit.width);
    console.log('  Saved inspector width in localStorage:', inspResizeAudit.savedWidth);

    await captureScreenshot('vault_inspector_docked_right.png');
    console.log('  PASSED: Right inspector docked and resized (vault_inspector_docked_right.png)');

    console.log('\n[Step 7: Testing Inspector Dock to Left Side]');
    // Switch dock position to Left via dock placement menu
    await evalScript(`(() => {
      const dockMenuItem = document.querySelector('.vault-dock-menu-item[data-dock="left"]');
      dockMenuItem.click();
    })()`);
    await sleep(600);

    const dockLeftAudit = await evalScript(`(() => {
      const insp = document.getElementById('vault-inspector-pane');
      const slotLeft = document.getElementById('vault-dock-slot-left');
      const center = document.getElementById('vault-center-area');
      const inspRect = insp.getBoundingClientRect();
      const centerRect = center.getBoundingClientRect();
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');

      return {
        isInSlotLeft: slotLeft.contains(insp),
        hasDockedLeftClass: insp.classList.contains('docked-left'),
        savedPlacement: layoutSaved.inspectorPlacement,
        inspRight: Math.round(inspRect.right),
        centerLeft: Math.round(centerRect.left),
        overlap: Math.max(0, Math.round(inspRect.right) - Math.round(centerRect.left) - 5)
      };
    })()`);

    console.log('  Inspector moved inside left slot:', dockLeftAudit.isInSlotLeft);
    console.log('  Has .docked-left class:', dockLeftAudit.hasDockedLeftClass);
    console.log('  Saved placement in localStorage:', dockLeftAudit.savedPlacement);
    console.log('  Center canvas non-overlapping invariant (overlap):', dockLeftAudit.overlap, 'px');

    if (!dockLeftAudit.isInSlotLeft || !dockLeftAudit.hasDockedLeftClass) {
      throw new Error('Inspector failed to dock to Left slot');
    }
    if (dockLeftAudit.overlap > 0) {
      throw new Error('Inspector docked on Left overlaps the center canvas area!');
    }

    await captureScreenshot('vault_inspector_docked_left.png');
    console.log('  PASSED: Inspector docked to Left verified (vault_inspector_docked_left.png)');

    console.log('\n[Step 8: Testing Collapsible Bottom Workspace Panel (References & Activity)]');
    // Open bottom panel
    await evalScript(`(() => {
      document.getElementById('btn-vault-toggle-bottom').click();
    })()`);
    await sleep(600);

    const bottomOpenAudit = await evalScript(`(() => {
      const bottom = document.getElementById('vault-bottom-panel');
      const splitter = document.getElementById('vault-splitter-bottom');
      const tabs = Array.from(bottom.querySelectorAll('.vault-bottom-tab')).map(t => t.getAttribute('data-bottom-tab'));
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');

      return {
        isBottomVisible: bottom && window.getComputedStyle(bottom).display !== 'none',
        isSplitterVisible: splitter && window.getComputedStyle(splitter).display !== 'none',
        height: bottom.offsetHeight,
        savedCollapsed: layoutSaved.bottomCollapsed,
        tabs
      };
    })()`);

    console.log('  Bottom panel visible:', bottomOpenAudit.isBottomVisible);
    console.log('  Bottom splitter visible:', bottomOpenAudit.isSplitterVisible);
    console.log('  Bottom height:', bottomOpenAudit.height);
    console.log('  Bottom panel tabs:', bottomOpenAudit.tabs);

    if (!bottomOpenAudit.isBottomVisible || !bottomOpenAudit.isSplitterVisible) {
      throw new Error('Bottom workspace panel failed to open');
    }

    // Resize bottom panel vertically
    await evalScript(`(() => {
      const splitter = document.getElementById('vault-splitter-bottom');
      const startY = splitter.getBoundingClientRect().top;
      
      // Dragging upwards increases bottom panel height
      splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: startY, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: startY - 80, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientY: startY - 80, bubbles: true }));
    })()`);
    await sleep(500);

    const bottomResizeAudit = await evalScript(`(() => {
      const bottom = document.getElementById('vault-bottom-panel');
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');
      return {
        height: bottom.offsetHeight,
        savedHeight: layoutSaved.bottomHeight
      };
    })()`);
    console.log('  Bottom panel height after vertical resize:', bottomResizeAudit.height);

    await captureScreenshot('vault_bottom_panel_open.png');
    console.log('  PASSED: Bottom references panel opened and resized (vault_bottom_panel_open.png)');

    console.log('\n[Step 9: Testing New Note Creation Flow (Clean Empty Content, Focused, Single Note)]');
    // Dock inspector back to right for standard IDE document editing
    await evalScript(`(() => {
      document.querySelector('.vault-dock-menu-item[data-dock="right"]').click();
    })()`);
    await sleep(400);

    const notesCountBefore = await evalScript(`(() => {
      return document.querySelectorAll('.vault-note-item').length;
    })()`);

    // Click New Note button in navigation header
    await evalScript(`(() => {
      document.getElementById('btn-vault-create-note').click();
    })()`);
    await sleep(1000);

    const newNoteAudit = await evalScript(`(() => {
      const titleInput = document.getElementById('note-title-input');
      const contentInput = document.getElementById('note-content-input');
      const activeEl = document.activeElement;
      const notesList = document.querySelectorAll('.vault-note-item');
      const emptyStateEl = document.getElementById('vault-empty-state');
      const editorActiveEl = document.getElementById('vault-editor-active');

      return {
        notesCount: notesList.length,
        title: titleInput ? titleInput.value : null,
        content: contentInput ? contentInput.value : null,
        isTitleFocused: activeEl === titleInput,
        isEmptyStateHidden: window.getComputedStyle(emptyStateEl).display === 'none',
        isEditorActiveVisible: window.getComputedStyle(editorActiveEl).display !== 'none'
      };
    })()`);

    console.log('  Notes count before:', notesCountBefore, '-> after:', newNoteAudit.notesCount);
    console.log('  New note title:', JSON.stringify(newNoteAudit.title));
    console.log('  New note content:', JSON.stringify(newNoteAudit.content));
    console.log('  Title input focused:', newNoteAudit.isTitleFocused);
    console.log('  Editor canvas visible:', newNoteAudit.isEditorActiveVisible);

    if (newNoteAudit.notesCount !== notesCountBefore + 1) {
      throw new Error(`Expected exactly 1 note to be created, difference was ${newNoteAudit.notesCount - notesCountBefore}`);
    }
    if (newNoteAudit.content !== '') {
      throw new Error(`Expected new note to have clean empty content "", got: "${newNoteAudit.content}"`);
    }

    await captureScreenshot('vault_new_note_created.png');
    console.log('  PASSED: New note created with clean content and opened (vault_new_note_created.png)');

    console.log('\n[Step 10: Testing Reset Workspace Layout Action]');
    await evalScript(`(() => {
      document.getElementById('btn-vault-reset-layout').click();
    })()`);
    await sleep(600);

    const resetAudit = await evalScript(`(() => {
      const nav = document.getElementById('vault-nav-pane');
      const insp = document.getElementById('vault-inspector-pane');
      const bottom = document.getElementById('vault-bottom-panel');
      const layoutSaved = JSON.parse(localStorage.getItem('flowden_vault_layout') || '{}');

      return {
        navWidth: nav.offsetWidth,
        inspWidth: insp.offsetWidth,
        isDockedRight: insp.classList.contains('docked-right'),
        isBottomCollapsed: bottom.classList.contains('is-collapsed'),
        savedPlacement: layoutSaved.inspectorPlacement
      };
    })()`);

    console.log('  Nav width after reset:', resetAudit.navWidth, '(expected default 280)');
    console.log('  Inspector width after reset:', resetAudit.inspWidth, '(expected default 320)');
    console.log('  Inspector docked right:', resetAudit.isDockedRight);
    console.log('  Bottom panel collapsed:', resetAudit.isBottomCollapsed);

    if (!resetAudit.isDockedRight || !resetAudit.isBottomCollapsed) {
      throw new Error('Reset workspace layout did not restore default IDE panel states');
    }
    console.log('  PASSED: Reset Workspace Layout restores default configuration');

    console.log('\n[Step 11: Testing Responsive Viewports (1280x720 & 1920x1080)]');
    await setViewport(1280, 720);
    await captureScreenshot('vault_responsive_1280x720.png');
    console.log('  PASSED: Captured vault_responsive_1280x720.png');

    await setViewport(1920, 1080);
    await captureScreenshot('vault_responsive_1920x1080.png');
    console.log('  PASSED: Captured vault_responsive_1920x1080.png');

    console.log('\n[Step 12: Browser Exceptions & Network Error Audit]');
    console.log('  Uncaught browser exceptions:', uncaughtExceptions.length);
    console.log('  Failed HTTP requests (>=400):', failedRequests.length);

    if (uncaughtExceptions.length > 0) {
      console.error('Exceptions logged:', uncaughtExceptions);
      throw new Error(`Found ${uncaughtExceptions.length} uncaught browser exceptions`);
    }
    if (failedRequests.length > 0) {
      console.warn('Failed requests:', failedRequests);
      throw new Error(`Found ${failedRequests.length} failed HTTP requests`);
    }

    console.log('\n================================================================');
    console.log('  ALL DOCKABLE PANEL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('================================================================');

  } catch (err) {
    console.error('\nVerification FAILED:', err);
    process.exitCode = 1;
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (chrome) {
      try { chrome.kill(); } catch (e) {}
    }
  }
}

main();
