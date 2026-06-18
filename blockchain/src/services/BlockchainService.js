'use strict';

const { ethers } = require('ethers');
const fs         = require('fs');
const path       = require('path');
const helpers    = require('../utils/contractHelpers');

// Load ABI
const ABI_PATH = path.join(__dirname, '../../artifacts/contracts/CareerReport.sol/CareerReport.abi.json');

/**
 * BlockchainService
 * ==================
 * Full Node.js integration layer for the CareerReport smart contract.
 *
 * Supports two modes:
 *   read-only  : provider only (for verify/query operations)
 *   read-write : provider + signer (for register/grant/revoke)
 *
 * Usage:
 *   const svc = new BlockchainService({ rpcUrl, privateKey, contractAddress });
 *   await svc.connect();
 *   const result = await svc.registerReport({ reportId, pdfHash, studentId });
 */
class BlockchainService {

  constructor({
    rpcUrl,
    privateKey       = null,
    contractAddress,
    confirmations    = 1,
    gasLimitBuffer   = 20,    // percent buffer on gas estimates
    timeoutMs        = 60_000,
  } = {}) {
    if (!rpcUrl)          throw new Error('rpcUrl is required');
    if (!contractAddress) throw new Error('contractAddress is required');

    this.rpcUrl          = rpcUrl;
    this.privateKey      = privateKey;
    this.contractAddress = contractAddress;
    this.confirmations   = confirmations;
    this.gasLimitBuffer  = gasLimitBuffer;
    this.timeoutMs       = timeoutMs;
    this._connected      = false;
  }

  // ── Connection ────────────────────────────────────────────────

