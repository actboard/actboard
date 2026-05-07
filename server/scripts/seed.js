/**
 * ActBoard — Seed script
 *
 * Creates a demo project with 30 days of realistic test data.
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --clear   (wipe existing data first)
 */

import { initDb, Projects, ApiKeys, Runs, Suites, Tests, getDb } from '../db.js';
import { randomBytes } from 'crypto';
import { hashKey } from '../middleware/auth.js';

const CLEAR = process.argv.includes('--clear');

initDb();
const db = getDb();

if (CLEAR) {
  console.log('  Clearing existing data…');
  db.exec(`DELETE FROM tests; DELETE FROM suites; DELETE FROM runs; DELETE FROM api_keys; DELETE FROM projects;`);
}

// ── Create demo project ────────────────────────────────
const existingProject = Projects.findBySlug('e2e-production');
let project, rawKey;

if (existingProject) {
  project = existingProject;
  rawKey = null; // already exists
  console.log(`  Project already exists: ${project.name}`);
} else {
  const id = `proj_demo0000000`;
  project = { id, name: 'e2e-production', slug: 'e2e-production', base_url: 'https://app.example.com' };
  Projects.create(project);

  rawKey = `act_e2e-production_demo_key_for_testing_only_1234`;
  ApiKeys.create({
    id:         `key_demo00000000`,
    project_id: project.id,
    name:       'Demo Key',
    key_prefix: rawKey.slice(0, 24),
    key_hash:   hashKey(rawKey),
  });

  console.log(`  ✓ Created project: ${project.name}`);
  console.log(`  ✓ API key: ${rawKey}`);
}

// ── Test suite definitions ─────────────────────────────
const SUITE_DEFS = [
  {
    file: 'tests/auth.spec.ts',
    title: 'auth.spec.ts',
    tests: [
      'should render login page correctly',
      'should login with valid credentials',
      'should show error on invalid password',
      'should redirect to dashboard after login',
      'should logout and clear session',
      'should handle SSO login flow',
      'should block after 5 failed attempts',
      'should reset password via email link',
    ],
  },
  {
    file: 'tests/navigation.spec.ts',
    title: 'navigation.spec.ts',
    tests: [
      'should load the home page',
      'should navigate via top nav links',
      'should render breadcrumb on deep pages',
      'should persist scroll position on back',
      'should handle 404 gracefully',
    ],
  },
  {
    file: 'tests/checkout.spec.ts',
    title: 'checkout.spec.ts',
    tests: [
      'should add item to cart',
      'should update quantity in cart',
      'should remove item from cart',
      'should apply discount code',
      'should complete checkout with valid card',
      'should show order confirmation page',
      'should send confirmation email',
    ],
  },
  {
    file: 'tests/api.spec.ts',
    title: 'api.spec.ts',
    tests: [
      'GET /api/user returns 200',
      'POST /api/session creates token',
      'DELETE /api/session invalidates token',
      'GET /api/products returns paginated list',
      'rate limiter returns 429 after 100 reqs',
      'PATCH /api/user updates profile fields',
    ],
  },
  {
    file: 'tests/forms.spec.ts',
    title: 'forms.spec.ts',
    tests: [
      'required fields show validation errors',
      'email field validates format',
      'file upload shows progress bar',
      'form submits successfully with valid data',
      'autosave draft on input change',
    ],
  },
];

const BRANCHES = ['main', 'main', 'main', 'main', 'main', 'main', 'main', 'main', 'main', 'main',
                  'develop', 'develop', 'develop', 'develop', 'develop',
                  'feature/auth-flow', 'feature/auth-flow', 'feature/auth-flow',
                  'fix/login-timeout', 'fix/login-timeout',
                  'feature/checkout', 'feature/checkout'];

const BROWSERS_LIST = [['chromium'], ['firefox'], ['webkit'], ['chromium', 'firefox'], ['chromium', 'webkit'], ['chromium', 'firefox', 'webkit']];
const TRIGGERS = ['push', 'push', 'push', 'push', 'manual', 'schedule', 'push'];

// Known-flaky tests (higher retry probability)
const KNOWN_FLAKY = new Set([
  'should persist scroll position on back',
  'should complete checkout with valid card',
  'file upload shows progress bar',
  'rate limiter returns 429 after 100 reqs',
]);

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCommit() {
  return randomBytes(4).toString('hex');
}

// ── Generate 30 days of runs ───────────────────────────
const now = Math.floor(Date.now() / 1000);
const THIRTY_DAYS = 30 * 86400;
let runsCreated = 0;

console.log('  Seeding test runs…');

