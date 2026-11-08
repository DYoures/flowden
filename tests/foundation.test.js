// Flowden Segment 2 Foundation Test Suite

const http = require('http');
const path = require('path');
const fs = require('fs');
const { app, start } = require('../server/index');

const PORT = 3009; // Isolated test port

let server;
let adminCookie = '';
let userCookie = '';
let adminUserId = null;
let regularUserId = null;
let createdProjectId = null;

function request(method, path, body = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }

        const setCookie = res.headers['set-cookie'];
        let extractedCookie = '';
        if (setCookie && setCookie.length > 0) {
          extractedCookie = setCookie[0].split(';')[0];
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          cookie: extractedCookie
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  FLOWDEN SEGMENT 2 — FOUNDATION TEST SUITE');
  console.log('======================================================\n');

  // Clean test store
  const testStorePath = path.join(__dirname, '..', 'server', 'data', 'flowden_store.json');
  if (fs.existsSync(testStorePath)) {
    try { fs.unlinkSync(testStorePath); } catch (e) {}
  }

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
  console.log(`Test server running on port ${PORT}\n`);

  try {
    // 1. Health check
    console.log('[Test 1: Health & Database Diagnostics]');
    const health = await request('GET', '/api/health');
    assert(health.statusCode === 200, 'Health endpoint returns HTTP 200');
    assert(health.data.product === 'Flowden', 'Product identity confirmed as Flowden');
    assert(health.data.database && health.data.database.message, 'Database status diagnosed');

    // 2. Authentication Validation & First User Admin Promotion
    console.log('\n[Test 2: Authentication Validation & Admin Auto-Promotion]');
    const weakPass = await request('POST', '/api/v1/auth/register', {
      email: 'short@flowden.io',
      password: '123',
      display_name: 'Short'
    });
    assert(weakPass.statusCode === 400, 'Rejects password shorter than 8 characters');

    const adminReg = await request('POST', '/api/v1/auth/register', {
      email: 'alex.founder@flowden.io',
      password: 'SuperSecurePassword2026!',
      display_name: 'Alex Founder'
    });
    assert(adminReg.statusCode === 201, 'First user registers with HTTP 201');
    assert(adminReg.data.user.role === 'admin', 'First registered user is automatically promoted to role: admin');
    assert(!adminReg.cookie || !adminReg.cookie.includes('flowden_token='), 'No JWT cookie issued on registration');
    adminUserId = adminReg.data.user.id;

    // 3. Second User Role
    console.log('\n[Test 3: Second User Standard Role]');
    const userReg = await request('POST', '/api/v1/auth/register', {
      email: 'sara.researcher@flowden.io',
      password: 'ColleaguePassword2026!',
      display_name: 'Sara Researcher'
    });
    assert(userReg.statusCode === 201, 'Second user registers successfully');
    assert(userReg.data.user.role === 'user', 'Subsequent registered user receives standard role: user');
    assert(!userReg.cookie || !userReg.cookie.includes('flowden_token='), 'No JWT cookie issued on registration');
    regularUserId = userReg.data.user.id;

    const userLogin = await request('POST', '/api/v1/auth/login', {
      email: 'sara.researcher@flowden.io',
      password: 'ColleaguePassword2026!'
    });
    assert(userLogin.statusCode === 200, 'Second user logs in successfully');
    userCookie = userLogin.cookie;

    // 4. Login and Password Verification
    console.log('\n[Test 4: User Authentication Login]');
    const badLogin = await request('POST', '/api/v1/auth/login', {
      email: 'alex.founder@flowden.io',
      password: 'WrongPassword!'
    });
    assert(badLogin.statusCode === 401, 'Rejects invalid password with HTTP 401');

    const goodLogin = await request('POST', '/api/v1/auth/login', {
      email: 'alex.founder@flowden.io',
      password: 'SuperSecurePassword2026!'
    });
    assert(goodLogin.statusCode === 200, 'Accepts valid credentials with HTTP 200');
    assert(goodLogin.data.user.email === 'alex.founder@flowden.io', 'Returns logged in user details');
    assert(goodLogin.cookie.includes('flowden_token='), 'httpOnly JWT cookie issued on manual login');
    adminCookie = goodLogin.cookie;

    // 5. Protected User Me Endpoint
    console.log('\n[Test 5: Protected Route Access]');
    const noAuth = await request('GET', '/api/v1/auth/me');
    assert(noAuth.statusCode === 401, 'Unauthenticated request to /me returns HTTP 401');

    const authMe = await request('GET', '/api/v1/auth/me', null, adminCookie);
    assert(authMe.statusCode === 200, 'Authenticated request to /me returns HTTP 200');
    assert(authMe.data.user.id === adminUserId, 'Correct user identity attached from JWT');

    // 6. Project CRUD & Automatic Board Initialization
    console.log('\n[Test 6: Project Lifecycle & Board Auto-Initialization]');
    const newProject = await request('POST', '/api/v1/projects', {
      title: 'Cognitive Architecture Engine',
      description: 'Spatial reasoning and knowledge synthesis framework.',
      color: '#7c5cbf',
      icon: 'folder-kanban'
    }, adminCookie);
    assert(newProject.statusCode === 201, 'Creates new project with HTTP 201');
    assert(newProject.data.project.title === 'Cognitive Architecture Engine', 'Project title matches');
    createdProjectId = newProject.data.project.id;

    // Check project listing
    const projectList = await request('GET', '/api/v1/projects', null, adminCookie);
    assert(projectList.statusCode === 200, 'Lists projects with HTTP 200');
    assert(projectList.data.projects.length >= 1, 'Contains created project');

    // Verify automatic spatial board was initialized
    const projectBoards = await request('GET', `/api/v1/boards/project/${createdProjectId}`, null, adminCookie);
    assert(projectBoards.statusCode === 200, 'Retrieves project boards');
    assert(projectBoards.data.boards && projectBoards.data.boards.length >= 1, 'Default Workspace Board was automatically provisioned');

    // Project Dashboard Stats
    const dashStats = await request('GET', `/api/v1/projects/${createdProjectId}/dashboard`, null, adminCookie);
    assert(dashStats.statusCode === 200, 'Dashboard aggregation returns HTTP 200');
    assert(dashStats.data.project.counts !== undefined, 'Counts structure returned for dashboard');

    // 7. Data Isolation Between Users
    console.log('\n[Test 7: Data Isolation Between Users]');
    const user2Projects = await request('GET', '/api/v1/projects', null, userCookie);
    assert(user2Projects.data.projects.length === 0, 'User 2 sees 0 projects (strict isolation from User 1)');

    const unauthorizedAccess = await request('GET', `/api/v1/projects/${createdProjectId}`, null, userCookie);
    assert(unauthorizedAccess.statusCode === 404, 'User 2 cannot access User 1 project (returns 404/unauthorized)');

    // 8. Role-Based Access Control (RBAC) & Admin Routes
    console.log('\n[Test 8: Role-Based Access Control (Admin vs User)]');
    const userAdminAccess = await request('GET', '/api/v1/admin/users', null, userCookie);
    assert(userAdminAccess.statusCode === 403, 'Standard user receives HTTP 403 Forbidden on /admin routes');

    const adminUsersList = await request('GET', '/api/v1/admin/users', null, adminCookie);
    assert(adminUsersList.statusCode === 200, 'Admin user successfully accesses /admin/users');
    assert(adminUsersList.data.users.length === 2, 'Admin sees all registered system users');

    const adminStats = await request('GET', '/api/v1/admin/stats', null, adminCookie);
    assert(adminStats.statusCode === 200, 'Admin accesses system metrics and database diagnostics');

    // 9. Universal Search
    console.log('\n[Test 9: Universal Search]');
    const searchRes = await request('GET', '/api/v1/search?q=Cognitive', null, adminCookie);
    assert(searchRes.statusCode === 200, 'Search endpoint returns HTTP 200');
    assert(searchRes.data.total >= 1, 'Search finds matches across workspace items');
    assert(searchRes.data.results.projects[0].title === 'Cognitive Architecture Engine', 'Exact project match found');

    // 10. Static Assets Availability
    console.log('\n[Test 10: Static Shell & Design System Files]');
    const appHtml = await request('GET', '/app.html');
    assert(appHtml.statusCode === 200, 'App shell HTML (app.html) is served');
    assert(appHtml.data.includes('id="app-sidebar"'), 'App shell contains collapsible sidebar');
    assert(appHtml.data.includes('id="topbar-breadcrumb"'), 'App shell contains dynamic breadcrumbs');
    assert(appHtml.data.includes('id="app-inspector"'), 'App shell contains contextual inspector panel');

    const variablesCss = await request('GET', '/css/variables.css');
    assert(variablesCss.statusCode === 200, 'Design tokens CSS (variables.css) is served');
    assert(variablesCss.data.includes('--accent-primary: #78C8B2') || variablesCss.data.includes('--accent-primary: #6B8AFD') || variablesCss.data.includes('--accent-primary: #7c5cbf'), 'Variables contain accent token');
    assert(variablesCss.data.includes('[data-theme="light"]'), 'Variables contain light mode tokens');

    const componentsCss = await request('GET', '/css/components.css');
    assert(componentsCss.statusCode === 200, 'Components CSS is served');
    assert(componentsCss.data.includes('.command-palette'), 'Command palette styles defined');

    console.log('\n======================================================');
    console.log('  🎉 ALL SEGMENT 2 FOUNDATION TESTS PASSED (10/10)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Test suite stopped due to error:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();

