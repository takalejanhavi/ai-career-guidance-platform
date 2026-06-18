'use strict';

const { z }      = require('zod');
const router     = require('express').Router();
const ctrl       = require('./report.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize }    = require('../../middleware/rbac.middleware');
const { validate, idParamSchema, paginationSchema } = require('../../middleware/validate');
const { pdfLimiter }   = require('../../middleware/rateLimiter');

const visibilitySchema  = z.object({ visibility: z.enum(['private','shared','public']) });
const annotationSchema  = z.object({ content: z.string().min(1).max(5000), isPrivate: z.boolean().default(true) });
const verifyQuerySchema = z.object({ hash: z.string().length(64) });

router.use(authenticate);

// ── Report CRUD ───────────────────────────────────────────────────────────────
router.get ('/my',              validate(paginationSchema, 'query'),  ctrl.getMyReports);
router.get ('/:id',             validate(idParamSchema, 'params'),    ctrl.getReport);
router.patch('/:id/visibility', validate(idParamSchema, 'params'), validate(visibilitySchema), ctrl.updateVisibility);
router.get ('/:id/pdf',         validate(idParamSchema, 'params'),    ctrl.getPdfUrl);
router.post('/:id/pdf/regenerate', pdfLimiter, validate(idParamSchema, 'params'), ctrl.regeneratePdf);
router.post('/:id/annotations', validate(idParamSchema, 'params'), validate(annotationSchema), ctrl.addAnnotation);
router.delete('/:id',           validate(idParamSchema, 'params'),    ctrl.deleteReport);

// ── Blockchain ────────────────────────────────────────────────────────────────
// POST /:id/anchor     — queue report for on-chain anchoring (student only)
router.post('/:id/anchor',
  pdfLimiter,
  validate(idParamSchema, 'params'),
  authorize('student'),
  ctrl.initiateBlockchainAnchor
);

// GET /:id/verify?hash=<sha256hex>  — verify PDF integrity against on-chain record
router.get('/:id/verify',
  validate(idParamSchema, 'params'),
  validate(verifyQuerySchema, 'query'),
  ctrl.verifyBlockchain
);

// GET /:id/chain       — fetch the raw on-chain record (read-only, any authenticated user)
router.get('/:id/chain',
  validate(idParamSchema, 'params'),
  ctrl.getOnChainRecord
);

// DELETE /:id/chain    — revoke the report on-chain (admin only, irreversible)
router.delete('/:id/chain',
  validate(idParamSchema, 'params'),
  authorize('admin'),
  ctrl.revokeOnChain
);

module.exports = router;
