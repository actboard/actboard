/**
 * @actboard/playwright-reporter
 *
 * Playwright reporter that buffers test results during a run and publishes
 * them to an ActBoard server (self-hosted or cloud) when the run ends.
 *
 * Usage in playwright.config.ts:
 *
 *   import { defineConfig } from '@playwright/test';
 *
 *   export default defineConfig({
 *     reporter: [
 *       ['list'],
 *       ['@actboard/playwright-reporter', {
 *         serverUrl: 'http://localhost:3141',   // or your cloud URL
 *         apiKey: process.env.ACTBOARD_API_KEY,
 *         project: 'e2e-production',            // matches project slug
 *         branch: process.env.GITHUB_REF_NAME || 'local',
 *         commitSha: process.env.GITHUB_SHA,
 *         commitMessage: process.env.COMMIT_MESSAGE,
 *         triggeredBy: process.env.CI ? 'ci' : 'local',
 *         // Optional: browsers to tag runs with (auto-detected if omitted)
 *         browsers: ['chromium'],
 *         // Optional: extra metadata attached to the run
 *         metadata: { ci_url: process.env.CI_JOB_URL },
 *       }],
 *     ],
 *   });
 */

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';

// ── Types ──────────────────────────────────────────────

export interface ActBoardOptions {
  /**
   * URL of your ActBoard server.
   * Priority: this option → ACTBOARD_SERVER_URL env var → http://localhost:3141
   */
  serverUrl?: string;
  /** API key generated from the ActBoard dashboard */
  apiKey: string;
  /**
   * Project slug (must match a project on the server).
   * Priority: this option → ACTBOARD_PROJECT env var
   */
  project?: string;
  /** Git branch name */
  branch?: string;
  /** Full commit SHA */
  commitSha?: string;
  /** Short commit message */
  commitMessage?: string;
  /** What triggered this run (push, manual, schedule, ci, local…) */
  triggeredBy?: string;
  /** List of browsers used in this run (auto-detected from results if omitted) */
  browsers?: string[];
  /** Extra metadata attached to the run (JSON-serialisable object) */
  metadata?: Record<string, unknown>;
  /** Timeout for the HTTP publish request in ms (default: 30000) */
  timeout?: number;
  /** Set to false to suppress ActBoard output (default: true) */
  verbose?: boolean;
}

interface SuitePayload {
  title: string;
  file: string | null;
  tests: TestPayload[];
}

interface TestPayload {
  title: string;
  full_title: string;
  file: string | null;
  line: number | null;
  status: 'passed' | 'failed' | 'flaky' | 'skipped';
  duration_ms: number;
  retry_count: number;
  error_message: string | null;
  error_stack: string | null;
  browser: string | null;
  tags: string[];
  started_at: string | null;
}

// ── Helpers ────────────────────────────────────────────

function resolveStatus(result: TestResult, test: TestCase): TestPayload['status'] {
  if (result.status === 'skipped') return 'skipped';
  // expectedStatus lives on TestCase, not TestResult
  if (result.status === test.expectedStatus) {
    // Flaky = eventually passed but needed at least one retry
    return test.results.length > 1 && test.results.some(r => r.status !== test.expectedStatus)
      ? 'flaky'
      : 'passed';
  }
  return 'failed';
}

function extractBrowser(result: TestResult): string | null {
  // Playwright attaches project name / browser info in various ways
  const projectName = (result as { workerIndex?: number; parallelIndex?: number; attachments?: unknown[] } & typeof result)
    // @ts-ignore — internal field available in Playwright ≥1.38
    ?.workerIndex !== undefined ? null : null;

  // Try to find browser from result annotations or title path
  const titlePath = (result as unknown as { titlePath?: () => string[] })?.titlePath?.() ?? [];
  for (const seg of titlePath) {
    const m = seg.match(/chromium|firefox|webkit/i);
    if (m) return m[0].toLowerCase();
  }

  // Environment variable fallback
  if (process.env.BROWSER)          return process.env.BROWSER.toLowerCase();
  if (process.env.PLAYWRIGHT_BROWSER) return process.env.PLAYWRIGHT_BROWSER.toLowerCase();
  return null;
}

function groupBySuite(collected: Map<string, TestPayload[]>): SuitePayload[] {
  return Array.from(collected.entries()).map(([file, tests]) => ({
    title: file.split('/').pop() ?? file,
    file,
    tests,
  }));
}

