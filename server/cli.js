#!/usr/bin/env node
/**
 * ActBoard CLI entrypoint
 *
 * Usage:
 *   npx actboard-server               # start server on port 3141
 *   npx actboard-server --port 8080   # custom port
 *   npx actboard-server seed          # seed demo data
 *   npx actboard-server seed --clear  # wipe & reseed
 */

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port:    { type: 'string', short: 'p', default: process.env.PORT || '3141' },
    host:    { type: 'string', short: 'h', default: process.env.HOST || '0.0.0.0' },
    data:    { type: 'string', default: process.env.DATA_DIR || join(__dirname, 'data') },
    clear:   { type: 'boolean', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    help:    { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

const command = positionals[0] || 'start';

if (values.version) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pkg = require('./package.json');
  console.log(`actboard-server v${pkg.version}`);
  process.exit(0);
}

if (values.help) {
  console.log(`
  ActBoard — self-hostable Playwright test dashboard

  Usage:
    actboard-server [command] [options]

  Commands:
    start   Start the ActBoard server (default)
    seed    Create a demo project with 30 days of test data

  Options:
    -p, --port <port>   Port to listen on  (default: 3141)
    -h, --host <host>   Bind address        (default: 0.0.0.0)
        --data <dir>    Data directory       (default: ./data)
        --clear         (seed only) Wipe existing data first
    -v, --version       Print version
        --help          Print this help

  Examples:
    npx actboard-server
    npx actboard-server --port 8080
    npx actboard-server seed
    npx actboard-server seed --clear
`);
  process.exit(0);
}

// Apply CLI flags to env before importing the server
process.env.PORT     = values.port;
process.env.HOST     = values.host;
process.env.DATA_DIR = values.data;

if (command === 'seed') {
  // Re-route --clear flag to argv for seed script compat
  if (values.clear) process.argv.push('--clear');
  await import('./scripts/seed.js');
} else {
  // Default: start server
  await import('./index.js');
}
