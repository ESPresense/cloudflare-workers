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
cd espresense-artifact-proxy && npm test
cd espresense-release-proxy && npm test

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

The workers automatically deploy to production when pushing to the `master` branch.

**Setup:**

1. Go to your GitHub repository settings
2. Navigate to Secrets and Variables → Actions
3. Add a new repository secret:
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Your Cloudflare API token (create one at https://dash.cloudflare.com/profile/api-tokens)

**Required API Token Permissions:**
- Account → Workers Scripts → Edit
- Zone → Workers Routes → Edit

The workflow will:
1. Run unit tests for both workers
2. Deploy both workers to Cloudflare
3. Run deployment tests against espresense.com

## Testing

The deployment test suite validates both workers are functioning correctly:

```bash
npm run test:deployment
```

Tests:
- Artifact proxy: `/artifacts/latest/download/master/esp32.bin`
- Release proxy: `/releases/latest-any/download/esp32.bin`