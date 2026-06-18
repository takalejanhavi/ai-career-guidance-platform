'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { BlockchainService } = require('../services/BlockchainService');
const helpers = require('../utils/contractHelpers');

// ── Environment ───────────────────────────────────────────────────
const {
  PORT             = 3001,
  RPC_URL          = 'http://127.0.0.1:8545',
  PRIVATE_KEY      = null,
  CONTRACT_ADDRESS = null,
  API_SECRET       = '',
  ALLOWED_ORIGINS  = 'http://localhost:4000',
} = process.env;

// ── App factory ───────────────────────────────────────────────────
function createApp(service) {
  const app = express();

  app.use(cors({
    origin:      ALLOWED_ORIGINS.split(','),
    credentials: true,
  }));
  app.use(express.json({ limit: '100kb' }));

  // ── Request timing ────────────────────────────────────────────
  app.use((req, res, next) => {
    req._t0 = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - req._t0;
      res.setHeader('X-Response-Time', `${ms}ms`);
    });
    next();
  });

  // ── Auth guard ────────────────────────────────────────────────
  const authGuard = (req, res, next) => {
    if (!API_SECRET) return next();
    const token = req.headers['x-api-key'] || req.headers['x-internal-token'];
    if (token !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    }
    next();
  };

  // ── Error wrapper ─────────────────────────────────────────────
  const wrap = fn => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      const message = helpers.decodeContractError(err);
      const status  = _errorStatus(message);
      res.status(status).json({ success: false, error: message, code: err.code });
    }
  };

  // ══════════════════════════════════════════════════════════════
  // Health
  // ══════════════════════════════════════════════════════════════

  app.get('/health', wrap(async (req, res) => {
    const info = await service.getInfo();
    res.json({ success: true, status: 'ok', ...info });
  }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // ══════════════════════════════════════════════════════════════
  // Report endpoints
  // ══════════════════════════════════════════════════════════════

  /**
   * POST /reports/register
   * Register a new report hash on-chain.
   *
   * Body: { reportId, pdfHash, studentId, metadataURI? }
   */
  app.post('/reports/register', authGuard, wrap(async (req, res) => {
    const { reportId, pdfHash, studentId, metadataURI = '' } = req.body;

    if (!reportId)  return res.status(400).json({ success: false, error: 'reportId is required' });
    if (!pdfHash)   return res.status(400).json({ success: false, error: 'pdfHash is required' });
    if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });

    const result = await service.registerReport({ reportId, pdfHash, studentId, metadataURI });
    res.status(201).json({ success: true, data: result });
  }));

  /**
   * PATCH /reports/:reportId/hash
   * Update the hash of an existing report.
   *
   * Body: { newPdfHash }
   */
  app.patch('/reports/:reportId/hash', authGuard, wrap(async (req, res) => {
    const { newPdfHash } = req.body;
    if (!newPdfHash) return res.status(400).json({ success: false, error: 'newPdfHash is required' });

    const result = await service.updateReportHash(req.params.reportId, newPdfHash);
    res.json({ success: true, data: result });
  }));

  /**
   * DELETE /reports/:reportId
   * Revoke a report on-chain.
   */
  app.delete('/reports/:reportId', authGuard, wrap(async (req, res) => {
    const result = await service.revokeReport(req.params.reportId);
    res.json({ success: true, data: result });
  }));

  /**
   * GET /reports/:reportId
   * Get the on-chain report record.
   */
  app.get('/reports/:reportId', wrap(async (req, res) => {
    const report = await service.getReport(req.params.reportId);
    res.json({ success: true, data: report });
  }));

  // ══════════════════════════════════════════════════════════════
  // Verification endpoints
  // ══════════════════════════════════════════════════════════════

  /**
   * POST /verify
   * Verify a PDF hash against the on-chain record.
   *
   * Body: { reportId, pdfHash }
   */
  app.post('/verify', wrap(async (req, res) => {
    const { reportId, pdfHash } = req.body;
    if (!reportId) return res.status(400).json({ success: false, error: 'reportId is required' });
    if (!pdfHash)  return res.status(400).json({ success: false, error: 'pdfHash is required' });

    const result = await service.verifyIntegrity(reportId, pdfHash);
    res.json({ success: true, data: result });
  }));

  /**
   * GET /verify/:reportId?hash=<sha256hex>
   * Verify via GET (for public verification links / QR codes).
   */
  app.get('/verify/:reportId', wrap(async (req, res) => {
    const { hash } = req.query;
    if (!hash) return res.status(400).json({ success: false, error: 'hash query param required' });

    const result = await service.verifyIntegrity(req.params.reportId, hash);
    res.json({ success: true, data: result });
  }));

  // ══════════════════════════════════════════════════════════════
  // Access control endpoints
  // ══════════════════════════════════════════════════════════════

  /**
   * POST /reports/:reportId/access
   * Grant access to a grantee.
   *
   * Body: { grantee, permissions, expiresAt? }
   */
  app.post('/reports/:reportId/access', authGuard, wrap(async (req, res) => {
    const { grantee, permissions = ['view'], expiresAt = null } = req.body;
    if (!grantee) return res.status(400).json({ success: false, error: 'grantee address is required' });

    const result = await service.grantAccess({
      reportId:    req.params.reportId,
      grantee,
      permissions,
      expiresAt,
    });
    res.status(201).json({ success: true, data: result });
  }));

  /**
   * DELETE /reports/:reportId/access/:grantee
   * Revoke access for a grantee.
   */
  app.delete('/reports/:reportId/access/:grantee', authGuard, wrap(async (req, res) => {
    const result = await service.revokeAccess(req.params.reportId, req.params.grantee);
    res.json({ success: true, data: result });
  }));

  /**
   * PATCH /reports/:reportId/access/:grantee
   * Update permissions for a grantee.
   *
   * Body: { permissions } or { expiresAt }
   */
  app.patch('/reports/:reportId/access/:grantee', authGuard, wrap(async (req, res) => {
    const { permissions, expiresAt } = req.body;
    let result;

    if (permissions) {
      result = await service.updatePermissions(req.params.reportId, req.params.grantee, permissions);
    } else if (expiresAt !== undefined) {
      result = await service.renewAccess(req.params.reportId, req.params.grantee, expiresAt);
    } else {
      return res.status(400).json({ success: false, error: 'Provide permissions or expiresAt' });
    }
    res.json({ success: true, data: result });
  }));

  /**
   * GET /reports/:reportId/access
   * List all access grants for a report.
   */
  app.get('/reports/:reportId/access', authGuard, wrap(async (req, res) => {
    const grants = await service.getAllGrants(req.params.reportId);
    res.json({ success: true, data: { grants, count: grants.length } });
  }));

  /**
   * GET /reports/:reportId/access/:grantee
   * Check if a specific address has access (public endpoint).
   */
  app.get('/reports/:reportId/access/:grantee', wrap(async (req, res) => {
    const { permission = 'view' } = req.query;
    const [hasAccess, grant] = await Promise.all([
      service.hasAccess(req.params.reportId, req.params.grantee, permission),
      service.getGrant(req.params.reportId, req.params.grantee).catch(() => null),
    ]);
    res.json({ success: true, data: { hasAccess, permission, grant } });
  }));

  // ══════════════════════════════════════════════════════════════
  // Utility endpoints
  // ══════════════════════════════════════════════════════════════

  /**
   * POST /encode/report-id
   * Encode a UUID into a bytes32 reportId.
   *
   * Body: { uuid }
   */
  app.post('/encode/report-id', (req, res) => {
    const { uuid } = req.body;
    if (!uuid) return res.status(400).json({ success: false, error: 'uuid is required' });
    res.json({ success: true, data: { uuid, reportId: helpers.encodeReportId(uuid) } });
  });

  /**
   * POST /encode/hash
   * Encode/validate a SHA-256 hex string as bytes32.
   *
   * Body: { hash }
   */
  app.post('/encode/hash', (req, res) => {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ success: false, error: 'hash is required' });
    try {
      res.json({ success: true, data: { input: hash, bytes32: helpers.encodeHash(hash) } });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  /**
   * GET /info
   * Get blockchain connection info.
   */
  app.get('/info', wrap(async (req, res) => {
    const info = await service.getInfo();
    res.json({ success: true, data: info });
  }));

  // ── 404 ───────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
  });

  return app;
}

