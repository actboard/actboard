/**
 * ActBoard — SQLite database layer
 * Uses better-sqlite3 (synchronous, zero-config, embedded)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'actboard.db');

let db;

export function getDb() {
  return db;
}

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');  // Better concurrent read performance
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      base_url    TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      key_prefix  TEXT NOT NULL,
      key_hash    TEXT NOT NULL,
      last_used_at INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS runs (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      branch          TEXT,
      commit_sha      TEXT,
      commit_message  TEXT,
      triggered_by    TEXT DEFAULT 'api',
      status          TEXT NOT NULL DEFAULT 'running',
      total_tests     INTEGER DEFAULT 0,
      passed_tests    INTEGER DEFAULT 0,
      failed_tests    INTEGER DEFAULT 0,
      flaky_tests     INTEGER DEFAULT 0,
      skipped_tests   INTEGER DEFAULT 0,
      duration_ms     INTEGER,
      browsers        TEXT DEFAULT '[]',
      started_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at     INTEGER,
      metadata        TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS suites (
      id            TEXT PRIMARY KEY,
      run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      file          TEXT,
      total_tests   INTEGER DEFAULT 0,
      passed_tests  INTEGER DEFAULT 0,
      failed_tests  INTEGER DEFAULT 0,
      flaky_tests   INTEGER DEFAULT 0,
      duration_ms   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tests (
      id              TEXT PRIMARY KEY,
      run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      suite_id        TEXT REFERENCES suites(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      full_title      TEXT,
      file            TEXT,
      line            INTEGER,
      status          TEXT NOT NULL,
      duration_ms     INTEGER DEFAULT 0,
      retry_count     INTEGER DEFAULT 0,
      error_message   TEXT,
      error_stack     TEXT,
      browser         TEXT,
      tags            TEXT DEFAULT '[]',
      started_at      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_runs_project_id   ON runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_started_at   ON runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_status        ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_branch        ON runs(branch);
    CREATE INDEX IF NOT EXISTS idx_tests_run_id       ON tests(run_id);
    CREATE INDEX IF NOT EXISTS idx_suites_run_id      ON suites(run_id);
  `);

  console.log(`  ✓ Database ready at ${DB_PATH}`);
  return db;
}

// ── Project queries ────────────────────────────────────

export const Projects = {
  create({ id, name, slug, base_url }) {
    return db.prepare(`
      INSERT INTO projects (id, name, slug, base_url)
      VALUES (@id, @name, @slug, @base_url)
    `).run({ id, name, slug, base_url });
  },

  list() {
    return db.prepare(`
      SELECT p.*,
             COUNT(r.id)         AS total_runs,
             MAX(r.started_at)   AS last_run_at
      FROM   projects p
      LEFT JOIN runs r ON r.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();
  },

  update(id, { name, base_url }) {
    return db.prepare(`
      UPDATE projects SET name = @name, base_url = @base_url WHERE id = @id
    `).run({ id, name, base_url });
  },

  findById(id) {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  },

  findBySlug(slug) {
    return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
  },
};

// ── API Key queries ────────────────────────────────────

export const ApiKeys = {
  create({ id, project_id, name, key_prefix, key_hash }) {
    return db.prepare(`
      INSERT INTO api_keys (id, project_id, name, key_prefix, key_hash)
      VALUES (@id, @project_id, @name, @key_prefix, @key_hash)
    `).run({ id, project_id, name, key_prefix, key_hash });
  },

  findByProjectId(project_id) {
    return db.prepare(`
      SELECT id, project_id, name, key_prefix, last_used_at, created_at
      FROM api_keys WHERE project_id = ?
    `).all(project_id);
  },

  findByHash(key_hash) {
    return db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(key_hash);
  },

  touch(id) {
    db.prepare('UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?').run(id);
  },
};

// ── Run queries ────────────────────────────────────────

export const Runs = {
  create({ id, project_id, branch, commit_sha, commit_message, triggered_by, browsers, metadata }) {
    return db.prepare(`
      INSERT INTO runs (id, project_id, branch, commit_sha, commit_message, triggered_by, browsers, metadata)
      VALUES (@id, @project_id, @branch, @commit_sha, @commit_message, @triggered_by, @browsers, @metadata)
    `).run({
      id, project_id,
      branch: branch || null,
      commit_sha: commit_sha || null,
      commit_message: commit_message || null,
      triggered_by: triggered_by || 'api',
      browsers: JSON.stringify(browsers || []),
      metadata: JSON.stringify(metadata || {}),
    });
  },

  finalize(id, { status, total_tests, passed_tests, failed_tests, flaky_tests, skipped_tests, duration_ms }) {
    return db.prepare(`
      UPDATE runs SET
        status        = @status,
        total_tests   = @total_tests,
        passed_tests  = @passed_tests,
        failed_tests  = @failed_tests,
        flaky_tests   = @flaky_tests,
        skipped_tests = @skipped_tests,
        duration_ms   = @duration_ms,
        finished_at   = unixepoch()
      WHERE id = @id
    `).run({ id, status, total_tests, passed_tests, failed_tests, flaky_tests, skipped_tests, duration_ms });
  },

  list({ project_id, status, branch, browser, limit = 50, offset = 0 }) {
    const where = ['r.project_id = @project_id'];
    const params = { project_id, limit: Number(limit), offset: Number(offset) };

    if (status)  { where.push("r.status = @status");   params.status = status; }
    if (branch)  { where.push("r.branch = @branch");   params.branch = branch; }
    if (browser) { where.push("r.browsers LIKE @browser"); params.browser = `%${browser}%`; }

    return db.prepare(`
      SELECT r.*
      FROM   runs r
      WHERE  ${where.join(' AND ')}
      ORDER  BY r.started_at DESC
      LIMIT  @limit OFFSET @offset
    `).all(params);
  },

  count({ project_id, status, branch, browser }) {
    const where = ['project_id = @project_id'];
    const params = { project_id };
    if (status)  { where.push('status = @status');        params.status = status; }
    if (branch)  { where.push('branch = @branch');        params.branch = branch; }
    if (browser) { where.push('browsers LIKE @browser');  params.browser = `%${browser}%`; }
    return db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE ${where.join(' AND ')}`).get(params).n;
  },

  findById(id) {
    return db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  },

  delete(id) {
    db.prepare('DELETE FROM runs WHERE id = ?').run(id);
  },
};

// ── Suite + Test queries ───────────────────────────────

export const Suites = {
  bulkInsert(suites) {
    const stmt = db.prepare(`
      INSERT INTO suites (id, run_id, title, file, total_tests, passed_tests, failed_tests, flaky_tests, duration_ms)
      VALUES (@id, @run_id, @title, @file, @total_tests, @passed_tests, @failed_tests, @flaky_tests, @duration_ms)
    `);
    const run = db.transaction(() => suites.forEach(s => stmt.run(s)));
    run();
  },

  forRun(run_id) {
    return db.prepare('SELECT * FROM suites WHERE run_id = ? ORDER BY rowid').all(run_id);
  },
};

export const Tests = {
  bulkInsert(tests) {
    const stmt = db.prepare(`
      INSERT INTO tests (id, run_id, suite_id, title, full_title, file, line, status, duration_ms, retry_count, error_message, error_stack, browser, tags, started_at)
      VALUES (@id, @run_id, @suite_id, @title, @full_title, @file, @line, @status, @duration_ms, @retry_count, @error_message, @error_stack, @browser, @tags, @started_at)
    `);
    const run = db.transaction(() => tests.forEach(t => stmt.run(t)));
    run();
  },

  forRun(run_id) {
    return db.prepare('SELECT * FROM tests WHERE run_id = ? ORDER BY suite_id, rowid').all(run_id);
  },

  forSuite(suite_id) {
    return db.prepare('SELECT * FROM tests WHERE suite_id = ? ORDER BY rowid').all(suite_id);
  },

  // Flaky tests: tests that have retry_count > 0 and eventually passed
  flakyByProject(project_id, days = 30) {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    return db.prepare(`
      SELECT
        t.title,
        t.file,
        COUNT(*)                                           AS total_occurrences,
        SUM(CASE WHEN t.retry_count > 0 THEN 1 ELSE 0 END) AS flaky_count,
        ROUND(
          100.0 * SUM(CASE WHEN t.retry_count > 0 THEN 1 ELSE 0 END) / COUNT(*), 1
        ) AS flake_rate
      FROM tests t
      JOIN runs r ON r.id = t.run_id
      WHERE r.project_id = @project_id
        AND r.started_at >= @since
        AND t.status IN ('passed', 'flaky')
      GROUP BY t.title, t.file
      HAVING flaky_count > 0
      ORDER BY flaky_count DESC
      LIMIT 10
    `).all({ project_id, since });
  },

  // Daily pass rate for analytics
  dailyStats(project_id, days = 30) {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    return db.prepare(`
      SELECT
        DATE(r.started_at, 'unixepoch') AS date,
        COUNT(*)                           AS total,
        SUM(CASE WHEN t.status = 'passed' THEN 1 ELSE 0 END) AS passed,
        AVG(t.duration_ms)                AS avg_duration_ms
      FROM tests t
      JOIN runs r ON r.id = t.run_id
      WHERE r.project_id = @project_id
        AND r.started_at >= @since
      GROUP BY date
      ORDER BY date ASC
    `).all({ project_id, since });
  },

  browserBreakdown(project_id, days = 30) {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    return db.prepare(`
      SELECT
        t.browser,
        COUNT(*) AS total
      FROM tests t
      JOIN runs r ON r.id = t.run_id
      WHERE r.project_id = @project_id
        AND r.started_at >= @since
        AND t.browser IS NOT NULL
      GROUP BY t.browser
      ORDER BY total DESC
    `).all({ project_id, since });
  },
};
