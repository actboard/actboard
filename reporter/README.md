# @actboard/playwright-reporter

<p align="center">
  <a href="https://www.npmjs.com/package/@actboard/playwright-reporter"><img src="https://img.shields.io/npm/v/@actboard/playwright-reporter?color=crimson&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@actboard/playwright-reporter"><img src="https://img.shields.io/npm/dm/@actboard/playwright-reporter?color=blue" alt="downloads" /></a>
  <a href="https://www.npmjs.com/package/@playwright/test"><img src="https://img.shields.io/npm/dependency-version/@actboard/playwright-reporter/peer/%40playwright%2Ftest?label=%40playwright%2Ftest" alt="Playwright peer" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" /></a>
</p>

<p align="center">
  The official Playwright reporter for <a href="https://actboard.dev"><strong>ActBoard</strong></a> — a self-hostable dashboard that stores your Playwright test history, tracks pass rates, surfaces flaky tests, and connects to your CI pipeline.
</p>

---

### What you get

- **Full test history** — every run stored, browsable, and searchable
- **Pass rate trends** — see whether your suite is getting healthier over time
- **Flaky test detection** — tests that flip between pass/fail are automatically flagged
- **Branch & commit tracking** — compare runs across branches and deployments
- **CI-ready** — works with GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps, and more
- **Self-hostable** — one Docker command, your data stays on your infra

---

## Installation

```bash
npm install --save-dev @actboard/playwright-reporter
# or
yarn add -D @actboard/playwright-reporter
# or
pnpm add -D @actboard/playwright-reporter
```

## Quick Start

### 1. Start ActBoard

**Cloud:** Sign up at [actboard.dev](https://actboard.dev) and get an API key.

**Self-hosted (Docker):**
```bash
docker run -p 3141:3141 -v actboard_data:/app/data actboard/server:latest
# Then seed demo data:
docker exec actboard node scripts/seed.js
```

**Self-hosted (Node.js):**
```bash
npx actboard-server           # starts on http://localhost:3141
npx actboard-server seed      # seed demo data
```

### 2. Configure the reporter

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],   // keep the terminal reporter
    ['@actboard/playwright-reporter', {
      serverUrl: 'http://localhost:3141',       // or https://actboard.dev
      apiKey:    process.env.ACTBOARD_API_KEY,
      project:   'e2e-production',             // must match your project slug
      branch:    process.env.GITHUB_REF_NAME  || 'local',
      commitSha: process.env.GITHUB_SHA,
      triggeredBy: process.env.CI ? 'ci' : 'local',
    }],
  ],
});
```

### 3. Run your tests

```bash
ACTBOARD_API_KEY=act_yourkey npx playwright test
```

Results appear in the ActBoard dashboard immediately after the run completes.

---

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `apiKey` | `string` | ✓ | `ACTBOARD_API_KEY` env | Project API key from ActBoard dashboard |
| `serverUrl` | `string` | | `http://localhost:3141` | ActBoard server URL |
| `project` | `string` | | `ACTBOARD_PROJECT` env | Project slug (from Settings → Project) |
| `branch` | `string` | | `GITHUB_REF_NAME` or `'local'` | Git branch name |
| `commitSha` | `string` | | `GITHUB_SHA` | Full commit SHA |
| `commitMessage` | `string` | | `CI_COMMIT_MESSAGE` | Short commit message |
| `triggeredBy` | `string` | | `'ci'` / `'local'` | What triggered the run |
| `browsers` | `string[]` | | auto-detected | Override browser list |
| `metadata` | `object` | | `{}` | Extra key-value data attached to the run |
| `timeout` | `number` | | `30000` | HTTP request timeout (ms) |
| `verbose` | `boolean` | | `true` | Print ActBoard status to stdout |

---

## Environment Variables

The reporter reads these automatically — no code changes needed in CI:

```bash
ACTBOARD_API_KEY=act_myproject_abc123          # required
ACTBOARD_SERVER_URL=https://actboard.dev       # optional, default: localhost:3141
ACTBOARD_PROJECT=e2e-production                # optional, use if project not set in config
```

---

## CI Integration Examples

### GitHub Actions

```yaml
# .github/workflows/playwright.yml
name: Playwright Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx playwright install --with-deps

      - name: Run Playwright Tests
        env:
          ACTBOARD_API_KEY: ${{ secrets.ACTBOARD_API_KEY }}
          ACTBOARD_SERVER_URL: ${{ secrets.ACTBOARD_SERVER_URL }}
        run: npx playwright test
```

Add `ACTBOARD_API_KEY` and `ACTBOARD_SERVER_URL` to **Settings → Secrets and variables → Actions**.

---

### GitLab CI

```yaml
# .gitlab-ci.yml
playwright:
  image: mcr.microsoft.com/playwright:v1.44.0-jammy
  stage: test
  variables:
    ACTBOARD_API_KEY: $ACTBOARD_API_KEY
    ACTBOARD_SERVER_URL: $ACTBOARD_SERVER_URL
  script:
    - npm ci
    - npx playwright test
  artifacts:
    when: always
    paths:
      - playwright-report/
    expire_in: 1 week
```

---

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  playwright:
    docker:
      - image: mcr.microsoft.com/playwright:v1.44.0-jammy
    steps:
      - checkout
      - run: npm ci
      - run:
          name: Run Playwright Tests
          command: npx playwright test
          environment:
            ACTBOARD_API_KEY: $ACTBOARD_API_KEY
            ACTBOARD_SERVER_URL: $ACTBOARD_SERVER_URL
```

---

### Jenkins

```groovy
// Jenkinsfile
pipeline {
  agent any
  environment {
    ACTBOARD_API_KEY     = credentials('actboard-api-key')
    ACTBOARD_SERVER_URL  = 'https://actboard.yourcompany.com'
  }
  stages {
    stage('Test') {
      steps {
        sh 'npm ci'
        sh 'npx playwright install --with-deps chromium'
        sh 'npx playwright test'
      }
    }
  }
  post {
    always {
      publishHTML(target: [reportDir: 'playwright-report', reportFiles: 'index.html', reportName: 'Playwright Report'])
    }
  }
}
```

---

### Azure DevOps

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  ACTBOARD_API_KEY: $(ACTBOARD_API_KEY)
  ACTBOARD_SERVER_URL: $(ACTBOARD_SERVER_URL)

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'

  - script: npm ci
    displayName: Install dependencies

  - script: npx playwright install --with-deps
    displayName: Install browsers

  - script: npx playwright test
    displayName: Run Playwright tests
```

Add `ACTBOARD_API_KEY` and `ACTBOARD_SERVER_URL` as pipeline variables (mark as secret).

---

## How It Works

1. The reporter hooks into Playwright's lifecycle via `onBegin` / `onTestEnd` / `onEnd`
2. Results are buffered in memory during the run (zero impact on test performance)
3. When `onEnd` fires, results are POSTed to `POST /api/runs` on your ActBoard server
4. The server stores results in SQLite (self-host) or PostgreSQL (cloud) and finalizes the run record
5. The dashboard immediately reflects the new run

If the server is unreachable, the reporter logs a warning and exits gracefully — your test run always completes regardless.

---

## Troubleshooting

**Reporter not publishing results:**
- Check `ACTBOARD_API_KEY` is set in your CI environment
- Verify `serverUrl` is reachable from your CI runner (firewall / VPN?)
- Run with `verbose: true` (default) and check stdout for error messages

**`Invalid API key` error:**
- Copy the key exactly from Settings → API Keys in the dashboard
- Keys are shown only once when created — generate a new one if lost

**Connection timeout:**
- Increase `timeout` option (default: 30 seconds)
- Check that your ActBoard server is healthy: `curl http://your-server/api/health`

---

## License

MIT © [ActBoard](https://actboard.dev)
