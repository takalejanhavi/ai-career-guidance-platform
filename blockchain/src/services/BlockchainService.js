'use strict';

const { ethers } = require('ethers');
const fs         = require('fs');
const path       = require('path');
const helpers    = require('../utils/contractHelpers');

// CHANGED: was 'CareerReport.abi.json' — Hardhat compile emits a single
//          CareerReport.json artifact (format: hh-sol-artifact-1) containing
//          abi, bytecode, deployedBytecode, etc.  Separate .abi.json / .bin
//          files are a Truffle/Foundry convention — Hardhat never writes them.
//          The abi array is extracted at connect() time from artifact.abi.
const ARTIFACT_PATH = path.join(
  __dirname,
  '../../artifacts/contracts/CareerReport.sol/CareerReport.json'
);

/**
 * BlockchainService
 * ==================
 * Integration layer for the CareerReport v2 smart contract.
 *
 * Contract v2 on-chain responsibilities (sole source of truth for integrity):
 *   registerReport(reportId, pdfHash)    — anchor proof of existence + hash
 *   updateReportHash(reportId, newHash)  — update hash after PDF regeneration
 *   verifyIntegrity(reportId, pdfHash)   — public integrity verification (view)
 *   getReport(reportId)                  — fetch { pdfHash, owner, timestamp }
 *   reportExists(reportId)               — existence probe (view)
 *
 * Moved to MongoDB in v2 (access via backend Node service):
 *   Access control  — grantAccess, revokeAccess, hasAccess → reports.permissions
 *   Revocation      — blockchain.status = 'revoked' in reports collection
 *   Owner lists     — db.reports.find({ userId })
 *   Metadata URIs, student IDs, block numbers, annotation grants
 */
class BlockchainService {

