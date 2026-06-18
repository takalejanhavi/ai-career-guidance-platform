'use strict';

const service    = require('./report.service');
const { success, created, noContent, paginated } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

// ── Existing handlers (unchanged) ────────────────────────────────────────────

const getMyReports = catchAsync(async (req, res) => {
  const result = await service.getMyReports(req.user._id, req.query);
  paginated(res, result.data, result);
});

const getReport = catchAsync(async (req, res) => {
  const report = await service.getReport(req.params.id, req.user);
  success(res, { report });
});

const updateVisibility = catchAsync(async (req, res) => {
  const report = await service.updateVisibility(req.params.id, req.user._id, req.body.visibility);
  success(res, { report });
});

const getPdfUrl = catchAsync(async (req, res) => {
  const url = await service.getPdfUrl(req.params.id, req.user);
  success(res, { url });
});

const addAnnotation = catchAsync(async (req, res) => {
  const annotation = await service.addAnnotation(req.params.id, req.user._id, req.body);
  created(res, { annotation });
});

const deleteReport = catchAsync(async (req, res) => {
  await service.deleteReport(req.params.id, req.user._id, req.user.role);
  noContent(res);
});

// ── Blockchain handlers ───────────────────────────────────────────────────────

/**
 * POST /reports/:id/anchor
 *
 * Queues the report for on-chain anchoring. Only the report owner (student)
 * can initiate anchoring. The actual transaction is executed asynchronously
 * by the anchor-report Bull worker.
 *
 * Returns 200 with the report document showing blockchain.status = 'pending'.
 */
const initiateBlockchainAnchor = catchAsync(async (req, res) => {
  const report = await service.initiateBlockchainAnchor(req.params.id, req.user._id);
  success(res, { report }, { message: 'Blockchain anchoring initiated — transaction will confirm shortly' });
});

/**
 * GET /reports/:id/verify?hash=<sha256hex>
 *
 * Verifies a PDF hash against the live on-chain record.
 * Calls verifyIntegrity() on the smart contract directly — does not rely
 * on MongoDB status alone, so a tampered record is detected correctly.
 *
 * Query param:
 *   hash  — 64-character lowercase hex SHA-256 of the PDF file
 *
 * Returns:
 *   verified     {boolean}  true only if the contract returns true
 *   onChain      {boolean}  same as verified (on-chain check result)
 *   hashMatch    {boolean}  whether the provided hash matches the DB record
 *   onChainRecord {object}  raw record from the contract (null if not anchored)
 *   txHash, blockNumber, confirmedAt, network  — from the DB record
 */
const verifyBlockchain = catchAsync(async (req, res) => {
  const result = await service.verifyBlockchain(req.params.id, req.query.hash);
  success(res, result);
});

/**
 * GET /reports/:id/chain
 *
 * Returns the raw on-chain record for a report without modifying anything.
 * Returns null data if the report has never been anchored.
 *
 * Useful for the frontend to independently display the on-chain state
 * and for debugging anchoring issues.
 */
const getOnChainRecord = catchAsync(async (req, res) => {
  const record = await service.getOnChainRecord(req.params.id);
  success(res, { onChainRecord: record, anchored: record !== null });
});

/**
 * DELETE /reports/:id/chain
 *
 * Revokes the report on-chain. Admin only. Irreversible.
 *
 * After this call, verifyIntegrity() will return false permanently even if
 * the PDF hash still matches the stored value. Used when a report is
 * found to be fraudulent or must be invalidated for legal reasons.
 *
 * Also updates the MongoDB blockchain.status to 'failed' with a reason
 * so the UI reflects the revocation.
 */
const revokeOnChain = catchAsync(async (req, res) => {
  const result = await service.revokeOnChain(req.params.id, req.user._id);
  success(res, result, { message: 'Report revoked on-chain' });
});

/**
 * POST /reports/:id/pdf/regenerate
 *
 * Re-queues PDF generation for an existing report. Owner only.
 * Useful after a psychologist adds annotations, since the PDF
 * psychologist-notes page is only populated at generation time.
 *
 * Returns 202 — generation is asynchronous via the generate-pdf worker.
 */
const regeneratePdf = catchAsync(async (req, res) => {
  const report = await service.regeneratePdf(req.params.id, req.user._id);
  res.status(202).json({
    success: true,
    data: { report },
    message: 'PDF regeneration queued',
  });
});

module.exports = {
  getMyReports,
  getReport,
  updateVisibility,
  getPdfUrl,
  addAnnotation,
  regeneratePdf,
  deleteReport,
  initiateBlockchainAnchor,
  verifyBlockchain,
  getOnChainRecord,
  revokeOnChain,
};
