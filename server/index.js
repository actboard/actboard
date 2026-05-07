/**
 * ActBoard Server — Entry point
 *
 * A self-hostable dashboard server for Playwright test results.
 * Runs on Node.js 18+, uses SQLite (via better-sqlite3), no build step required.
 *
 * Start:  node index.js
 * Dev:    node --watch index.js
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDb } from './db.js';
import runsRouter      from './routes/runs.js';
import analyticsRouter from './routes/analytics.js';
import projectsRouter  from './routes/projects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3141;
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ─────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));

// ── Static dashboard UI ────────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// ── API routes ─────────────────────────────────────────
app.use('/api/runs',      runsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/projects',  projectsRouter);

// Health / version check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});

// SPA fallback — serve dashboard for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ActBoard]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ───────────────────────────────────────────────
function start() {
  initDb();
  app.listen(PORT, HOST, () => {
    console.log(`
  ┌──────────────────────────────────────────┐
  │                                          │
  │   🎭  ActBoard ready                     │
  │                                          │
  │   Dashboard  http://localhost:${PORT}       │
  │   API        http://localhost:${PORT}/api  │
  │                                          │
  │   Docs: https://github.com/your/actboard │
  │                                          │
  └──────────────────────────────────────────┘
`);
  });
}

start();