// ── Reporter Class ─────────────────────────────────────

class ActBoardReporter implements Reporter {
  private readonly options: Required<ActBoardOptions>;
  private readonly suitesMap = new Map<string, TestPayload[]>();
  private startTime = Date.now();
  private detectedBrowsers = new Set<string>();

  constructor(options: ActBoardOptions) {
    const apiKey = options.apiKey ?? process.env.ACTBOARD_API_KEY;
    if (!apiKey) {
      throw new Error('[ActBoard] apiKey is required. Set it in the reporter options or via the ACTBOARD_API_KEY environment variable.');
    }
    this.options = {
      serverUrl:     (options.serverUrl ?? process.env.ACTBOARD_SERVER_URL ?? 'http://localhost:3141').replace(/\/$/, ''),
      apiKey,
      project:       options.project ?? process.env.ACTBOARD_PROJECT ?? '',
      branch:        options.branch         ?? process.env.GITHUB_REF_NAME ?? process.env.CI_COMMIT_BRANCH ?? 'local',
      commitSha:     options.commitSha      ?? process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? '',
      commitMessage: options.commitMessage  ?? process.env.CI_COMMIT_MESSAGE ?? '',
      triggeredBy:   options.triggeredBy    ?? (process.env.CI ? 'ci' : 'local'),
      browsers:      options.browsers       ?? [],
      metadata:      options.metadata       ?? {},
      timeout:       options.timeout        ?? 30_000,
      verbose:       options.verbose        ?? true,
    };
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();
    if (this.options.verbose) {
      console.log(`\n  🎭 ActBoard reporter active → ${this.options.serverUrl}\n`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const file = test.location?.file ?? '__unknown__';
    if (!this.suitesMap.has(file)) this.suitesMap.set(file, []);

    // Track browser
    const browser = extractBrowser(result);
    if (browser) this.detectedBrowsers.add(browser);

    // Collapse all retries into one record: status of final attempt
    const status = resolveStatus(result, test);
    const retryCount = test.results.length - 1;

    const err = result.error;
    const testPayload: TestPayload = {
      title:         test.title,
      full_title:    test.titlePath().join(' > '),
      file:          file,
      line:          test.location?.line ?? null,
      status,
      duration_ms:   result.duration,
      retry_count:   retryCount,
      error_message: err?.message?.slice(0, 2000) ?? null,
      error_stack:   err?.stack?.slice(0, 5000)   ?? null,
      browser,
      tags:          test.tags ?? [],
      started_at:    result.startTime?.toISOString() ?? null,
    };

    this.suitesMap.get(file)!.push(testPayload);
  }

  async onEnd(_result: FullResult): Promise<void> {
    const suites = groupBySuite(this.suitesMap);
    if (!suites.length) {
      if (this.options.verbose) console.log('  [ActBoard] No tests collected — skipping publish.');
      return;
    }

    const browsers = this.options.browsers.length > 0
      ? this.options.browsers
      : Array.from(this.detectedBrowsers);

    const payload = {
      branch:         this.options.branch        || null,
      commit_sha:     this.options.commitSha      || null,
      commit_message: this.options.commitMessage  || null,
      triggered_by:   this.options.triggeredBy,
      browsers,
      metadata:       this.options.metadata,
      suites,
    };

    if (this.options.verbose) {
      process.stdout.write(`  [ActBoard] Publishing ${suites.length} suite(s) to ${this.options.serverUrl}… `);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeout);

      const res = await fetch(`${this.options.serverUrl}/api/runs`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        body:   JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const { run } = await res.json() as { run: { id: string; status: string } };

      if (this.options.verbose) {
        console.log(`✓\n  [ActBoard] Run published: ${run.id} (${run.status})`);
        console.log(`  [ActBoard] View at: ${this.options.serverUrl}/\n`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.options.verbose) {
        console.error(`\n  [ActBoard] ⚠  Failed to publish results: ${msg}`);
        console.error('  [ActBoard] Results were NOT saved. Check your serverUrl and apiKey.\n');
      }
    }
  }

  printsToStdio(): boolean {
    return false; // Don't suppress other reporters
  }
}

export default ActBoardReporter;
module.exports = ActBoardReporter;
module.exports.default = ActBoardReporter;