for (let day = 29; day >= 0; day--) {
  // 1-3 runs per day
  const runsToday = rand(1, 3);
  for (let r = 0; r < runsToday; r++) {
    const startedAt = now - day * 86400 - rand(0, 72000);
    const branch    = pick(BRANCHES);
    const browsers  = pick(BROWSERS_LIST);
    const runId     = `run_seed_${randomBytes(8).toString('hex')}`;

    // Simulate gradual improvement: older runs have lower pass rates
    const baseFailRate = Math.max(0.02, 0.12 - (29 - day) * 0.003);

    let totalTests = 0, passedTests = 0, failedTests = 0, flakyTests = 0, skippedTests = 0;
    let runDuration = 0;
    const suiteRows = [];
    const testRows  = [];

    for (const suiteDef of SUITE_DEFS) {
      const suiteId = `suite_${randomBytes(8).toString('hex')}`;
      let sPass = 0, sFail = 0, sFlaky = 0, sDuration = 0;

      const suiteTests = suiteDef.tests.map(title => {
        const isKnownFlaky = KNOWN_FLAKY.has(title);
        const failProb = isKnownFlaky ? 0.18 : baseFailRate;
        const flakyProb = isKnownFlaky ? 0.15 : 0.02;

        let status = 'passed';
        let retryCount = 0;

        const roll = Math.random();
        if (roll < failProb) {
          status = 'failed';
          retryCount = rand(1, 2);
        } else if (roll < failProb + flakyProb) {
          status = 'flaky';
          retryCount = rand(1, 3);
        }

        const durationMs = rand(400, 8000);
        sDuration += durationMs;

        if (status === 'passed') sPass++;
        else if (status === 'failed') sFail++;
        else if (status === 'flaky') sFlaky++;

        const errorData = (status === 'failed' || status === 'flaky') ? {
          error_message: `Error: Assertion failed for "${title}"`,
          error_stack: `Error: Assertion failed for "${title}"\n    at ${suiteDef.file}:${rand(10, 200)}\n    at runTest (playwright-core/lib/test.js:45)`,
        } : { error_message: null, error_stack: null };

        return {
          id: `test_${randomBytes(8).toString('hex')}`,
          run_id: runId,
          suite_id: suiteId,
          title,
          full_title: `${suiteDef.title} > ${title}`,
          file: suiteDef.file,
          line: rand(10, 300),
          status,
          duration_ms: durationMs,
          retry_count: retryCount,
          ...errorData,
          browser: pick(browsers),
          tags: JSON.stringify([]),
          started_at: startedAt,
        };
      });

      suiteTests.forEach(t => testRows.push(t));
      totalTests   += suiteTests.length;
      passedTests  += sPass;
      failedTests  += sFail;
      flakyTests   += sFlaky;
      runDuration  += sDuration;

      suiteRows.push({
        id: suiteId,
        run_id: runId,
        title: suiteDef.title,
        file: suiteDef.file,
        total_tests:  suiteTests.length,
        passed_tests: sPass,
        failed_tests: sFail,
        flaky_tests:  sFlaky,
        duration_ms:  sDuration,
      });
    }

    let status = 'passed';
    if (failedTests > 0) status = 'failed';
    else if (flakyTests > 0) status = 'flaky';

    // Insert into DB
    const stmt = db.prepare(`
      INSERT INTO runs (id, project_id, branch, commit_sha, triggered_by, status,
        total_tests, passed_tests, failed_tests, flaky_tests, skipped_tests, duration_ms,
        browsers, started_at, finished_at, metadata)
      VALUES (@id, @project_id, @branch, @commit_sha, @triggered_by, @status,
        @total_tests, @passed_tests, @failed_tests, @flaky_tests, @skipped_tests, @duration_ms,
        @browsers, @started_at, @finished_at, '{}')
    `);

    stmt.run({
      id: runId,
      project_id: project.id,
      branch,
      commit_sha: generateCommit(),
      triggered_by: pick(TRIGGERS),
      status,
      total_tests:   totalTests,
      passed_tests:  passedTests,
      failed_tests:  failedTests,
      flaky_tests:   flakyTests,
      skipped_tests: skippedTests,
      duration_ms:   runDuration,
      browsers:      JSON.stringify(browsers),
      started_at:    startedAt,
      finished_at:   startedAt + Math.floor(runDuration / 1000),
    });

    Suites.bulkInsert(suiteRows);
    Tests.bulkInsert(testRows);
    runsCreated++;
  }
}

console.log(`  ✓ Created ${runsCreated} runs with real test data`);
console.log(`\n  🎉 Seed complete! Start the server and visit http://localhost:3141`);
if (rawKey) {
  console.log(`\n  Your API key: ${rawKey}`);
  console.log(`  Add to playwright.config.ts:\n`);
  console.log(`    reporter: [['@actboard/playwright-reporter', {`);
  console.log(`      apiKey: '${rawKey}',`);
  console.log(`      project: '${project.slug}',`);
  console.log(`    }]],\n`);
}
