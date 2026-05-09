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
import compression from 'compression';
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
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));

// Simple rate limiter per API key
const requestLog = new Map();
app.use((req, res, next) => {
  if (req.projectId || req.path.startsWith('/api/runs')) {
    const key = req.projectId || req.ip;
    const now = Date.now();
    const requests = requestLog.get(key) || [];
    const recentRequests = requests.filter(t => now - t < 60000); // 1 minute window
    
    if (recentRequests.length > 1000) { // Allow 1000 req/min per key
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    recentRequests.push(now);
    requestLog.set(key, recentRequests);
    
    // Cleanup old entries
    if (requestLog.size > 10000) requestLog.clear();
  }
  next();
});

// ── Static dashboard UI ────────────────────────────────
app.use(express.static(join(__dirname, 'public')));

// ── API routes ─────────────────────────────────────────
app.use('/api/runs',      runsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/projects',  projectsRouter);



// Health / version check (for AWS ALB and ECS)
app.get('/health', (_req, res) => {
  console.log('[Health] /health endpoint hit');
  res.status(200).json({ status: 'ok' });
});

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
