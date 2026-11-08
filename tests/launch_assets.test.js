const http = require('http');
const { app } = require('../server/index');
const db = require('../server/config/database');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ PASSED: ${message}`);
}

function request(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3012,
        path,
        method
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runLaunchTests() {
  console.log('\n======================================================');
  console.log('  FLOWDEN — LAUNCH REQUIREMENTS ASSETS TEST SUITE');
  console.log('======================================================\n');

  let server;
  try {
    await db.initDB();
    server = app.listen(3012);

    console.log('[Test 1: Favicon Assets]');
    const faviconIco = await request('GET', '/favicon.ico');
    assert(faviconIco.statusCode === 200, 'favicon.ico served with HTTP 200');

    const faviconSvg = await request('GET', '/assets/favicon.svg');
    assert(faviconSvg.statusCode === 200, 'assets/favicon.svg served with HTTP 200');
    assert(faviconSvg.data.includes('<svg') && faviconSvg.data.includes('#78C8B2'), 'favicon.svg contains brand colors');

    console.log('\n[Test 2: Privacy Policy Page]');
    const privacyHtml = await request('GET', '/privacy.html');
    assert(privacyHtml.statusCode === 200, '/privacy.html served with HTTP 200');
    assert(privacyHtml.data.includes('Privacy Policy'), 'Privacy Policy page contains header');
    assert(privacyHtml.data.includes('Launch Confirmation Required'), 'Privacy Policy contains operator confirmation section');
    assert(!privacyHtml.data.includes('—'), 'Privacy Policy contains zero em dashes');

    const privacyRoute = await request('GET', '/privacy');
    assert(privacyRoute.statusCode === 200, '/privacy route alias served with HTTP 200');

    console.log('\n[Test 3: Terms and Conditions Page]');
    const termsHtml = await request('GET', '/terms.html');
    assert(termsHtml.statusCode === 200, '/terms.html served with HTTP 200');
    assert(termsHtml.data.includes('Terms and Conditions'), 'Terms page contains header');
    assert(termsHtml.data.includes('Launch Confirmation Required'), 'Terms contains operator confirmation section');
    assert(!termsHtml.data.includes('—'), 'Terms contains zero em dashes');

    const termsRoute = await request('GET', '/terms');
    assert(termsRoute.statusCode === 200, '/terms route alias served with HTTP 200');

    console.log('\n[Test 4: Design Rules & Copywriting Standards]');
    const indexHtml = await request('GET', '/index.html');
    assert(indexHtml.statusCode === 200, 'index.html served with HTTP 200');
    assert(!indexHtml.data.includes('—'), 'index.html contains zero em dashes');
    assert(indexHtml.data.includes('/privacy.html') && indexHtml.data.includes('/terms.html'), 'index.html links to Privacy and Terms');
    assert(indexHtml.data.includes('/assets/favicon.svg'), 'index.html links to favicon');

    const appHtml = await request('GET', '/app.html');
    assert(appHtml.statusCode === 200, 'app.html served with HTTP 200');
    assert(!appHtml.data.includes('—'), 'app.html contains zero em dashes');
    assert(appHtml.data.includes('/assets/favicon.svg'), 'app.html links to favicon');

    console.log('\n======================================================');
    console.log('  🎉 ALL LAUNCH ASSETS TESTS PASSED (4/4)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Launch test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    process.exit(process.exitCode || 0);
  }
}

runLaunchTests();

