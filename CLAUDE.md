# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a monorepo containing two Cloudflare Workers that proxy ESPresense firmware artifacts and releases:

- **espresense-artifact-proxy** - Proxies GitHub Actions artifacts from workflow runs
  - Routes: `/artifacts/*`
  - Dependencies: Hono, Octokit, fflate (for unzipping artifacts)

- **espresense-release-proxy** - Proxies GitHub release assets
  - Routes: `/releases/*`
  - Dependencies: Hono

Both workers use the Hono web framework and are deployed to `espresense.com`.

## Development Commands

### Root Level Commands

```bash
# Run all tests in parallel
npm run test:all

# Validate all deployments (dry-run, no actual deployment)
npm run check:all

# Deploy both workers in parallel
npm run deploy:all

# Deploy and test
npm run deploy:test

# Test live deployment endpoints
npm run test:deployment
```

### Individual Worker Commands

Navigate to either `espresense-artifact-proxy/` or `espresense-release-proxy/` directory:

```bash
# Run tests for a single worker
npm test

# Local development server
npm run dev

# Validate deployment (dry-run)
npm run check

# Deploy to production
npm run deploy
```

## Architecture

### Artifact Proxy (`espresense-artifact-proxy`)

The artifact proxy resolves GitHub Actions artifacts from workflow runs and serves them as downloads:

1. **Latest downloads** (`/artifacts/latest/download/:branch/:bin`) - Queries GitHub API for the most recent successful build on a branch, redirects to specific run download
2. **Run-specific downloads** (`/artifacts/download/runs/:run_id/:sha/:bin`) - Finds artifacts for a specific workflow run, redirects to artifact ID download
3. **Artifact downloads** (`/artifacts/download/:artifact_id/*`) - Fetches from nightly.link, unzips using fflate, returns binary file
4. **Manifests** (`/artifacts/:run_id.json`) - Generates ESP32/ESP32-C3 flash manifests for web installer, pointing to artifacts for a specific run

**Caching Strategy:**
All GitHub API requests are cached using Cloudflare's edge cache (`cf.cacheTtlByStatus`) to avoid rate limiting:
- Latest builds (GitHub API): 5 minutes (changes frequently)
- Latest builds (client response): 5 minutes
- Specific run artifacts (GitHub API): 24 hours (immutable once created)
- Specific run artifacts (client response): 24 hours
- Artifact downloads by ID: 7 days (fully immutable)
- 400-499 errors (including 403 rate limits): 60 seconds
- 500-599 errors: No caching (0 seconds)

### Release Proxy (`espresense-release-proxy`)

The release proxy serves GitHub release assets with caching:

1. **Manifests** (`/releases/:tag.json`) - Generates ESP32/ESP32-C3 flash manifests for web installer
2. **Downloads** (`/releases/download/:tag/:filename`) - Proxies release asset downloads
3. **Latest prerelease** (`/releases/latest-any/download/:filename`) - Finds the latest release (including prereleases) with assets

**CRITICAL: Redirect Requirement**

The `/releases/latest-any/download/:filename` endpoint **MUST return a 3xx redirect**, not proxy the download.

The ESP32 firmware's update detection mechanism (`Updater::checkForUpdates()`) works as follows:
1. Sends a HEAD request to the firmware URL
2. Expects a 3xx redirect response (not 200)
3. Extracts the `Location` header from the redirect
4. Compares the Location URL against a version marker (e.g., `/v1.2.3/`)
5. If the version marker is missing or different, saves the redirect URL and restarts to apply the update

If this endpoint proxies instead of redirects, it returns 200 with binary data, and the firmware's `isRedirect` check fails, preventing automatic updates from working.

**Caching Strategy:**
- Latest release: 5 minutes (changes frequently)
- Specific releases: 24 hours (immutable)
- 400-499 errors (including 403 rate limits): 60 seconds
- 500-599 errors: No caching (0 seconds)

### Error Handling and Observability

Both workers throw errors on GitHub API 403 responses (rate limiting) so they appear in Cloudflare's error metrics:
- **403 responses**: Throw `Error` with descriptive message - shows up as worker execution failure in observability
- **404 responses**: Return JSON error with 404 status - legitimate "not found", not an execution error
- **Other 4xx/5xx**: Return JSON error with original status code - pass through to client

This distinction is important because Cloudflare Workers observability tracks "errors" as execution failures (uncaught exceptions), not HTTP status codes. By throwing on 403, we can track and alert on rate limiting issues.

### Shared Manifest Logic

Both workers generate JSON manifests for the ESP Web Tools installer. The manifest format includes:
- `esp32()` and `esp32c3()` helper functions that define bootloader, partition, and firmware file locations with memory offsets
- Support for flavor variants (e.g., `?flavor=ble`) to select different firmware builds
- Asset lookup with fallback logic: tries flavor-specific files first, then defaults

**Static File Paths:** The bootloader and partition files are served from the ESPresense.github.io repository's `/static/` directory:
- ESP32 bootloader: `/static/esp32/bootloader.bin`
- ESP32 partitions: `/static/esp32/partitions.bin`
- ESP32-C3 bootloader: `/static/esp32c3/bootloader.bin`
- ESP32-C3 partitions: `/static/esp32c3/partitions.bin`
- Boot app selector (shared): `/static/boot_app0.bin`

These files are maintained in the ESPresense.github.io repository and are chip-specific but firmware-version independent.

### Deployment

The main branch is `main` (not master, despite validate.yml checking PRs against master).

**GitHub Actions workflows:**
- `validate.yml` - Runs on PRs, validates deployments without deploying
- `deploy.yml` - Runs on push to main, deploys both workers to production, then runs deployment tests

**Observability:** Both workers have Cloudflare observability enabled in `wrangler.toml` with full logging, invocation logs, and persistence enabled.

## Testing

Both workers have Jest test suites in `src/index.test.ts`. Tests use `jest-environment-wrangler` to simulate the Cloudflare Workers runtime.

The root `test-deployment.js` script validates live production endpoints at `espresense.com` by checking for expected HTTP redirects.
