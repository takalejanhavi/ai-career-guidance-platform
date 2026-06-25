'use strict';

/**
 * blockchain.service.js
 * ======================
 * Backend integration layer for the CareerReport smart contract.
 *
 * Replaces the broken web3.js stub that called non-existent functions
 * (storeHash, verifyHash, getTimestamp). Now uses ethers.js v6 and calls
 * the real contract methods:
 *
 *   registerReport(reportId, pdfHash, studentId, metadataURI)
 *   updateReportHash(reportId, newPdfHash)
 *   verifyIntegrity(reportId, pdfHash) -> bool
 *   revokeReport(reportId)
 *   getReport(reportId) -> Report struct
 *
 * All bytes32 encoding (reportId, pdfHash, studentId) is handled
 * internally so callers work with plain strings.
 *
 * Singleton pattern: provider and signer are initialised once and
 * reused across all calls.
 */

const { ethers } = require('ethers');
const path        = require('path');
const fs          = require('fs');
const env         = require('../config/env');
const logger      = require('../config/logger');

// ── ABI path ───────────────────────────────────────────────────────────────
// Resolve relative to the repo root so this works regardless of CWD.
const ABI_PATH = path.resolve(
  __dirname,
  '../../../blockchain/artifacts/contracts/CareerReport.sol/CareerReport.abi.json'
);

// ── Singletons ─────────────────────────────────────────────────────────────
let _provider  = null;
let _signer    = null;
let _contract  = null;
let _connected = false;

// ── ABI ────────────────────────────────────────────────────────────────────

function _loadAbi() {
  if (fs.existsSync(ABI_PATH)) {
    return JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
  }
  logger.warn('[Blockchain] ABI not found at %s — using embedded minimal ABI', ABI_PATH);
  return MINIMAL_ABI;
}

// ── Connection ─────────────────────────────────────────────────────────────

async function connect() {
  if (_connected) return;

  if (!env.BLOCKCHAIN_RPC_URL) throw new Error('[Blockchain] BLOCKCHAIN_RPC_URL not configured');
  if (!env.CONTRACT_ADDRESS)   throw new Error('[Blockchain] CONTRACT_ADDRESS not configured');

  const abi = _loadAbi();
  _provider = new ethers.JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);

  const network = await _provider.getNetwork().catch((err) => {
    throw new Error(`[Blockchain] Cannot reach ${env.BLOCKCHAIN_RPC_URL}: ${err.message}`);
  });
  logger.info('[Blockchain] Connected chainId=%s', network.chainId.toString());

  if (env.BLOCKCHAIN_PRIVATE_KEY) {
    _signer   = new ethers.Wallet(env.BLOCKCHAIN_PRIVATE_KEY, _provider);
    _contract = new ethers.Contract(env.CONTRACT_ADDRESS, abi, _signer);
    logger.info('[Blockchain] Signer: %s', await _signer.getAddress());
  } else {
    _contract = new ethers.Contract(env.CONTRACT_ADDRESS, abi, _provider);
    logger.warn('[Blockchain] No private key — read-only mode');
  }

  _connected = true;
}

async function _ensureConnected() {
  if (!_connected) await connect();
}

function _requireSigner() {
  if (!_signer) {
    throw new Error('[Blockchain] Write operation requires BLOCKCHAIN_PRIVATE_KEY');
  }
}

// ── Encoding helpers ────────────────────────────────────────────────────────

function encodeReportId(reportId) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(reportId)));
}

function encodePdfHash(hexHash) {
  const clean = hexHash.startsWith('0x') ? hexHash : '0x' + hexHash;
  if (clean.length !== 66) {
    throw new Error(`[Blockchain] PDF hash must be 64 hex chars, got ${clean.length - 2}`);
  }
  return clean.toLowerCase();
}

function encodeStudentId(studentId) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(studentId)));
}

// ── Gas ─────────────────────────────────────────────────────────────────────

async function _gasOptions(estimateFn, args) {
  try {
    const estimate = await estimateFn(...args);
    return { gasLimit: (estimate * 120n) / 100n };
  } catch {
    return { gasLimit: 300_000n };
  }
}

