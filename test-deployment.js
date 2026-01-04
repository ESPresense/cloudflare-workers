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

  // Manifest Validation Tests
  console.log('Manifest Validation Tests (verify all manifest URLs are valid)');
  console.log('-'.repeat(60));

  // Test latest release manifest
  try {
    const manifestUrl = `${BASE_URL}/releases/latest.json`;
    const manifestResponse = await fetch(manifestUrl);

    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      console.log(`Fetched manifest: ${manifest.name}`);
      console.log(`  Builds: ${manifest.builds.length}`);

      // Test each build in the manifest
      for (const build of manifest.builds) {
        console.log(`  Testing ${build.chipFamily} build with ${build.parts.length} parts...`);

        // Test each part (bootloader, partition, firmware, etc.)
        for (const part of build.parts) {
          const partUrl = `${BASE_URL}${part.path}`;
          const partResponse = await fetch(partUrl, { method: 'HEAD' });
          const passed = partResponse.ok;

          results.push(passed);

          if (!passed) {
            console.log(`    ✗ ${part.path} - ${partResponse.status}`);
            console.log(`      URL: ${partUrl}`);
            console.log(`      FAILED: File referenced in manifest returns ${partResponse.status}`);
          } else {
            console.log(`    ✓ ${part.path} - ${partResponse.status}`);
          }
        }
      }
    } else {
      console.log(`✗ Failed to fetch manifest: ${manifestResponse.status}`);
      results.push(false);
    }
  } catch (error) {
    console.log(`✗ Manifest validation error: ${error.message}`);
    results.push(false);
  }

  console.log('');

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
