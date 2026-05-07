/**
 * ActBoard — /api/analytics routes
 *
 * GET /api/analytics/summary   — Overall KPIs for a project
 * GET /api/analytics/trend     — Daily pass rate over N days
 * GET /api/analytics/flaky     — Top flaky tests
 * GET /api/analytics/browsers  — Browser breakdown
 */

import { Router } from 'express';
import { getDb, Tests, Runs } from '../db.js';

const router = Router();

// ── GET /api/analytics/summary ────────────────────────
router.get('/summary', (req, res) => {
  const { project_id, days = 30 } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const since = Math.floor(Date.now() / 1000) - Number(days) * 86400;
  const db = getDb();

  const overview = db.prepare(`
    SELECT
      COUNT(*)                                              AS total_runs,
      SUM(total_tests)                                      AS total_tests,
      SUM(passed_tests)                                     AS passed_tests,
      SUM(failed_tests)                                     AS failed_tests,
      SUM(flaky_tests)                                      AS flaky_tests,
      SUM(skipped_tests)                                    AS skipped_tests,
      AVG(duration_ms)                                      AS avg_duration_ms,
      ROUND(100.0 * SUM(passed_tests) / MAX(SUM(total_tests), 1), 1) AS pass_rate,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)  AS failed_runs,
      SUM(CASE WHEN status = 'flaky'  THEN 1 ELSE 0 END)  AS flaky_runs
    FROM runs
    WHERE project_id = @project_id AND started_at >= @since
  `).get({ project_id, since });

  // Distinct branches
  const branches = db.prepare(`
    SELECT DISTINCT branch FROM runs
    WHERE project_id = ? AND branch IS NOT NULL
    ORDER BY branch
  `).all(project_id).map(r => r.branch);

  res.json({ ...overview, branches });
});

// ── GET /api/analytics/trend ──────────────────────────
router.get('/trend', (req, res) => {
  const { project_id, days = 30 } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const rows = Tests.dailyStats(project_id, Number(days));
  const trend = rows.map(r => ({
    date: r.date,
    total: r.total,
    passed: r.passed,
    pass_rate: r.total > 0 ? Math.round((r.passed / r.total) * 1000) / 10 : 0,
    avg_duration_ms: Math.round(r.avg_duration_ms || 0),
  }));

  // Also grab run-level duration averages per day
  const since = Math.floor(Date.now() / 1000) - Number(days) * 86400;
  const runDurations = getDb().prepare(`
    SELECT DATE(started_at, 'unixepoch') AS date, AVG(duration_ms) AS avg_ms
    FROM runs
    WHERE project_id = ? AND started_at >= ?
    GROUP BY date ORDER BY date
  `).all(project_id, since);

  res.json({ trend, run_durations: runDurations });
});

// ── GET /api/analytics/flaky ──────────────────────────
router.get('/flaky', (req, res) => {
  const { project_id, days = 30 } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const flaky = Tests.flakyByProject(project_id, Number(days));
  res.json({ flaky });
});

// ── GET /api/analytics/browsers ───────────────────────
router.get('/browsers', (req, res) => {
  const { project_id, days = 30 } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const breakdown = Tests.browserBreakdown(project_id, Number(days));
  const total = breakdown.reduce((sum, r) => sum + r.total, 0);
  const result = breakdown.map(r => ({
    browser: r.browser,
    total: r.total,
    pct: total > 0 ? Math.round((r.total / total) * 1000) / 10 : 0,
  }));

  res.json({ browsers: result });
});

export default router;
