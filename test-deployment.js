#!/usr/bin/env node

const BASE_URL = 'https://espresense.com';

async function testEndpoint(name, url, expectedStatus, checkRedirect = false) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const status = response.status;
    const passed = status === expectedStatus;

    console.log(`${passed ? '✓' : '✗'} ${name}`);
    console.log(`  URL: ${url}`);
    console.log(`  Status: ${status} (expected ${expectedStatus})`);

    if (checkRedirect && status === 302) {
      const location = response.headers.get('location');
      console.log(`  Redirect: ${location}`);
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
    'Latest download (master branch)',
    `${BASE_URL}/artifacts/latest/download/master/esp32.bin`,
    302,
    true
  ));

  // Release Proxy Tests
  console.log('Release Proxy Tests (espresense.com/releases/*)');
  console.log('-'.repeat(60));
  results.push(await testEndpoint(
    'Latest any download',
    `${BASE_URL}/releases/latest-any/download/esp32.bin`,
    302,
    true
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
