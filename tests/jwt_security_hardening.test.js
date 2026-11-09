// tests/jwt_security_hardening.test.js
/**
 * Isolated unit and application startup tests for JWT secret hardening.
 *
 * Verifies that:
 * 1. Production fails fast if JWT_SECRET is missing, empty, legacy default, or < 32 bytes.
 * 2. In all invalid production scenarios, app.start() rejects BEFORE any database connection
 *    attempt or HTTP listener occurs.
 * 3. Supplied secret values are never printed, reflected, or logged in failure messages.
 * 4. Development/test generates a process-local cryptographically random secret rather than static default.
 * 5. Production with a valid high-entropy secret passes authentication validation.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const authConfig = require('../server/config/auth');

function runJwtTests() {
  console.log('=== STARTING JWT SECURITY HARDENING & STARTUP ENFORCEMENT TESTS ===\n');

  let passed = 0;
  const { _resolveJwtSecret, _OLD_KNOWN_DEFAULT, _MIN_SECRET_BYTES } = authConfig;

  // ---------------------------------------------------------------------------
  // Part 1: Direct Configuration Resolution Invariants
  // ---------------------------------------------------------------------------
  console.log('--- Part 1: Direct Configuration Validation Tests ---');

  // Test 1: Production without JWT_SECRET fails fast
  try {
    _resolveJwtSecret({ NODE_ENV: 'production' });
    assert.fail('Should have thrown on missing JWT_SECRET in production');
  } catch (err) {
    assert.ok(err.message.includes('missing or empty in production'), 'Must indicate missing/empty in production');
    passed++;
    console.log('  ✅ PASS: Production without JWT_SECRET fails fast with configuration error');
  }

  // Test 2: Production with empty JWT_SECRET fails fast
  try {
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '   ' });
    assert.fail('Should have thrown on whitespace-only JWT_SECRET in production');
  } catch (err) {
    assert.ok(err.message.includes('missing or empty in production'), 'Must reject empty string');
    passed++;
    console.log('  ✅ PASS: Production with empty/whitespace JWT_SECRET fails fast');
  }

  // Test 3: Production with legacy static default fails fast
  try {
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: _OLD_KNOWN_DEFAULT });
    assert.fail('Should have thrown on legacy static default in production');
  } catch (err) {
    assert.ok(err.message.includes('insecure legacy default'), 'Must explicitly reject insecure legacy default');
    passed++;
    console.log('  ✅ PASS: Production with legacy default secret fails fast');
  }

  // Test 4: Production with secret under 32 bytes fails fast
  try {
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'too-short-secret-key' });
    assert.fail('Should have thrown on secret shorter than 32 bytes');
  } catch (err) {
    assert.ok(err.message.includes('at least 32 bytes in length in production'), 'Must accurately state minimum byte length');
    passed++;
    console.log('  ✅ PASS: Production with secret < 32 bytes fails fast with byte-length rule');
  }

  // Test 5: Production with valid secret (>= 32 bytes) initializes successfully
  const validProductionSecret = 'valid-production-secret-with-minimum-32-bytes-length-key-12345';
  const resolvedProd = _resolveJwtSecret({
    NODE_ENV: 'production',
    JWT_SECRET: validProductionSecret
  });
  assert.strictEqual(resolvedProd, validProductionSecret, 'Must return the valid production secret');
  passed++;
  console.log('  ✅ PASS: Production with valid secret initializes successfully');

  // Test 6: Development fallback without JWT_SECRET generates random secret (not static)
  delete global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__;
  const devSecret1 = _resolveJwtSecret({ NODE_ENV: 'development' });
  assert.ok(devSecret1, 'Must generate a fallback secret');
  assert.notStrictEqual(devSecret1, _OLD_KNOWN_DEFAULT, 'Fallback must never equal the old static secret');
  assert.ok(devSecret1.length >= 64, 'Random fallback hex string must be at least 64 characters (32 bytes entropy)');

  delete global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__;
  const devSecret2 = _resolveJwtSecret({ NODE_ENV: 'development' });
  assert.notStrictEqual(devSecret1, devSecret2, 'Successive un-cached runs must generate distinct cryptographically random secrets');
  passed++;
  console.log('  ✅ PASS: Development fallback generates cryptographically random secrets rather than static fallback');

  // Test 7: Development with legacy default secret is NOT silently used
  delete global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__;
  const devWithOldDefault = _resolveJwtSecret({
    NODE_ENV: 'development',
    JWT_SECRET: _OLD_KNOWN_DEFAULT
  });
  assert.notStrictEqual(devWithOldDefault, _OLD_KNOWN_DEFAULT, 'Development must not use the static legacy default');
  assert.ok(devWithOldDefault.length >= 64, 'Must generate random secret instead');
  passed++;
  console.log('  ✅ PASS: Development with legacy default falls back to random secret instead of static default');

  // Test 8: Process-local secret is stable within a single running process
  delete global.__FLOWDEN_PROCESS_LOCAL_JWT_SECRET__;
  const procSecretA = _resolveJwtSecret({ NODE_ENV: 'development' });
  const procSecretB = _resolveJwtSecret({ NODE_ENV: 'development' });
  assert.strictEqual(procSecretA, procSecretB, 'Secret must be stable within the same process');
  passed++;
  console.log('  ✅ PASS: Development process-local secret is stable across calls within the same process');

  // Test 9: AuthConfig getter integration
  assert.ok(authConfig.jwtSecret, 'authConfig.jwtSecret getter must return a valid string');
  assert.strictEqual(typeof authConfig.jwtSecret, 'string');
  assert.notStrictEqual(authConfig.jwtSecret, _OLD_KNOWN_DEFAULT);
  passed++;
  console.log('  ✅ PASS: authConfig.jwtSecret getter functions seamlessly');

  // Test 10: Zero secret exposure check
  const sensitiveSecret = 'confidential-too-short';
  try {
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: sensitiveSecret });
    assert.fail('Should have thrown on too-short secret');
  } catch (err) {
    assert.strictEqual(err.message.includes(sensitiveSecret), false, 'Error message must not expose the secret value');
    passed++;
    console.log('  ✅ PASS: Error messages never expose secret values');
  }

  // ---------------------------------------------------------------------------
  // Part 2: Subprocess Application Startup Enforcement Tests (app.start())
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 2: Subprocess app.start() Fail-Fast Verification ---');

  function runStartupSubprocess(envOverrides = {}, preStartCode = '') {
    const runnerCode = `
      const app = require('./server/index');
      ${preStartCode}
      app.start()
        .then(() => {
          console.log('[STARTUP_RESULT] SUCCESS');
          process.exit(0);
        })
        .catch((err) => {
          console.error('[STARTUP_ERROR] ' + err.message);
          process.exit(1);
        });
    `;

    const baseEnv = { ...process.env, ...envOverrides };

    return spawnSync(process.execPath, ['-e', runnerCode], {
      env: baseEnv,
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 10000
    });
  }

  // Test 11: Production + missing secret: app.start() rejects before DB initialization
  const subMissing = runStartupSubprocess({ NODE_ENV: 'production' }, 'delete process.env.JWT_SECRET;');
  assert.strictEqual(subMissing.status, 1, 'Process must exit with code 1 on missing secret in production');
  assert.ok(subMissing.stderr.includes('missing or empty in production'), 'Must log missing or empty in production');
  assert.ok(!subMissing.stdout.includes('Connected to MySQL'), 'Must NOT attempt or succeed MySQL connection');
  assert.ok(!subMissing.stdout.includes('Attempting MySQL connection'), 'Must NOT attempt MySQL connection');
  assert.ok(!subMissing.stdout.includes('Server listening on http'), 'Must NOT start HTTP listener');
  passed++;
  console.log('  ✅ PASS: Production + missing secret: app.start() rejects before DB connection or HTTP listener');

  // Test 12: Production + empty secret: app.start() rejects before DB initialization
  const subEmpty = runStartupSubprocess({ NODE_ENV: 'production' }, 'process.env.JWT_SECRET = "   ";');
  assert.strictEqual(subEmpty.status, 1, 'Process must exit with code 1 on empty secret');
  assert.ok(subEmpty.stderr.includes('missing or empty in production'));
  assert.ok(!subEmpty.stdout.includes('Attempting MySQL connection'), 'Must NOT attempt DB initialization');
  assert.ok(!subEmpty.stdout.includes('Server listening on http'), 'Must NOT start HTTP listener');
  passed++;
  console.log('  ✅ PASS: Production + empty secret: app.start() rejects before DB connection or HTTP listener');

  // Test 13: Production + legacy default secret: app.start() rejects before DB initialization
  const subLegacy = runStartupSubprocess(
    { NODE_ENV: 'production' },
    `process.env.JWT_SECRET = "${_OLD_KNOWN_DEFAULT}";`
  );
  assert.strictEqual(subLegacy.status, 1, 'Process must exit with code 1 on legacy default');
  assert.ok(subLegacy.stderr.includes('insecure legacy default'), 'Must report insecure legacy default');
  assert.ok(!subLegacy.stdout.includes('Attempting MySQL connection'), 'Must NOT attempt DB initialization');
  assert.ok(!subLegacy.stdout.includes('Server listening on http'), 'Must NOT start HTTP listener');
  passed++;
  console.log('  ✅ PASS: Production + legacy default: app.start() rejects before DB connection or HTTP listener');

  // Test 14: Production + short secret (< 32 bytes): app.start() rejects before DB initialization
  const shortSecretVal = 'short-secret-under-32-chars';
  const subShort = runStartupSubprocess(
    { NODE_ENV: 'production' },
    `process.env.JWT_SECRET = "${shortSecretVal}";`
  );
  assert.strictEqual(subShort.status, 1, 'Process must exit with code 1 on short secret');
  assert.ok(subShort.stderr.includes('at least 32 bytes in length in production'), 'Must report byte length rule');
  assert.ok(!subShort.stderr.includes(shortSecretVal), 'Must NOT expose the short secret in stderr');
  assert.ok(!subShort.stdout.includes('Attempting MySQL connection'), 'Must NOT attempt DB initialization');
  assert.ok(!subShort.stdout.includes('Server listening on http'), 'Must NOT start HTTP listener');
  passed++;
  console.log('  ✅ PASS: Production + short secret: app.start() rejects before DB connection, secret never logged');

  // Test 15: Production + valid secret (>= 32 bytes): validation passes without error
  const validProductionSecret32 = 'production-secret-with-minimum-32-bytes-length-key-12345';
  const valRes = authConfig.validateAuthConfig({
    NODE_ENV: 'production',
    JWT_SECRET: validProductionSecret32
  });
  assert.strictEqual(valRes, validProductionSecret32);
  passed++;
  console.log('  ✅ PASS: Production + valid secret: validateAuthConfig() passes successfully');

  console.log(`\n=== ALL ${passed}/15 JWT TESTS PASSED ===\n`);
}

runJwtTests();
