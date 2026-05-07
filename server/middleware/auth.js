/**
 * ActBoard — API key authentication middleware
 *
 * Keys are passed as:  Authorization: Bearer act_<project_slug>_<random>
 * The key is hashed (SHA-256) before storage. We never store the raw key.
 */

import { createHash } from 'crypto';
import { ApiKeys } from '../db.js';

/**
 * Hash an API key for safe storage/comparison
 */
export function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * requireApiKey middleware — attaches req.apiKey and req.project to the request.
 * Pass `optional = true` to allow unauthenticated requests (for read-only endpoints
 * that are also accessible via the dashboard without a key).
 */
export function requireApiKey({ optional = false } = {}) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      if (optional) return next();
      return res.status(401).json({ error: 'Missing Authorization header. Use: Bearer <api-key>' });
    }

    const hash = hashKey(token);
    const keyRecord = ApiKeys.findByHash(hash);

    if (!keyRecord) {
      if (optional) return next();
      return res.status(401).json({ error: 'Invalid API key' });
    }

    ApiKeys.touch(keyRecord.id);
    req.apiKey = keyRecord;
    req.projectId = keyRecord.project_id;
    next();
  };
}