async function _waitReceipt(tx) {
  return Promise.race([
    tx.wait(1),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tx ${tx.hash} timed out after 120s`)), 120_000)
    ),
  ]);
}

// ── Broadcast-only helper ───────────────────────────────────────────────────

/**
 * Broadcast registerReport() and return the TransactionResponse immediately.
 * Does NOT wait for confirmation. The caller must persist tx.hash as
 * blockchain.status='pending' BEFORE calling waitForConfirmation(), so that
 * if the wait fails the retry can recover the existing tx instead of
 * broadcasting a second one.
 *
 * @param {object} params
 * @param {string} params.reportId   MongoDB ObjectId of the Report
 * @param {string} params.pdfHash    SHA-256 hex hash of the PDF (64 chars)
 * @returns {Promise<TransactionResponse>}
 */
async function broadcastAnchor({ reportId, pdfHash }) {
  await _ensureConnected();
  _requireSigner();

  const reportIdBytes32 = encodeReportId(reportId);
  const pdfHashBytes32  = encodePdfHash(pdfHash);

  logger.info('[Blockchain] broadcastAnchor reportId=%s bytes32=%s', reportId, reportIdBytes32);

  const opts = await _gasOptions(
    _contract.registerReport.estimateGas.bind(_contract),
    [reportIdBytes32, pdfHashBytes32]
  );

  return _contract.registerReport(reportIdBytes32, pdfHashBytes32, opts);
}

/**
 * Wait for an already-broadcast tx to reach 1 confirmation, given only its hash.
 * Used in the retry-recovery path where the TransactionResponse object is no
 * longer in memory but the txHash was persisted to MongoDB.
 *
 * Fast path: if the tx is already mined (common on retry after timeout),
 * getTransactionReceipt() returns immediately without polling.
 *
 * @param {string} txHash
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<TransactionReceipt>}
 */
async function waitForConfirmation(txHash, timeoutMs = 120_000) {
  await _ensureConnected();

  // Fast path — tx may already be mined (e.g. the first attempt timed out but
  // the tx was confirmed during the 60-second wait window).
  const alreadyMined = await _provider.getTransactionReceipt(txHash).catch(() => null);
  if (alreadyMined) {
    logger.info('[Blockchain] waitForConfirmation: tx already mined blockNumber=%d', alreadyMined.blockNumber);
    return alreadyMined;
  }

  // Slow path — tx is still pending. Fetch TransactionResponse so we can
  // call .wait(1) on it.
  const tx = await _provider.getTransaction(txHash);
  if (!tx) {
    throw new Error(`[Blockchain] Tx ${txHash} not found on network — may have been dropped from mempool`);
  }

  return Promise.race([
    tx.wait(1),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`[Blockchain] Tx ${txHash} confirmation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Fetch block.timestamp for a mined block.
 * Returns Unix epoch seconds; falls back to Date.now() if the block is unavailable.
 *
 * @param {number} blockNumber
 * @returns {Promise<number>}
 */
async function getBlockTimestamp(blockNumber) {
  await _ensureConnected();
  try {
    const block = await _provider.getBlock(blockNumber);
    return block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

// ── Core API ────────────────────────────────────────────────────────────────

/**
 * Anchor a report hash on-chain via registerReport().
 *
 * @param {object} params
 * @param {string} params.reportId    MongoDB ObjectId of the Report document
 * @param {string} params.pdfHash     SHA-256 hex hash of the PDF (64 chars)
 * @param {string} params.studentId   MongoDB ObjectId of the student User
 * @param {string} [params.metadataURI]
 * @returns {object}  { txHash, contractAddress, blockNumber, blockTimestamp, gasUsed, network }
 */
async function anchorReport({ reportId, pdfHash, studentId, metadataURI = '' }) {
  const reportIdBytes32 = encodeReportId(reportId);

  logger.info('[Blockchain] anchorReport reportId=%s bytes32=%s', reportId, reportIdBytes32);

  const tx = await broadcastAnchor({ reportId, pdfHash });
  logger.info('[Blockchain] Broadcast txHash=%s', tx.hash);

  const receipt = await _waitReceipt(tx);

  const blockTimestamp = await getBlockTimestamp(receipt.blockNumber);

  logger.info('[Blockchain] Confirmed txHash=%s block=%d', receipt.hash, receipt.blockNumber);

  return {
    txHash          : receipt.hash,
    contractAddress : env.CONTRACT_ADDRESS,
    blockNumber     : receipt.blockNumber,
    blockTimestamp,
    gasUsed         : receipt.gasUsed.toString(),
    network         : env.BLOCKCHAIN_NETWORK,
    reportIdBytes32,
  };
}

/**
 * Verify a PDF hash against the on-chain record via verifyIntegrity().
 *
 * @param {string} reportId  MongoDB ObjectId
 * @param {string} pdfHash   SHA-256 hex hash (64 chars)
 * @returns {object}  { valid, onChainRecord, reportIdBytes32, pdfHashBytes32 }
 */
async function verifyIntegrity(reportId, pdfHash) {
  await _ensureConnected();

  const reportIdBytes32 = encodeReportId(reportId);
  const pdfHashBytes32  = encodePdfHash(pdfHash);

  const valid = await _contract.verifyIntegrity(reportIdBytes32, pdfHashBytes32);

  let onChainRecord = null;
  try {
    const raw = await _contract.getReport(reportIdBytes32);
    onChainRecord = {
      pdfHash     : raw.pdfHash,
      owner       : raw.owner,
      timestamp   : Number(raw.timestamp),
      blockNumber : Number(raw.blockNumber),
      metadataURI : raw.metadataURI,
      isRevoked   : raw.isRevoked,
      date        : new Date(Number(raw.timestamp) * 1000).toISOString(),
    };
  } catch { /* ReportNotFound — report not yet anchored */ }

  return { valid, onChainRecord, reportIdBytes32, pdfHashBytes32, verifiedAt: new Date().toISOString() };
}

/**
 * Update the on-chain hash after a report PDF is regenerated.
 *
 * @param {string} reportId   MongoDB ObjectId
 * @param {string} newPdfHash New SHA-256 hex hash (64 chars)
 */
async function updateReportHash(reportId, newPdfHash) {
  await _ensureConnected();
  _requireSigner();

  const reportIdBytes32 = encodeReportId(reportId);
  const newHashBytes32  = encodePdfHash(newPdfHash);

  const opts    = await _gasOptions(_contract.updateReportHash.estimateGas.bind(_contract), [reportIdBytes32, newHashBytes32]);
  const tx      = await _contract.updateReportHash(reportIdBytes32, newHashBytes32, opts);
  const receipt = await _waitReceipt(tx);

  logger.info('[Blockchain] Hash updated txHash=%s report=%s', receipt.hash, reportId);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), network: env.BLOCKCHAIN_NETWORK };
}

/**
 * Revoke a report on-chain so verifyIntegrity always returns false.
 *
 * @param {string} reportId  MongoDB ObjectId
 */
async function revokeOnChain(reportId) {
  // revokeReport was removed from the contract in v2 to cut deployment gas.
  // Revocation is now a MongoDB-only operation (report.blockchain.status = 'revoked').
  throw new Error(
    '[Blockchain] revokeOnChain: on-chain revocation removed in contract v2. ' +
    'Set report.blockchain.status = "revoked" in MongoDB instead.'
  );
}

/**
 * Fetch the raw on-chain record. Returns null if never registered.
 *
 * @param {string} reportId  MongoDB ObjectId
 */
async function getOnChainRecord(reportId) {
  await _ensureConnected();
  try {
    const raw = await _contract.getReport(encodeReportId(reportId));
    return {
      pdfHash  : raw.pdfHash,
      owner    : raw.owner,
      timestamp: Number(raw.timestamp),
      date     : new Date(Number(raw.timestamp) * 1000).toISOString(),
    };
  } catch (err) {
    if (err.errorName === 'NotFound' || err.message?.includes('NotFound')) return null;
    throw err;
  }
}

/**
 * Health/readiness probe — called by /healthz.
 */
async function healthCheck() {
  const configured = !!(env.BLOCKCHAIN_RPC_URL && env.CONTRACT_ADDRESS);
  if (!configured) return { configured: false, connected: false };

  try {
    await _ensureConnected();
    const network = await _provider.getNetwork();
    return {
      configured    : true,
      connected     : true,
      signerAddress : _signer ? await _signer.getAddress() : null,
      chainId       : network.chainId.toString(),
      contractAddress: env.CONTRACT_ADDRESS,
    };
  } catch (err) {
    return { configured: true, connected: false, error: err.message };
  }
}

// ── Minimal embedded ABI — matches CareerReport.sol v2 (2-slot struct) ────────

const MINIMAL_ABI = [
  { name:'registerReport', type:'function', stateMutability:'nonpayable',
    inputs:[{name:'reportId',type:'bytes32'},{name:'pdfHash',type:'bytes32'}], outputs:[] },
  { name:'updateReportHash', type:'function', stateMutability:'nonpayable',
    inputs:[{name:'reportId',type:'bytes32'},{name:'newPdfHash',type:'bytes32'}], outputs:[] },
  { name:'verifyIntegrity', type:'function', stateMutability:'view',
    inputs:[{name:'reportId',type:'bytes32'},{name:'pdfHash',type:'bytes32'}], outputs:[{name:'valid',type:'bool'}] },
  { name:'getReport', type:'function', stateMutability:'view',
    inputs:[{name:'reportId',type:'bytes32'}],
    outputs:[{name:'',type:'tuple',components:[
      {name:'pdfHash',type:'bytes32'},{name:'owner',type:'address'},{name:'timestamp',type:'uint96'}
    ]}] },
  { name:'reportExists', type:'function', stateMutability:'view',
    inputs:[{name:'reportId',type:'bytes32'}], outputs:[{name:'',type:'bool'}] },
  { name:'Registered', type:'event',
    inputs:[{name:'reportId',type:'bytes32',indexed:true},{name:'pdfHash',type:'bytes32',indexed:true},
            {name:'owner',type:'address',indexed:true},{name:'timestamp',type:'uint256',indexed:false}] },
];

module.exports = {
  connect, anchorReport, broadcastAnchor, waitForConfirmation, getBlockTimestamp,
  verifyIntegrity, updateReportHash, revokeOnChain, getOnChainRecord, healthCheck,
  encodeReportId, encodePdfHash, encodeStudentId,
};
