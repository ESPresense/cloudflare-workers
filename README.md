# ESPresense Cloudflare Workers

Cloudflare Workers for proxying ESPresense artifacts and releases.

## Projects

- **espresense-artifact-proxy** - Proxies GitHub Actions artifacts
  - Route: `espresense.com/artifacts/*`
- **espresense-release-proxy** - Proxies GitHub releases
  - Route: `espresense.com/releases/*`

## Tech Stack

- [Hono](https://hono.dev/) v4.11.3 - Web framework
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) v4.54.0 - Cloudflare Workers CLI

## Development

```bash
# Install dependencies
cd espresense-artifact-proxy && npm install
cd espresense-release-proxy && npm install

# Run tests
npm run test:all

# Validate deployments (dry-run, no actual deployment)
npm run check:all

# Local development
cd espresense-artifact-proxy && npm run dev
cd espresense-release-proxy && npm run dev
```

## Deployment

### Manual Deployment

```bash
# Deploy both workers in parallel
npm run deploy:all

# Deploy and run tests
npm run deploy:test

# Deploy individual workers
npm run deploy:artifact-proxy
npm run deploy:release-proxy

# Test deployment
npm run test:deployment
```

### Automatic Deployment (GitHub Actions)

**Pull Requests:**
- Runs tests and validates deployments (dry-run)
- No actual deployment occurs
- Ensures changes are deployable before merging

**Master Branch:**
- Automatically deploys to production on push
- Runs tests, deploys, and validates

**Setup:**

1. Go to your GitHub repository settings
2. Navigate to Secrets and Variables → Actions
3. Add a new repository secret:
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Your Cloudflare API token (create one at https://dash.cloudflare.com/profile/api-tokens)

**Required API Token Permissions:**
- Account → Workers Scripts → Edit
- Zone → Workers Routes → Edit

**Workflows:**
- `validate.yml` - Runs on PRs, validates without deploying
- `deploy.yml` - Runs on master push, deploys to production

## Testing

The deployment test suite validates both workers are functioning correctly:

```bash
npm run test:deployment
```

Tests:
- Artifact proxy: `/artifacts/latest/download/master/esp32.bin`
- Release proxy: `/releases/latest-any/download/esp32.bin`