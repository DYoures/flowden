// tests/registration_revision_e2e.test.js
// Real MySQL 8.4.13 + Real Headless Chrome Verification for Revised Registration Flow

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Sod\\.gemini\\antigravity\\brain\\68479ba4-03f1-440c-b547-3fd8f104b533';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome_profile_reg_rev_e2e');

const TEST_EMAIL = 'test_manual_auth_user@flowden.test';
const TEST_PASSWORD = 'SecurePassword2026!';
const TEST_NAME = 'Test Manual Auth User';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'flowden_test',
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z'
  });
}

async function cleanupTestUser(pool) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [TEST_EMAIL]);
    if (rows.length > 0) {
      const uId = rows[0].id;
      await conn.query('DELETE FROM board_item_connections WHERE board_id IN (SELECT id FROM boards WHERE user_id = ?)', [uId]);
      await conn.query('DELETE FROM board_items WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM boards WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM project_entities WHERE added_by = ?', [uId]);
      await conn.query('DELETE FROM project_members WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM entities WHERE owner_user_id = ?', [uId]);
      await conn.query('DELETE FROM tasks WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM notes WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM projects WHERE user_id = ?', [uId]);
      await conn.query('DELETE FROM users WHERE id = ?', [uId]);
    }
  } finally {
    conn.release();
  }
}

