#!/usr/bin/env node

const BASE_URL = 'https://espresense.com';

async function testEndpoint(name, url, expectedStatus, checkRedirect = false, method = 'GET') {
  try {
    const response = await fetch(url, { redirect: 'manual', method });
    const status = response.status;
    const passed = status === expectedStatus;

    console.log(`${passed ? '✓' : '✗'} ${name}`);
    console.log(`  URL: ${url}`);
    console.log(`  Method: ${method}`);
    console.log(`  Status: ${status} (expected ${expectedStatus})`);

    if (checkRedirect && (status === 301 || status === 302 || status === 307 || status === 308)) {
      const location = response.headers.get('location');
      console.log(`  Redirect: ${location}`);

      // Verify redirect location is a valid URL
      if (location) {
        try {
          new URL(location);
        } catch (e) {
          console.log(`  WARNING: Invalid redirect URL`);
        }
      }
    }

    if (!passed) {
      console.log(`  FAILED: Expected ${expectedStatus}, got ${status}`);
    }

    console.log('');
    return passed;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  URL: ${url}`);
    console.log(`  Error: ${error.message}`);
    console.log('');
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Deployment Test Suite');
  console.log('='.repeat(60));
  console.log('');

  const results = [];

  // Artifact Proxy Tests
  console.log('Artifact Proxy Tests (espresense.com/artifacts/*)');
  console.log('-'.repeat(60));

  results.push(await testEndpoint(
    'Latest download (master branch - GET)',
    `${BASE_URL}/artifacts/latest/download/master/esp32.bin`,
    302,
    true,
    'GET'
  ));

  results.push(await testEndpoint(
    'Latest download (master branch - HEAD)',
    `${BASE_URL}/artifacts/latest/download/master/esp32.bin`,
    302,
    true,
    'HEAD'
  ));

  // Release Proxy Tests
  console.log('Release Proxy Tests (espresense.com/releases/*)');
  console.log('-'.repeat(60));

  // Critical: Test HEAD request (used by ESP32 firmware for update detection)
  results.push(await testEndpoint(
    'Latest any download (HEAD - firmware update check)',
    `${BASE_URL}/releases/latest-any/download/esp32.bin`,
    302,
    true,
    'HEAD'
  ));

  results.push(await testEndpoint(
    'Latest any download (GET)',
    `${BASE_URL}/releases/latest-any/download/esp32.bin`,
    302,
    true,
    'GET'
  ));

  results.push(await testEndpoint(
    'Latest manifest',
    `${BASE_URL}/releases/latest.json`,
    200,
    false,
    'GET'
  ));

  results.push(await testEndpoint(
    'Non-existent release asset (404)',
    `${BASE_URL}/releases/latest-any/download/nonexistent.bin`,
    404,
    false,
    'GET'
  ));

  // Summary
  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log(`Results: ${passed}/${total} tests passed`);

  if (allPassed) {
    console.log('✓ All deployment tests passed!');
  } else {
    console.log(`✗ ${total - passed} test(s) failed`);
  }
  console.log('='.repeat(60));

  process.exit(allPassed ? 0 : 1);
}

runTests();
