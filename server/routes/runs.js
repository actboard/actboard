/**
 * ActBoard — /api/runs routes
 *
 * POST /api/runs          — Reporter publishes a complete run (requires API key)
 * GET  /api/runs          — List runs (optionally filtered)
 * GET  /api/runs/:id      — Get run detail with suites + tests
 * DELETE /api/runs/:id    — Delete a run
 */

import { Router } from 'express';
import { randomBytes } from 'crypto';
import { Runs, Suites, Tests, Projects } from '../db.js';
import { requireApiKey } from '../middleware/auth.js';

const router = Router();

// ── POST /api/runs (reporter publishes results) ────────
router.post('/', requireApiKey(), (req, res) => {
  const { branch, commit_sha, commit_message, triggered_by, browsers, suites: suitesPayload, metadata } = req.body;

  if (!suitesPayload || !Array.isArray(suitesPayload)) {
    return res.status(400).json({ error: 'suites array is required' });
  }

  const project_id = req.projectId;
  const project = Projects.findById(project_id);
  if (!project) return res.status(400).json({ error: 'Project not found for this API key' });

  // Build run stats from suites payload
  let total = 0, passed = 0, failed = 0, flaky = 0, skipped = 0, duration = 0;
  const allTests = [];

  const runId = `run_${randomBytes(10).toString('hex')}`;
  const suiteRows = [];

  for (const suite of suitesPayload) {
    const suiteId = `suite_${randomBytes(8).toString('hex')}`;
    let sTotal = 0, sPassed = 0, sFailed = 0, sFlaky = 0, sDuration = 0;

    const tests = suite.tests || [];
    for (const t of tests) {
      sTotal++;
      if (t.status === 'passed') sPassed++;
      else if (t.status === 'failed') sFailed++;
      else if (t.status === 'flaky')  sFlaky++;
      else if (t.status === 'skipped') skipped++;
      sDuration += t.duration_ms || 0;

      allTests.push({
        id:            `test_${randomBytes(8).toString('hex')}`,
        run_id:        runId,
        suite_id:      suiteId,
        title:         t.title || '(untitled)',
        full_title:    t.full_title || null,
        file:          t.file || suite.file || null,
        line:          t.line || null,
        status:        t.status,
        duration_ms:   t.duration_ms || 0,
        retry_count:   t.retry_count || 0,
        error_message: t.error_message || null,
        error_stack:   t.error_stack   || null,
        browser:       t.browser || (Array.isArray(browsers) ? browsers[0] : null),
        tags:          JSON.stringify(t.tags || []),
        started_at:    t.started_at ? Math.floor(new Date(t.started_at).getTime() / 1000) : null,
      });
    }

    total    += sTotal;
    passed   += sPassed;
    failed   += sFailed;
    flaky    += sFlaky;
    duration += sDuration;

    suiteRows.push({
      id:           suiteId,
      run_id:       runId,
      title:        suite.title || suite.file || '(unnamed suite)',
      file:         suite.file || null,
      total_tests:  sTotal,
      passed_tests: sPassed,
      failed_tests: sFailed,
      flaky_tests:  sFlaky,
      duration_ms:  sDuration,
    });
  }

  // Determine overall status
  let status = 'passed';
  if (failed > 0) status = 'failed';
  else if (flaky > 0) status = 'flaky';

  // Create run, suites, tests in one transaction
  Runs.create({
    id: runId, project_id, branch, commit_sha, commit_message,
    triggered_by, browsers, metadata,
  });
  if (suiteRows.length) Suites.bulkInsert(suiteRows);
  if (allTests.length)  Tests.bulkInsert(allTests);
  Runs.finalize(runId, { status, total_tests: total, passed_tests: passed, failed_tests: failed, flaky_tests: flaky, skipped_tests: skipped, duration_ms: duration });

  const run = Runs.findById(runId);
  res.status(201).json({ run });
});

// ── GET /api/runs ──────────────────────────────────────
router.get('/', (req, res) => {
  const { project_id, status, branch, browser, limit = 50, offset = 0 } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id query param is required' });

  const total = Runs.count({ project_id, status, branch, browser });
  const runs  = Runs.list({ project_id, status, branch, browser, limit, offset });

  // Parse JSON fields
  const parsed = runs.map(r => ({
    ...r,
    browsers: safeJSON(r.browsers, []),
    metadata: safeJSON(r.metadata, {}),
  }));

  res.json({ runs: parsed, total, limit: Number(limit), offset: Number(offset) });
});

// ── GET /api/runs/:id ──────────────────────────────────
router.get('/:id', (req, res) => {
  const run = Runs.findById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const { limit = 1000, offset = 0 } = req.query;
  const limitNum = Math.min(Number(limit) || 1000, 5000);
  const offsetNum = Number(offset) || 0;

  const suites = Suites.forRun(run.id);
  const tests  = Tests.forRun(run.id, limitNum, offsetNum);

  // Group tests by suite
  const testsBySuite = {};
  for (const t of tests) {
    const sid = t.suite_id || '__unsorted__';
    if (!testsBySuite[sid]) testsBySuite[sid] = [];
    testsBySuite[sid].push({ ...t, tags: safeJSON(t.tags, []) });
  }

  const suitesWithTests = suites.map(s => ({
    ...s,
    tests: testsBySuite[s.id] || [],
  }));

  res.json({
    run: {
      ...run,
      browsers: safeJSON(run.browsers, []),
      metadata: safeJSON(run.metadata, {}),
    },
    suites: suitesWithTests,
    pagination: { limit: limitNum, offset: offsetNum },
  });
});

// ── DELETE /api/runs/:id ───────────────────────────────
router.delete('/:id', (req, res) => {
  const run = Runs.findById(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  Runs.delete(req.params.id);
  res.json({ ok: true });
});

function safeJSON(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

export default router;