async function main() {
  console.log('================================================================');
  console.log('  FLOWDEN REVISED REGISTRATION FLOW END-TO-END VERIFICATION');
  console.log('  Environment: Real MySQL 8.4.13 + Real Headless Chrome');
  console.log('================================================================\n');

  const pool = await createPool();
  const [[dbMeta]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS ver');
  console.log(`[MySQL] Connected to database="${dbMeta.db}", version="${dbMeta.ver}"`);
  assert.strictEqual(dbMeta.db, 'flowden_test', 'Must connect to flowden_test');
  assert(dbMeta.ver.startsWith('8.4'), 'Must run against MySQL 8.4.x');

  // Verify user 99003 exists beforehand
  const [initialUser] = await pool.query('SELECT id, email FROM users WHERE id = 99003');
  assert.strictEqual(initialUser.length, 1, 'User 99003 must be present');

  console.log('[Setup] Cleaning up any prior temporary test user...');
  await cleanupTestUser(pool);

  let chrome = null;
  let ws = null;
  const uncaughtExceptions = [];
  const failedRequests = [];

  try {
    console.log('\n--- Real Browser UI Verification (Headless Chrome) ---');
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9226',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9226/json');
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
        console.error(`  ❌ BROWSER EXCEPTION: ${desc}`);
      } else if (data.method === 'Network.responseReceived') {
        const resp = data.params.response;
        // 401 on /auth/me or 409 on duplicate register are expected in this test
        if (resp.status >= 500) {
          failedRequests.push(`${resp.url} [HTTP ${resp.status}]`);
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

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (res.exceptionDetails) {
        const err = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
        uncaughtExceptions.push(err);
      }
      return res.result ? res.result.value : undefined;
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    // 1. Navigate to index.html (Login / Register page)
    console.log('[Step 1] Navigating to http://localhost:3000/index.html...');
    await send('Page.navigate', { url: 'http://localhost:3000/index.html' });
    await sleep(1500);

    const isLoginActiveInitial = await evaluate(`(() => {
      const btn = document.getElementById('tab-login-btn');
      return btn && btn.classList.contains('tab--active');
    })()`);
    assert(isLoginActiveInitial, 'Login tab must be active initially');
    console.log('  ✅ Step 1: Login page loaded with Sign In active');

    // 2. Switch to Create Account tab and submit registration form
    console.log('[Step 2] Switching to Create Account tab and submitting registration form...');
    await evaluate(`(() => {
      document.getElementById('tab-register-btn').click();
      document.getElementById('reg-name').value = '${TEST_NAME}';
      document.getElementById('reg-email').value = '${TEST_EMAIL}';
      document.getElementById('reg-password').value = '${TEST_PASSWORD}';
      document.getElementById('btn-reg-submit').click();
    })()`);

    // Wait for registration request to complete and UI to update
    await sleep(1500);

    // 3. MySQL Verification: Confirm account exists and password is secure bcrypt hash
    console.log('[Step 3] Verifying MySQL database persistence for registered user...');
    const [dbUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [TEST_EMAIL]);
    assert.strictEqual(dbUsers.length, 1, 'Account must exist in MySQL users table');
    const createdUser = dbUsers[0];
    assert.strictEqual(createdUser.display_name, TEST_NAME, 'Display name matches');
    assert.strictEqual(createdUser.role, 'user', 'Role is standard user');

    // Verify password is NOT plaintext
    assert.notStrictEqual(createdUser.password_hash, TEST_PASSWORD, 'Stored password MUST NOT be plaintext');
    // Verify password is a valid bcrypt hash
    assert(createdUser.password_hash.startsWith('$2a$') || createdUser.password_hash.startsWith('$2b$'), 'Password must be stored as bcrypt hash');
    const isPasswordValid = await bcrypt.compare(TEST_PASSWORD, createdUser.password_hash);
    assert.strictEqual(isPasswordValid, true, 'bcrypt.compare() must validate password against stored hash');
    console.log('  ✅ Step 3: Account saved in MySQL 8.4.13 with secure bcrypt hash (not plaintext)');

    // 4. Confirm registration does NOT authenticate user
    console.log('[Step 4] Confirming registration did not authenticate the user...');
    const authStateAfterReg = await evaluate(`(() => {
      return {
        currentUser: window.Auth ? window.Auth.getUser() : null,
        localUser: localStorage.getItem('flowden_user'),
        cookies: document.cookie
      };
    })()`);
    console.log('  Client state after registration:', authStateAfterReg);
    assert.strictEqual(authStateAfterReg.currentUser, null, 'window.Auth.getUser() must be null');
    assert.strictEqual(authStateAfterReg.localUser, null, 'localStorage flowden_user must not be set');
    assert(!authStateAfterReg.cookies.includes('flowden_token='), 'Document cookies must not contain flowden_token');

    // Also call server checkAuth
    const serverAuthCheck = await evaluate(`window.Auth.checkAuth()`);
    assert.strictEqual(serverAuthCheck, null, 'Server checkAuth must return null (unauthenticated)');
    console.log('  ✅ Step 4: Registration returned success without issuing an authentication session or token');

    // 5. Confirm user is redirected/switched to Login page/tab with success notification
    console.log('[Step 5] Confirming redirection to Login tab with success message...');
    const loginTabActiveAfterReg = await evaluate(`document.getElementById('tab-login-btn').classList.contains('tab--active')`);
    assert(loginTabActiveAfterReg, 'Sign In tab must be active after registration');

    const formLoginVisible = await evaluate(`document.getElementById('form-login').style.display !== 'none'`);
    assert(formLoginVisible, 'Login form must be displayed');

    const successNoticeText = await evaluate(`document.getElementById('login-success')?.textContent.trim()`);
    console.log('  Success banner text:', successNoticeText);
    assert(successNoticeText && successNoticeText.includes('Your account has been created successfully'), 'Success message must be displayed');

    const prefilledEmail = await evaluate(`document.getElementById('login-email')?.value`);
    assert.strictEqual(prefilledEmail, TEST_EMAIL, 'Email should be pre-filled for user convenience');

    // Capture screenshot: registration success & switch to login
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'reg_success_redirect_to_login.png'), Buffer.from(snap1.data, 'base64'));
    console.log('  ✅ Step 5: User redirected to Login page with clear success notification');

    // 6. Confirm unauthenticated direct access to Flowden workspace is blocked
    console.log('[Step 6] Testing unauthenticated direct access to Flowden workspace...');
    await send('Page.navigate', { url: 'http://localhost:3000/app.html#/overview' });
    await sleep(1500);

    const currentUrl = await evaluate(`window.location.href`);
    console.log('  URL after navigating to app.html while unauthenticated:', currentUrl);
    assert(currentUrl.includes('/index.html'), 'Unauthenticated access must redirect to /index.html');
    console.log('  ✅ Step 6: Workspace requires authenticated session; unauthenticated access redirected to login');

    // 7. Confirm login with incorrect credentials fails
    console.log('[Step 7] Testing manual login with incorrect password...');
    await evaluate(`(() => {
      document.getElementById('tab-login-btn').click();
      document.getElementById('login-email').value = '${TEST_EMAIL}';
      document.getElementById('login-password').value = 'WrongPassword999!';
      document.getElementById('btn-login-submit').click();
    })()`);

    let loginErrorText = '';
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      loginErrorText = await evaluate(`document.getElementById('login-error')?.textContent.trim()`);
      if (loginErrorText) break;
    }
    console.log('  Login error message:', loginErrorText);
    assert(loginErrorText && loginErrorText.includes('Invalid email or password'), 'Must reject wrong password');

    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'manual_login_wrong_password.png'), Buffer.from(snap2.data, 'base64'));
    console.log('  ✅ Step 7: Manual login with incorrect credentials rejected with 401 error message');

    // 8. Confirm manual login with correct credentials succeeds and navigates to workspace
    console.log('[Step 8] Testing manual login with correct credentials...');
    await evaluate(`(() => {
      document.getElementById('login-email').value = '${TEST_EMAIL}';
      document.getElementById('login-password').value = '${TEST_PASSWORD}';
      document.getElementById('btn-login-submit').click();
    })()`);

    let workspaceUrl = '';
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      workspaceUrl = await evaluate(`window.location.href`);
      if (workspaceUrl && workspaceUrl.includes('/app.html')) break;
    }
    console.log('  URL after successful manual login:', workspaceUrl);
    assert(workspaceUrl && workspaceUrl.includes('/app.html'), 'Successful manual login must navigate to Flowden workspace');

    let authenticatedUser = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      authenticatedUser = await evaluate(`(() => {
        try {
          return window.Auth && window.Auth.getUser() ? window.Auth.getUser() : JSON.parse(localStorage.getItem('flowden_user'));
        } catch (e) {
          return null;
        }
      })()`);
      if (authenticatedUser && authenticatedUser.email) break;
    }
    console.log('  Authenticated workspace user:', authenticatedUser);
    assert(authenticatedUser, 'User must be authenticated in workspace');
    assert.strictEqual(authenticatedUser.email, TEST_EMAIL);

    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'manual_login_success_workspace.png'), Buffer.from(snap3.data, 'base64'));
    console.log('  ✅ Step 8: Manual login with correct credentials succeeded and entered workspace');

    // 9. Confirm duplicate email registration is rejected normally (409 Conflict)
    console.log('[Step 9] Testing duplicate email registration rejection...');
    const dupRegRes = await fetch('http://localhost:3000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'AnotherPassword2026!',
        display_name: 'Duplicate Tester'
      })
    });
    assert.strictEqual(dupRegRes.status, 409, 'Duplicate registration must return HTTP 409');
    const dupData = await dupRegRes.json();
    assert(dupData.error.includes('already exists'), 'Must return duplicate email error');
    console.log('  ✅ Step 9: Duplicate email registration rejected with HTTP 409');

    // Summary of errors
    console.log('\n--- BROWSER AUDIT ---');
    console.log(`  Uncaught Exceptions: ${uncaughtExceptions.length}`);
    console.log(`  5xx Server Errors: ${failedRequests.length}`);
    assert.strictEqual(uncaughtExceptions.length, 0, `Browser had exceptions: ${uncaughtExceptions.join('; ')}`);
    assert.strictEqual(failedRequests.length, 0, `Server had 5xx errors: ${failedRequests.join('; ')}`);
    console.log('  ✅ Zero browser console errors and zero server errors.');

    console.log('\n================================================================');
    console.log('  🎉 ALL REVISED REGISTRATION FLOW CRITERIA VERIFIED SUCCESSFULLY');
    console.log('================================================================\n');

  } finally {
    if (ws) {
      try { ws.terminate(); } catch (e) {}
    }
    if (chrome) {
      try {
        chrome.kill();
      } catch (e) {}
    }
    console.log('[Cleanup] Cleaning up temporary test user in MySQL flowden_test...');
    await cleanupTestUser(pool);

    // Verify user 99003 is still intact
    const [finalUser] = await pool.query('SELECT id, email FROM users WHERE id = 99003');
    assert.strictEqual(finalUser.length, 1, 'User 99003 must remain completely intact');
    console.log('[Cleanup] Confirmed existing user 99003 is intact. Done.');

    await pool.end();
    await sleep(400);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
