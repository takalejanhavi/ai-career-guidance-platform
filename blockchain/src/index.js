'use strict';

/**
 * career-guidance-blockchain
 * ===========================
 * Public API for integrating the blockchain layer into the Node.js backend.
 *
 * Usage:
 *   const { BlockchainService, PERMISSIONS, encodeReportId } = require('./src');
 *
 *   const chain = new BlockchainService({
 *     rpcUrl:          process.env.BLOCKCHAIN_RPC_URL,
 *     privateKey:      process.env.BLOCKCHAIN_PRIVATE_KEY,
 *     contractAddress: process.env.CONTRACT_ADDRESS,
 *   });
 *   await chain.connect();
 *
 *   // Anchor a report
 *   const result = await chain.registerReport({
 *     reportId:  'RPT-2024-77341',
 *     pdfHash:   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
 *     studentId: 'STU-2024-10482',
 *   });
 */

const { BlockchainService } = require('./services/BlockchainService');
const helpers               = require('./utils/contractHelpers');

module.exports = {
  BlockchainService,

  // Re-export commonly used helpers
  encodeReportId:     helpers.encodeReportId,
  encodeHash:         helpers.encodeHash,
  hashTobytes32:      helpers.hashTobytes32,
  encodeStudentId:    helpers.encodeStudentId,
  PERMISSIONS:        helpers.PERMISSIONS,
  grantStatus:        helpers.grantStatus,
  serializeReport:    helpers.serializeReport,
  serializeGrant:     helpers.serializeGrant,
  decodeContractError:helpers.decodeContractError,
};