// ── Error status mapping ──────────────────────────────────────────
function _errorStatus(msg) {
  if (!msg) return 500;
  const m = msg.toLowerCase();
  if (m.includes('not found'))        return 404;
  if (m.includes('already exists'))   return 409;
  if (m.includes('not the owner'))    return 403;
  if (m.includes('not granted'))      return 403;
  if (m.includes('paused'))           return 503;
  if (m.includes('zero address'))     return 400;
  if (m.includes('invalid'))          return 400;
  return 500;
}

// ── Start server ──────────────────────────────────────────────────
async function startServer() {
  if (!CONTRACT_ADDRESS) {
    console.error('ERROR: CONTRACT_ADDRESS env var is required');
    process.exit(1);
  }

  const service = new BlockchainService({
    rpcUrl:          RPC_URL,
    privateKey:      PRIVATE_KEY || null,
    contractAddress: CONTRACT_ADDRESS,
  });

  await service.connect();
  const info = await service.getInfo();
  console.log(`\n✓ Connected to chain ${info.chainId} at block ${info.blockNumber}`);
  console.log(`  Contract  : ${CONTRACT_ADDRESS}`);
  console.log(`  Signer    : ${info.signerAddress || '(read-only)'}\n`);

  const app = createApp(service);
  app.listen(PORT, () => {
    console.log(`🔗 Blockchain API running on port ${PORT}`);
  });
}

module.exports = { createApp };
if (require.main === module) startServer().catch(console.error);