  async connect() {
    if (this._connected) return this;

    // Load ABI
    if (!fs.existsSync(ABI_PATH)) {
      throw new Error(
        `ABI not found at ${ABI_PATH}. Run 'npm run compile' first.`
      );
    }
    this.abi = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));

    // Provider
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

    // Test connection
    const network = await this.provider.getNetwork().catch(e => {
      throw new Error(`Failed to connect to ${this.rpcUrl}: ${e.message}`);
    });
    this.chainId = network.chainId;

    // Signer (optional — read-only mode without private key)
    if (this.privateKey) {
      this.signer   = new ethers.Wallet(this.privateKey, this.provider);
      this.contract = new ethers.Contract(this.contractAddress, this.abi, this.signer);
      this.signerAddress = await this.signer.getAddress();
    } else {
      this.contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
      this.signerAddress = null;
    }

    this._connected = true;
    return this;
  }

  _requireConnected() {
    if (!this._connected) throw new Error('Call connect() before using BlockchainService');
  }

  _requireSigner() {
    this._requireConnected();
    if (!this.signer) throw new Error('Signer required — provide privateKey in constructor');
  }

  // ── Gas helper ────────────────────────────────────────────────

  async _txOptions(estimateFn, args) {
    const estimate = await estimateFn(...args).catch(() => 300_000n);
    return { gasLimit: helpers.addGasBuffer(estimate, this.gasLimitBuffer) };
  }

  // ── Wait helper ───────────────────────────────────────────────

  async _waitTx(tx) {
    const receipt = await Promise.race([
      tx.wait(this.confirmations),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tx ${tx.hash} timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
      ),
    ]);
    return receipt;
  }

  // ── Report operations ─────────────────────────────────────────

  /**
   * Register a new career report hash on-chain.
   *
   * @param {object} params
   * @param {string} params.reportId    Off-chain report UUID or bytes32
   * @param {string} params.pdfHash     SHA-256 hex hash of PDF (64 chars or 0x+64)
   * @param {string} params.studentId   Off-chain student ID (will be hashed for privacy)
   * @param {string} [params.metadataURI]  Optional IPFS / URL
   * @returns {object}  { txHash, blockNumber, reportId, pdfHash, gasUsed }
   */
  async registerReport({ reportId, pdfHash, studentId, metadataURI = '' }) {
    this._requireSigner();

    const reportIdBytes32  = reportId.startsWith('0x') && reportId.length === 66
      ? reportId
      : helpers.encodeReportId(reportId);
    const pdfHashBytes32   = helpers.encodeHash(pdfHash);
    const studentIdBytes32 = helpers.encodeStudentId(studentId);

    const opts = await this._txOptions(
      this.contract.registerReport.estimateGas.bind(this.contract),
      [reportIdBytes32, pdfHashBytes32, studentIdBytes32, metadataURI]
    );

    const tx = await this.contract.registerReport(
      reportIdBytes32, pdfHashBytes32, studentIdBytes32, metadataURI, opts
    );
    const receipt = await this._waitTx(tx);

    return {
      txHash:      receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      reportId:    reportIdBytes32,
      pdfHash:     pdfHashBytes32,
      status:      receipt.status === 1 ? 'confirmed' : 'failed',
      network:     this.chainId.toString(),
    };
  }

  /**
   * Update the hash of an existing report.
   *
   * @param {string} reportId     Report UUID or bytes32
   * @param {string} newPdfHash   New SHA-256 hash
   */
  async updateReportHash(reportId, newPdfHash) {
    this._requireSigner();

    const reportIdBytes32 = this._toReportId(reportId);
    const hashBytes32     = helpers.encodeHash(newPdfHash);

    const opts = await this._txOptions(
      this.contract.updateReportHash.estimateGas.bind(this.contract),
      [reportIdBytes32, hashBytes32]
    );

    const tx      = await this.contract.updateReportHash(reportIdBytes32, hashBytes32, opts);
    const receipt = await this._waitTx(tx);

    return {
      txHash:      receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      status:      receipt.status === 1 ? 'confirmed' : 'failed',
    };
  }

  /**
   * Revoke a report on-chain.
   */
  async revokeReport(reportId) {
    this._requireSigner();
    const id      = this._toReportId(reportId);
    const opts    = await this._txOptions(this.contract.revokeReport.estimateGas.bind(this.contract), [id]);
    const tx      = await this.contract.revokeReport(id, opts);
    const receipt = await this._waitTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ── Access control ────────────────────────────────────────────

  /**
   * Grant access to a report for a grantee address.
   *
   * @param {object} params
   * @param {string}   params.reportId     Report UUID or bytes32
   * @param {string}   params.grantee      Ethereum address of grantee
   * @param {string[]} params.permissions  e.g. ['view','download']
   * @param {Date|null} [params.expiresAt] Expiry date (null = never)
   */
  async grantAccess({ reportId, grantee, permissions = ['view'], expiresAt = null }) {
    this._requireSigner();

    const id      = this._toReportId(reportId);
    const permBit = helpers.PERMISSIONS.fromArray(permissions);
    const expiry  = expiresAt ? BigInt(Math.floor(new Date(expiresAt).getTime() / 1000)) : 0n;

    const opts    = await this._txOptions(
      this.contract.grantAccess.estimateGas.bind(this.contract),
      [id, grantee, permBit, expiry]
    );

    const tx      = await this.contract.grantAccess(id, grantee, permBit, expiry, opts);
    const receipt = await this._waitTx(tx);

    return {
      txHash:      receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      status:      receipt.status === 1 ? 'confirmed' : 'failed',
      permissions: helpers.PERMISSIONS.toArray(permBit),
      grantee,
      expiresAt:   expiresAt ? new Date(expiresAt).toISOString() : null,
    };
  }

  /**
   * Revoke access for a grantee.
   */
  async revokeAccess(reportId, grantee) {
    this._requireSigner();
    const id      = this._toReportId(reportId);
    const opts    = await this._txOptions(this.contract.revokeAccess.estimateGas.bind(this.contract), [id, grantee]);
    const tx      = await this.contract.revokeAccess(id, grantee, opts);
    const receipt = await this._waitTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  /**
   * Update permissions for an existing grant.
   */
  async updatePermissions(reportId, grantee, permissions) {
    this._requireSigner();
    const id      = this._toReportId(reportId);
    const permBit = helpers.PERMISSIONS.fromArray(permissions);
    const opts    = await this._txOptions(this.contract.updatePermissions.estimateGas.bind(this.contract), [id, grantee, permBit]);
    const tx      = await this.contract.updatePermissions(id, grantee, permBit, opts);
    const receipt = await this._waitTx(tx);
    return { txHash: receipt.hash, status: receipt.status === 1 ? 'confirmed' : 'failed', permissions };
  }

  /**
   * Renew or extend a grant's expiry.
   */
  async renewAccess(reportId, grantee, expiresAt) {
    this._requireSigner();
    const id     = this._toReportId(reportId);
    const expiry = expiresAt ? BigInt(Math.floor(new Date(expiresAt).getTime() / 1000)) : 0n;
    const opts   = await this._txOptions(this.contract.renewAccess.estimateGas.bind(this.contract), [id, grantee, expiry]);
    const tx     = await this.contract.renewAccess(id, grantee, expiry, opts);
    const receipt = await this._waitTx(tx);
    return { txHash: receipt.hash, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ── Verification ──────────────────────────────────────────────

  /**
   * Verify a PDF hash against the on-chain record.
   * This is a read-only call — no gas required.
   *
   * @param {string} reportId  Report UUID or bytes32
   * @param {string} pdfHash   SHA-256 hash to verify
   * @returns {{ valid, report, chain }}
   */
  async verifyIntegrity(reportId, pdfHash) {
    this._requireConnected();

    const id   = this._toReportId(reportId);
    const hash = helpers.encodeHash(pdfHash);

    const [valid, reportData] = await Promise.all([
      this.contract.verifyIntegrity(id, hash),
      this.contract.getReport(id).catch(() => null),
    ]);

    const result = {
      valid,
      reportId:   id,
      pdfHash:    hash,
      onChain:    reportData ? helpers.serializeReport(reportData) : null,
      verifiedAt: new Date().toISOString(),
    };

    if (!valid && reportData) {
      result.reason = reportData.isRevoked
        ? 'Report has been revoked'
        : 'Hash mismatch — document may have been tampered';
    } else if (!reportData) {
      result.reason = 'Report not found on-chain';
    }

    return result;
  }

  /**
   * Check if an address has a specific permission on a report.
   *
   * @param {string} reportId
   * @param {string} grantee
   * @param {string} [permission]  'view' | 'download' | 'annotate' (default: 'view')
   */
  async hasAccess(reportId, grantee, permission = 'view') {
    this._requireConnected();
    const id      = this._toReportId(reportId);
    const permBit = helpers.PERMISSIONS.fromArray([permission]);
    return this.contract.hasAccess(id, grantee, permBit);
  }

  // ── Query ─────────────────────────────────────────────────────

  /**
   * Fetch the full report record from the contract.
   */
  async getReport(reportId) {
    this._requireConnected();
    const id   = this._toReportId(reportId);
    const data = await this.contract.getReport(id);
    return helpers.serializeReport(data);
  }

  /**
   * Fetch the access grant for a specific grantee.
   */
  async getGrant(reportId, grantee) {
    this._requireConnected();
    const id    = this._toReportId(reportId);
    const grant = await this.contract.getAccessGrant(id, grantee);
    return helpers.serializeGrant(grant);
  }

  /**
   * Get all grantees for a report with their grant details.
   */
  async getAllGrants(reportId) {
    this._requireConnected();
    const id       = this._toReportId(reportId);
    const grantees = await this.contract.getGrantees(id);

    const grants = await Promise.all(
      grantees.map(async (addr) => {
        const g = await this.contract.getAccessGrant(id, addr);
        return { grantee: addr, ...helpers.serializeGrant(g) };
      })
    );

    return grants;
  }

  /**
   * Get all report IDs for an owner address.
   */
  async getOwnerReports(ownerAddress) {
    this._requireConnected();
    return this.contract.getOwnerReports(ownerAddress);
  }

  /**
   * Get blockchain connection info.
   */
  async getInfo() {
    this._requireConnected();
    const [blockNumber, gasPrice, balance] = await Promise.all([
      this.provider.getBlockNumber(),
      this.provider.getFeeData().then(d => d.gasPrice),
      this.signerAddress
        ? this.provider.getBalance(this.signerAddress)
        : Promise.resolve(null),
    ]);

    return {
      connected:       true,
      chainId:         this.chainId.toString(),
      contractAddress: this.contractAddress,
      blockNumber,
      gasPrice:        gasPrice ? ethers.formatUnits(gasPrice, 'gwei') + ' gwei' : 'unknown',
      signerAddress:   this.signerAddress,
      signerBalance:   balance ? ethers.formatEther(balance) + ' ETH' : null,
    };
  }

  // ── Event listeners ───────────────────────────────────────────

  /**
   * Listen for ReportRegistered events.
   * @param {Function} callback  (event) => void
   */
  onReportRegistered(callback) {
    this._requireConnected();
    this.contract.on('ReportRegistered', (reportId, pdfHash, owner, studentId, timestamp, blockNumber, event) => {
      callback({
        reportId, pdfHash, owner, studentId,
        timestamp:   Number(timestamp),
        blockNumber: Number(blockNumber),
        txHash:      event.log.transactionHash,
        date:        new Date(Number(timestamp) * 1000).toISOString(),
      });
    });
  }

  /**
   * Listen for AccessGranted events.
   */
  onAccessGranted(callback) {
    this._requireConnected();
    this.contract.on('AccessGranted', (reportId, grantedTo, grantedBy, permissions, expiresAt, timestamp, event) => {
      callback({
        reportId, grantedTo, grantedBy,
        permissions:  helpers.PERMISSIONS.toArray(Number(permissions)),
        expiresAt:    Number(expiresAt),
        timestamp:    Number(timestamp),
        txHash:       event.log.transactionHash,
      });
    });
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners() {
    this._requireConnected();
    this.contract.removeAllListeners();
  }

  // ── Admin ─────────────────────────────────────────────────────

  async pause() {
    this._requireSigner();
    const tx = await this.contract.pause();
    return this._waitTx(tx);
  }

  async unpause() {
    this._requireSigner();
    const tx = await this.contract.unpause();
    return this._waitTx(tx);
  }

  // ── Internal ──────────────────────────────────────────────────

  _toReportId(id) {
    if (typeof id === 'string' && id.startsWith('0x') && id.length === 66) return id;
    return helpers.encodeReportId(id);
  }
}

module.exports = { BlockchainService };
