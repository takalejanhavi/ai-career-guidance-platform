'use strict';

const { ethers } = require('ethers');
const crypto     = require('crypto');

/**
 * Contract helper utilities.
 * All functions are pure (no network calls) unless stated otherwise.
 */

// ── Report ID encoding ─────────────────────────────────────────────

/**
 * Encode a UUID or string into a bytes32 reportId for the contract.
 * Mirrors the on-chain encodeReportId() pure function.
 *
 * @param {string} uuid  Off-chain report UUID (e.g. 'RPT-2024-77341')
 * @returns {string}     0x-prefixed bytes32 hex string
 */
function encodeReportId(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

/**
 * Encode a raw bytes32 hex string.
 * Pass-through for when you already have a keccak256 bytes32.
 */
function toBytes32(hexStr) {
  if (!hexStr.startsWith('0x')) hexStr = '0x' + hexStr;
  if (hexStr.length !== 66) {
    throw new Error(`Expected 32 bytes (64 hex chars), got ${(hexStr.length - 2) / 2} bytes`);
  }
  return hexStr.toLowerCase();
}

// ── PDF hash encoding ─────────────────────────────────────────────

/**
 * Convert a hex SHA-256 hash string into a bytes32 value for the contract.
 * SHA-256 produces 32 bytes = perfect bytes32 fit.
 *
 * @param {string} hexHash  64-char hex SHA-256 (with or without 0x prefix)
 * @returns {string}        0x-prefixed bytes32
 */
function encodeHash(hexHash) {
  const clean = hexHash.startsWith('0x') ? hexHash : '0x' + hexHash;
  if (clean.length !== 66) {
    throw new Error(`SHA-256 hash must be 64 hex chars, got ${clean.length - 2}`);
  }
  return clean.toLowerCase();
}

/**
 * Hash a Buffer or string with SHA-256 and return as bytes32-ready hex.
 *
 * @param {Buffer|string} data
 * @returns {string}  0x-prefixed bytes32
 */
function hashTobytes32(data) {
  const buf  = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return '0x' + hash;
}

// ── Student ID encoding ────────────────────────────────────────────

/**
 * Encode a student ID for privacy-preserving on-chain storage.
 * Uses keccak256 of the student ID string.
 *
 * @param {string} studentId  Off-chain student ID
 * @returns {string}          bytes32 privacy-preserving identifier
 */
function encodeStudentId(studentId) {
  return ethers.keccak256(ethers.toUtf8Bytes(studentId));
}

// ── Permission bitmasks ────────────────────────────────────────────

const PERMISSIONS = {
  VIEW:     0x01,
  DOWNLOAD: 0x02,
  ANNOTATE: 0x04,
  ALL:      0x07,

  /**
   * Build a permission bitmask from an array of capability strings.
   * @param {string[]} caps  e.g. ['view', 'download']
   * @returns {number}       bitmask
   */
  fromArray(caps) {
    let mask = 0;
    for (const cap of caps) {
      switch (cap.toLowerCase()) {
        case 'view':     mask |= this.VIEW;     break;
        case 'download': mask |= this.DOWNLOAD; break;
        case 'annotate': mask |= this.ANNOTATE; break;
        case 'all':      mask |= this.ALL;       break;
        default: throw new Error(`Unknown permission: '${cap}'`);
      }
    }
    return mask;
  },

  /**
   * Decode a permission bitmask into an array of capability strings.
   * @param {number} mask
   * @returns {string[]}
   */
  toArray(mask) {
    const caps = [];
    if (mask & this.VIEW)     caps.push('view');
    if (mask & this.DOWNLOAD) caps.push('download');
    if (mask & this.ANNOTATE) caps.push('annotate');
    return caps;
  },

  /**
   * Check if a bitmask includes a specific permission.
   * @param {number} mask
   * @param {number} permission  e.g. PERMISSIONS.DOWNLOAD
   */
  has(mask, permission) {
    return (mask & permission) !== 0;
  },
};

// ── Grant status helpers ───────────────────────────────────────────

/**
 * Determine the human-readable status of an access grant.
 *
 * @param {object} grant   AccessGrant struct from contract
 * @returns {'active'|'revoked'|'expired'|'none'}
 */
function grantStatus(grant) {
  if (!grant || grant.grantedAt === 0n || grant.grantedAt === 0) return 'none';
  if (grant.isRevoked) return 'revoked';
  const expiry = BigInt(grant.expiresAt);
  if (expiry !== 0n && expiry < BigInt(Math.floor(Date.now() / 1000))) return 'expired';
  return 'active';
}

/**
 * Serialize a contract Report struct to a plain object.
 */
function serializeReport(report) {
  return {
    pdfHash:     report.pdfHash,
    owner:       report.owner,
    studentId:   report.studentId,
    timestamp:   Number(report.timestamp),
    blockNumber: Number(report.blockNumber),
    metadataURI: report.metadataURI,
    isRevoked:   report.isRevoked,
    date:        new Date(Number(report.timestamp) * 1000).toISOString(),
  };
}

/**
 * Serialize a contract AccessGrant struct to a plain object.
 */
function serializeGrant(grant) {
  const expiry = Number(grant.expiresAt);
  return {
    grantedBy:   grant.grantedBy,
    grantedAt:   Number(grant.grantedAt),
    expiresAt:   expiry,
    permissions: Number(grant.permissions),
    permNames:   PERMISSIONS.toArray(Number(grant.permissions)),
    isRevoked:   grant.isRevoked,
    status:      grantStatus(grant),
    grantDate:   new Date(Number(grant.grantedAt) * 1000).toISOString(),
    expiryDate:  expiry ? new Date(expiry * 1000).toISOString() : null,
  };
}

// ── Error decoding ────────────────────────────────────────────────

/**
 * Extract a human-readable message from an ethers contract error.
 * Handles custom errors, revert strings, and network errors.
 *
 * @param {Error} err
 * @returns {string}
 */
function decodeContractError(err) {
  // Custom error names from our contract
  const customErrors = {
    NotOwner:               'Caller is not the contract owner',
    NotReportOwner:         'Caller does not own this report',
    ReportAlreadyExists:    'A report with this ID already exists',
    ReportNotFound:         'Report not found',
    InvalidHash:            'PDF hash must not be zero',
    AccessNotGranted:       'No active access grant for this grantee',
    AccessAlreadyGranted:   'Access already granted (use updatePermissions)',
    AccessExpired:          'Access grant has expired',
    InvalidExpiry:          'Expiry timestamp must be in the future',
    ZeroAddress:            'Grantee address must not be zero',
    Paused:                 'Contract is paused',
    SelfGrant:              'Cannot grant access to yourself',
    EmptyMetadata:          'Metadata URI must not be empty',
  };

  if (err.errorName && customErrors[err.errorName]) {
    return customErrors[err.errorName];
  }
  if (err.reason) return err.reason;
  if (err.message) {
    // Strip ethers boilerplate
    const match = err.message.match(/reverted with reason string "(.+?)"/);
    if (match) return match[1];
    return err.message;
  }
  return 'Unknown contract error';
}

// ── Gas estimation helpers ────────────────────────────────────────

/**
 * Add a gas buffer to an estimated gas value.
 * @param {bigint} estimate
 * @param {number} bufferPct  Default 20%
 * @returns {bigint}
 */
function addGasBuffer(estimate, bufferPct = 20) {
  return (estimate * BigInt(100 + bufferPct)) / 100n;
}

module.exports = {
  encodeReportId,
  toBytes32,
  encodeHash,
  hashTobytes32,
  encodeStudentId,
  PERMISSIONS,
  grantStatus,
  serializeReport,
  serializeGrant,
  decodeContractError,
  addGasBuffer,
};
