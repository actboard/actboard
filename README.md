# 🎭 ActBoard

**The open-source Playwright test intelligence platform.** Store every test run historically, track pass rates, surface flaky tests, and connect to your CI pipeline — self-hosted or on our cloud.

[![npm](https://img.shields.io/npm/v/@actboard/playwright-reporter?label=%40actboard%2Fplaywright-reporter)](https://www.npmjs.com/package/@actboard/playwright-reporter)
[![npm](https://img.shields.io/npm/v/actboard-server?label=actboard-server)](https://www.npmjs.com/package/actboard-server)
[![Docker](https://img.shields.io/docker/pulls/actboard/server?label=Docker%20pulls)](https://hub.docker.com/r/actboard/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## How It Works

```
Your CI runner
  └─ npx playwright test
       └─ @actboard/playwright-reporter  ──POST /api/runs──▶  ActBoard Server
                                                                    │
                                                              SQLite / PostgreSQL
                                                                    │
                                                              Dashboard UI  ◀── You
```

1. Install `@actboard/playwright-reporter` and add it to `playwright.config.ts`
2. Run your tests — results stream to your ActBoard server automatically
3. Open the dashboard to see historical trends, failures, flaky tests, and analytics

---

## Quickstart

### Option A — Cloud (zero infra)

1. Sign up at **[actboard.io](https://actboard.io)**
2. Get your API key from Settings → API Keys
3. Skip to **Step 3** below

### Option B — Self-hosted (Node.js)

```bash
# Start the server (SQLite, no other dependencies)
npx actboard-server

# In a new terminal — seed 30 days of demo data:
npx actboard-server seed

# Dashboard is live at http://localhost:3141
```

### Option C — Self-hosted (Docker)

```bash
# Single container, data persisted in a named volume
docker run -p 3141:3141 -v actboard_data:/app/data actboard/server:latest

# Seed demo data:
docker exec actboard node scripts/seed.js
```

### Option D — Docker Compose (recommended for self-hosting)

```bash
curl -O https://raw.githubusercontent.com/actboard/actboard/main/docker-compose.yml
docker compose up -d

# Seed demo data:
docker compose exec actboard node scripts/seed.js
```

---

## Step 3 — Connect your Playwright project

```bash
npm install --save-dev @actboard/playwright-reporter
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@actboard/playwright-reporter', {
      serverUrl: 'http://localhost:3141',        // or https://actboard.io
      apiKey:    process.env.ACTBOARD_API_KEY,
      project:   'e2e-production',              // your project slug
      branch:    process.env.GITHUB_REF_NAME  || 'local',
      commitSha: process.env.GITHUB_SHA,
      triggeredBy: process.env.CI ? 'ci' : 'local',
    }],
  ],
});
```

```bash
ACTBOARD_API_KEY=act_yourkey npx playwright test
# Results appear in the dashboard immediately ✓
```

---

## Repository Structure

```
actboard/
├── server/                  ← actboard-server (npm + Docker)
│   ├── index.js             ← Fastify/Express server entry point
│   ├── cli.js               ← npx actboard-server CLI
│   ├── db.js                ← SQLite schema + query helpers
│   ├── routes/
│   │   ├── runs.js          ← POST/GET /api/runs
│   │   ├── projects.js      ← CRUD /api/projects
│   │   └── analytics.js     ← /api/analytics/summary|trend|flaky|browsers
│   ├── middleware/
│   │   └── auth.js          ← API key authentication (SHA-256 hashed)
│   ├── scripts/
│   │   └── seed.js          ← Demo data generator (30 days, 5 suites)
│   └── public/
│       └── index.html       ← Dashboard SPA (all 6 views, Chart.js)
│
├── reporter/                ← @actboard/playwright-reporter (npm)
│   ├── src/index.ts         ← TypeScript reporter source
│   └── dist/                ← Compiled output (run `npm run build` after cloning)
│
├── examples/                ← Example Playwright project with reporter wired up
│
├── Dockerfile               ← Multi-stage build (node:20-alpine, ~120MB image)
├── docker-compose.yml       ← Single-command self-host
└── .env.example             ← Environment variable reference
```

---

## Dashboard Views

| View | What you get |
|------|-------------|
| **Dashboard** | Pass rate metric, total runs, avg duration, flaky count. 14-day area chart + pass/fail donut. Recent runs table. |
| **Test Runs** | Full run history. Search by branch/commit. Filter by status, branch, browser. Paginated. |
| **Run Detail** | Suite accordions with collapsible test rows. Stack traces rendered like Playwright's own output. Retry counts. |
| **Analytics** | 30-day pass rate trend. Avg run duration chart. Flaky test detector (top 10 by flake rate). Browser breakdown donut. |
| **Integrations** | GitHub, GitLab, Jira, Slack, Jenkins, Linear, CircleCI, Azure DevOps cards with connect/disconnect state and reporter config snippets. |
| **Settings** | Project config with Save. API key management (create/revoke). Notification toggles. Danger zone (clear history). |

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check + version |
| `GET` | `/api/projects` | None | List all projects |
| `POST` | `/api/projects` | None | Create project (returns API key) |
| `GET` | `/api/projects/:id` | None | Get project by ID or slug |
| `PATCH` | `/api/projects/:id` | None | Update project name/URL |
| `GET` | `/api/projects/:id/keys` | None | List API keys (prefixes only) |
| `POST` | `/api/projects/:id/keys` | None | Create new API key |
| `POST` | `/api/runs` | **API Key** | Publish a test run (reporter endpoint) |
| `GET` | `/api/runs` | None | List runs (filter by project, status, branch, browser) |
| `GET` | `/api/runs/:id` | None | Get run detail with suites + tests |
| `DELETE` | `/api/runs/:id` | None | Delete a run |
| `GET` | `/api/analytics/summary` | None | KPIs for a project |
| `GET` | `/api/analytics/trend` | None | Daily pass rate over N days |
| `GET` | `/api/analytics/flaky` | None | Top flaky tests |
| `GET` | `/api/analytics/browsers` | None | Browser breakdown |

---

## CLI Reference

```bash
npx actboard-server                   # Start server on port 3141
npx actboard-server --port 8080       # Custom port
npx actboard-server --data /var/actboard  # Custom data directory
npx actboard-server seed              # Seed demo data
npx actboard-server seed --clear      # Wipe existing data then seed
npx actboard-server --version         # Print version
npx actboard-server --help            # Full usage
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3141` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | SQLite database directory |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (restrict in production) |
| `NODE_ENV` | `development` | Set to `production` in deployments |

Reporter env variables (set in CI):

| Variable | Description |
|----------|-------------|
| `ACTBOARD_API_KEY` | Project API key |
| `ACTBOARD_SERVER_URL` | ActBoard server URL |
| `ACTBOARD_PROJECT` | Project slug (if not set in config) |

---

## CI Integration

See [`reporter/README.md`](reporter/README.md) for full examples:
- **GitHub Actions** — copy/paste workflow YAML
- **GitLab CI** — `.gitlab-ci.yml` snippet
- **CircleCI** — `config.yml` snippet
- **Jenkins** — Jenkinsfile snippet
- **Azure DevOps** — `azure-pipelines.yml` snippet

---

## Self-Hosting on Any Cloud

| Platform | Method |
|----------|--------|
| **Railway** | Deploy from Docker Hub image: `actboard/server:latest` |
| **Fly.io** | `fly launch --image actboard/server:latest` |
| **Render** | New Web Service → Docker → image: `actboard/server:latest` |
| **AWS ECS** | Use our Terraform module (Phase 2) |
| **Azure Container Apps** | Deploy from `actboard/server:latest` |
| **GCP Cloud Run** | `gcloud run deploy --image actboard/server:latest` |
| **Kubernetes** | Helm chart coming in Phase 3 |

---

## Contributing

```bash
# Clone the repo
git clone https://github.com/actboard/actboard.git
cd actboard

# Start server in dev mode (auto-restarts on file changes)
cd server && npm install && npm run seed && npm run dev

# Build the reporter from source (dist/ is not committed)
cd reporter && npm install && npm run build

# Try the example project
cd examples && npm install && npx playwright install chromium
ACTBOARD_API_KEY=act_e2e-production_demo_key_for_testing_only_1234 npx playwright test
```

PRs welcome. Please open an issue before large changes.

---

## License

MIT © [ActBoard](https://actboard.io)
