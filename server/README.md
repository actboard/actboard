# actboard/server

Self-hostable Playwright test history server — stores every run, tracks pass-rate trends over time, detects flaky tests, and gives your team a dashboard to analyse CI health across branches and commits.

## Quick Start

```bash
docker run -d \
  --name actboard \
  -p 3141:3141 \
  -v actboard_data:/app/data \
  actboard/server:latest
```

Open **http://localhost:3141** in your browser.

## With Docker Compose

```yaml
services:
  actboard:
    image: actboard/server:latest
    ports:
      - "3141:3141"
    volumes:
      - actboard_data:/app/data
    restart: unless-stopped

volumes:
  actboard_data:
```

## Seed Demo Data

```bash
docker exec actboard node scripts/seed.js
```

Populates 30 days of realistic test history (5 suites, flaky test detection, branch tracking).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3141` | HTTP port to listen on |
| `DATA_DIR` | `/app/data` | Directory for SQLite database |

## Connecting the Reporter

Install the Playwright reporter in your test project:

```bash
npm install --save-dev @actboard/playwright-reporter
```

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [
    ['@actboard/playwright-reporter', {
      serverUrl: 'http://your-actboard-host:3141',
      apiKey: process.env.ACTBOARD_API_KEY,
      project: 'e2e-production',
    }],
  ],
});
```

Generate an API key from **Settings → API Keys** in the dashboard.

## Volumes

All data is stored in the `/app/data` volume (SQLite). Mount a named volume or host path to persist data across container restarts.

## Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `1.0.0` | Pinned version |

## Source

- GitHub: [github.com/actboard/actboard](https://github.com/actboard/actboard)
- npm reporter: [@actboard/playwright-reporter](https://www.npmjs.com/package/@actboard/playwright-reporter)
- Homepage: [actboard.io](https://actboard.io)

## License

MIT