  constructor({
    rpcUrl,
    privateKey       = null,
    contractAddress,
    confirmations    = 1,
    gasLimitBuffer   = 20,
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

    // CHANGED: load the full Hardhat artifact JSON then extract .abi.
    //          Previously loaded CareerReport.abi.json (file that does not exist).
    if (!fs.existsSync(ARTIFACT_PATH)) {
      throw new Error(
        `Compiled artifact not found at ${ARTIFACT_PATH}. Run 'npx hardhat compile' first.`
      );
    }
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')); // CHANGED: parse full artifact
    this.abi       = artifact.abi;                                        // CHANGED: extract abi array

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

    const network = await this.provider.getNetwork().catch(e => {
      throw new Error(`Failed to connect to ${this.rpcUrl}: ${e.message}`);
    });
    this.chainId = network.chainId;

    if (this.privateKey) {
      this.signer        = new ethers.Wallet(this.privateKey, this.provider);
      this.contract      = new ethers.Contract(this.contractAddress, this.abi, this.signer);
      this.signerAddress = await this.signer.getAddress();
    } else {
      this.contract      = new ethers.Contract(this.contractAddress, this.abi, this.provider);
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
        setTimeout(
          () => reject(new Error(`Tx ${tx.hash} timed out after ${this.timeoutMs}ms`)),
          this.timeoutMs
        )
      ),
    ]);
    return receipt;
  }

  // ── Report operations ─────────────────────────────────────────

  /**
   * Anchor a report hash on-chain.
   *
   * @param {object} params
   * @param {string} params.reportId      MongoDB ObjectId / UUID — hashed to bytes32 on-chain
   * @param {string} params.pdfHash       SHA-256 hex hash of PDF (64 chars or 0x+64)
   * @param {string} [params.studentId]   Accepted for API backward-compat; NOT stored on-chain in v2
   * @param {string} [params.metadataURI] Accepted for API backward-compat; NOT stored on-chain in v2
   * @returns {{ txHash, blockNumber, gasUsed, reportId, pdfHash, status, network }}
   */
  async registerReport({ reportId, pdfHash, studentId, metadataURI }) { // CHANGED: studentId/metadataURI kept in signature for backward compat
    this._requireSigner();

    const reportIdBytes32 = reportId.startsWith('0x') && reportId.length === 66
      ? reportId
      : helpers.encodeReportId(reportId);
    const pdfHashBytes32  = helpers.encodeHash(pdfHash);
    // CHANGED: studentId and metadataURI are no longer passed to the contract.
    //          v2 registerReport(bytes32 reportId, bytes32 pdfHash) — 2 args only.
    //          Store studentId / metadataURI in MongoDB (reports collection).

    const opts = await this._txOptions(
      this.contract.registerReport.estimateGas.bind(this.contract),
      [reportIdBytes32, pdfHashBytes32]                                  // CHANGED: was 4 args
    );

    const tx      = await this.contract.registerReport(reportIdBytes32, pdfHashBytes32, opts); // CHANGED: was 4 args
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
   * Update the stored hash after a PDF is regenerated.
   * Only the original registrant (msg.sender) can call this.
   */
  async updateReportHash(reportId, newPdfHash) {
    this._requireSigner();

    const reportIdBytes32 = this._toReportId(reportId);
    const hashBytes32     = helpers.encodeHash(newPdfHash);

    const opts    = await this._txOptions(
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

  // CHANGED: revokeReport removed from contract v2 — on-chain revocation costs gas
  //          on every state change and the isRevoked flag adds a storage slot.
  //          Revocation is now a MongoDB-only operation:
  //            db.reports.updateOne({ _id }, { $set: { 'blockchain.status': 'revoked' } })
  async revokeReport() {
    throw new Error(
      '[BlockchainService] revokeReport: on-chain revocation removed in contract v2. ' +
      'Set report.blockchain.status = "revoked" in MongoDB (reports collection) instead.'
    );
  }

  // ── Access control stubs ──────────────────────────────────────
  // CHANGED: all access control functions removed from contract v2.
  //          They moved to MongoDB to eliminate the per-grant SSTORE gas cost
  //          (~20k gas per grantee, ~42k gas for array pushes).
  //          Use the backend permission service (reports.permissions in MongoDB).

  async grantAccess() {
    throw new Error(
      '[BlockchainService] grantAccess removed in contract v2. ' +
      'Manage access via reports.permissions in MongoDB (backend service).'
    );
  }

  async revokeAccess() {
    throw new Error(
      '[BlockchainService] revokeAccess removed in contract v2. ' +
      'Update reports.permissions in MongoDB instead.'
    );
  }

  async updatePermissions() {
    throw new Error(
      '[BlockchainService] updatePermissions removed in contract v2. ' +
      'Update reports.permissions in MongoDB instead.'
    );
  }

  async renewAccess() {
    throw new Error(
      '[BlockchainService] renewAccess removed in contract v2. ' +
      'Update reports.permissions.expiresAt in MongoDB instead.'
    );
  }

  async hasAccess() {
    throw new Error(
      '[BlockchainService] hasAccess removed in contract v2. ' +
      'Query reports.permissions in MongoDB instead.'
    );
  }

  // ── Verification ──────────────────────────────────────────────

  /**
   * Verify a PDF hash against the on-chain record.
   * Read-only — no gas required.
   *
   * @param {string} reportId  MongoDB ObjectId / UUID or 0x bytes32
   * @param {string} pdfHash   SHA-256 hex hash to verify
   * @returns {{ valid, reportId, pdfHash, onChain, reason?, verifiedAt }}
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

    // CHANGED: removed reportData.isRevoked check — isRevoked was removed from v2 struct.
    //          v2 verifyIntegrity returns false on two conditions only:
    //            1. report never registered (owner == address(0))
    //            2. stored pdfHash !== supplied pdfHash
    if (!valid && reportData) {
      result.reason = 'Hash mismatch — document may have been tampered';
    } else if (!valid && !reportData) {
      result.reason = 'Report not found on-chain';
    }

    return result;
  }

  // ── Query ─────────────────────────────────────────────────────

  /**
   * Fetch the on-chain Report struct.
   * v2: { pdfHash, owner, timestamp } — serialized to { pdfHash, owner, timestamp, date }
   */
  async getReport(reportId) {
    this._requireConnected();
    const id   = this._toReportId(reportId);
    const data = await this.contract.getReport(id);
    return helpers.serializeReport(data);
  }

  /**
   * Check whether a report has been registered on-chain.
   * @param {string} reportId  UUID or 0x bytes32
   * @returns {boolean}
   */
  async reportExists(reportId) { // CHANGED: new v2 method — exposes contract.reportExists()
    this._requireConnected();
    return this.contract.reportExists(this._toReportId(reportId));
  }

  // CHANGED: getGrant / getAllGrants / getOwnerReports removed from contract v2.
  //          Use MongoDB instead (reports.permissions, reports collection queries).

  async getGrant() {
    throw new Error(
      '[BlockchainService] getGrant removed in contract v2. ' +
      'Query reports.permissions in MongoDB instead.'
    );
  }

  async getAllGrants() {
    throw new Error(
      '[BlockchainService] getAllGrants removed in contract v2. ' +
      'Query reports.permissions array in MongoDB instead.'
    );
  }

  async getOwnerReports() {
    throw new Error(
      '[BlockchainService] getOwnerReports removed in contract v2. ' +
      '_ownerReports[] enumeration array was removed to save ~42k gas per registration. ' +
      'Use db.reports.find({ userId }) in MongoDB instead.'
    );
  }

  // ── Info ──────────────────────────────────────────────────────

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
   * Subscribe to Registered events.
   *
   * CHANGED: event renamed from 'ReportRegistered' (v1) to 'Registered' (v2).
   *          Args reduced from 7 (reportId, pdfHash, owner, studentId, timestamp,
   *          blockNumber, event) to 4 (reportId, pdfHash, owner, timestamp, event).
   *          studentId and blockNumber were removed from the event in v2.
   *
   * @param {Function} callback  ({ reportId, pdfHash, owner, timestamp, txHash, date }) => void
   */
  onReportRegistered(callback) {
    this._requireConnected();
    // CHANGED: 'ReportRegistered' → 'Registered' (v2 contract event name)
    this.contract.on('Registered', (reportId, pdfHash, owner, timestamp, event) => { // CHANGED: 4 positional args (was 7)
      callback({
        reportId,
        pdfHash,
        owner,          // CHANGED: no more studentId / blockNumber
        timestamp: Number(timestamp),
        txHash:    event.log.transactionHash,
        date:      new Date(Number(timestamp) * 1000).toISOString(),
      });
    });
  }

  // CHANGED: AccessGranted event removed from contract v2.
  //          Subscribe to MongoDB change streams on the permissions collection instead.
  onAccessGranted() {
    throw new Error(
      '[BlockchainService] onAccessGranted: AccessGranted event removed from contract v2. ' +
      'Subscribe to MongoDB change streams on the reports.permissions path instead.'
    );
  }

  removeAllListeners() {
    this._requireConnected();
    this.contract.removeAllListeners();
  }

  // ── Admin stubs ───────────────────────────────────────────────

  // CHANGED: pause / unpause removed from contract v2.
  //          The pause mechanism added a storage slot and two functions (~30k gas overhead).
  //          If registrations need to stop, deploy a new contract (zero-migration cost
  //          since all business state is in MongoDB, not on-chain).

  async pause() {
    throw new Error(
      '[BlockchainService] pause: contract v2 has no pause mechanism. ' +
      'Deploy a new CareerReport contract to stop accepting new registrations.'
    );
  }

  async unpause() {
    throw new Error('[BlockchainService] unpause: contract v2 has no pause mechanism.');
  }

  // ── Internal ──────────────────────────────────────────────────

  _toReportId(id) {
    if (typeof id === 'string' && id.startsWith('0x') && id.length === 66) return id;
    return helpers.encodeReportId(id);
  }
}

module.exports = { BlockchainService };
