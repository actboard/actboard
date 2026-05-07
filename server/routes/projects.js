/**
 * ActBoard — /api/projects routes
 */

import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import { Projects, ApiKeys } from '../db.js';
import { hashKey } from '../middleware/auth.js';

const router = Router();

// ── GET /api/projects ──────────────────────────────────
router.get('/', (req, res) => {
  const projects = Projects.list();
  res.json({ projects });
});

// ── POST /api/projects ─────────────────────────────────
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `proj_${randomBytes(8).toString('hex')}`;

  if (Projects.findBySlug(slug)) {
    return res.status(409).json({ error: `A project with slug "${slug}" already exists` });
  }

  Projects.create({ id, name: name.trim(), slug, base_url: req.body.base_url || null });
  const project = Projects.findById(id);

  // Auto-create an initial API key
  const rawKey = `act_${slug}_${randomBytes(20).toString('hex')}`;
  const keyId  = `key_${randomBytes(8).toString('hex')}`;
  ApiKeys.create({
    id: keyId,
    project_id: id,
    name: 'Default Key',
    key_prefix: rawKey.slice(0, 20),
    key_hash: hashKey(rawKey),
  });

  res.status(201).json({ project, api_key: rawKey });
});

// ── GET /api/projects/:id ──────────────────────────────
router.get('/:id', (req, res) => {
  const project = Projects.findById(req.params.id) || Projects.findBySlug(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

// ── GET /api/projects/:id/keys ─────────────────────────
router.get('/:id/keys', (req, res) => {
  const keys = ApiKeys.findByProjectId(req.params.id);
  res.json({ keys });
});

// ── PATCH /api/projects/:id ────────────────────────────
router.patch('/:id', (req, res) => {
  const project = Projects.findById(req.params.id) || Projects.findBySlug(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, base_url } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  Projects.update(project.id, { name: name.trim(), base_url: base_url || null });
  const updated = Projects.findById(project.id);
  res.json({ project: updated });
});

// ── POST /api/projects/:id/keys ────────────────────────
router.post('/:id/keys', (req, res) => {
  const project = Projects.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const name   = (req.body.name || 'New Key').slice(0, 64);
  const rawKey = `act_${project.slug}_${randomBytes(20).toString('hex')}`;
  const keyId  = `key_${randomBytes(8).toString('hex')}`;

  ApiKeys.create({
    id: keyId,
    project_id: project.id,
    name,
    key_prefix: rawKey.slice(0, 20),
    key_hash: hashKey(rawKey),
  });

  res.status(201).json({ api_key: rawKey, prefix: rawKey.slice(0, 20) });
});

export default router;
