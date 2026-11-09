// tests/jwt_security_hardening.test.js
/**
 * Isolated unit tests for JWT secret hardening and configuration safety.
 */

const assert = require('assert');
const authConfig = require('../server/config/auth');

function runJwtTests() {
  console.log('=== STARTING JWT SECURITY HARDENING UNIT TESTS ===\n');

  let passed = 0;
  const { _resolveJwtSecret, _OLD_KNOWN_DEFAULT, _MIN_SECRET_BYTES } = authConfig;

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
    console.log('  ✅ PASS: Production with empty JWT_SECRET fails fast');
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
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'too-short-key' });
    assert.fail('Should have thrown on secret shorter than 32 bytes');
  } catch (err) {
    assert.ok(err.message.includes('at least 32 bytes of entropy'), 'Must reject secrets shorter than 32 bytes');
    passed++;
    console.log('  ✅ PASS: Production with secret < 32 bytes fails fast');
  }

  // Test 5: Production with valid high-entropy secret succeeds
  const validProductionSecret = 'valid-production-secret-with-high-entropy-64-characters-long-example';
  const resolvedProd = _resolveJwtSecret({
    NODE_ENV: 'production',
    JWT_SECRET: validProductionSecret
  });
  assert.strictEqual(resolvedProd, validProductionSecret, 'Must return the provided valid production secret');
  passed++;
  console.log('  ✅ PASS: Production with valid high-entropy secret initializes successfully');

  // Test 6: Development fallback without JWT_SECRET generates random secret (not static)
  // Clear any existing cached secret for testing
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
  // Assert that error messages do NOT print or interpolate the actual secret value
  try {
    _resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'my-confidential-secret-123' });
  } catch (err) {
    assert.strictEqual(err.message.includes('my-confidential-secret-123'), false, 'Error message must not expose the secret value');
    passed++;
    console.log('  ✅ PASS: Error messages never expose secret values');
  }

  console.log(`\n=== JWT TESTS COMPLETED: ${passed}/10 PASSED ===\n`);
}

runJwtTests();
