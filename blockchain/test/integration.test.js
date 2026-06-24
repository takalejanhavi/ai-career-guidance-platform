'use strict';

/**
 * Integration tests for BlockchainService and the REST API.
 * These tests spin up a local Hardhat network in-process.
 *
 * Run: node test/integration.test.js
 */

const assert  = require('assert').strict;
const crypto  = require('crypto');
const http    = require('http');
const { ethers } = require('ethers');
const { BlockchainService }  = require('../src/services/BlockchainService');
const helpers                 = require('../src/utils/contractHelpers');

// ── Test infrastructure ────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const results = [];

async function test(name, fn, skip = false) {
  if (skip) {
    process.stdout.write(`  ⊘  ${name}\n`);
    skipped++;
    return;
  }
  try {
    await fn();
    process.stdout.write(`  ✓  ${name}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`  ✗  ${name}: ${e.message}\n`);
    failed++;
    results.push({ name, error: e.message });
  }
}

function section(name) {
  console.log(`\n  ${name}\n  ${'─'.repeat(name.length)}`);
}

// ── Helpers ────────────────────────────────────────────────────────
function randomHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}
function randomId() {
  return 'RPT-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   BlockchainService Integration Tests                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ══════════════════════════════════════════════════════════════
  // Section 1 — contractHelpers (pure, no network needed)
  // ══════════════════════════════════════════════════════════════
  section('contractHelpers (pure)');

  test('encodeReportId returns 0x + 64 hex chars', () => {
    const id = helpers.encodeReportId('RPT-TEST-001');
    assert.match(id, /^0x[0-9a-f]{64}$/);
  });

  test('encodeReportId is deterministic', () => {
    assert.equal(helpers.encodeReportId('RPT-A'), helpers.encodeReportId('RPT-A'));
  });

  test('encodeReportId produces unique values for different inputs', () => {
    assert.notEqual(helpers.encodeReportId('RPT-1'), helpers.encodeReportId('RPT-2'));
  });

  test('encodeHash normalises 64-char hex correctly', () => {
    const raw   = 'a'.repeat(64);
    const result = helpers.encodeHash(raw);
    assert.equal(result, '0x' + raw);
  });

  test('encodeHash accepts 0x-prefixed input', () => {
    const raw = '0x' + 'b'.repeat(64);
    assert.equal(helpers.encodeHash(raw), raw.toLowerCase());
  });

  test('encodeHash rejects wrong length', () => {
    assert.throws(() => helpers.encodeHash('abcd'), /64 hex/);
    // note: encodeHash error says '64 hex chars'
  });

  test('hashTobytes32 produces 0x + 64 hex chars from string', () => {
    const h = helpers.hashTobytes32('hello world');
    assert.match(h, /^0x[0-9a-f]{64}$/);
  });

  test('PERMISSIONS.fromArray builds correct bitmask', () => {
    assert.equal(helpers.PERMISSIONS.fromArray(['view']),                  0x01);
    assert.equal(helpers.PERMISSIONS.fromArray(['view', 'download']),      0x03);
    assert.equal(helpers.PERMISSIONS.fromArray(['view','download','annotate']), 0x07);
    assert.equal(helpers.PERMISSIONS.fromArray(['all']),                   0x07);
  });

  test('PERMISSIONS.toArray decodes bitmask correctly', () => {
    assert.deepEqual(helpers.PERMISSIONS.toArray(0x01), ['view']);
    assert.deepEqual(helpers.PERMISSIONS.toArray(0x03), ['view', 'download']);
    assert.deepEqual(helpers.PERMISSIONS.toArray(0x07), ['view', 'download', 'annotate']);
    assert.deepEqual(helpers.PERMISSIONS.toArray(0x00), []);
  });

  test('PERMISSIONS.has checks individual bits', () => {
    assert.equal(helpers.PERMISSIONS.has(0x07, helpers.PERMISSIONS.VIEW),     true);
    assert.equal(helpers.PERMISSIONS.has(0x07, helpers.PERMISSIONS.DOWNLOAD), true);
    assert.equal(helpers.PERMISSIONS.has(0x01, helpers.PERMISSIONS.DOWNLOAD), false);
  });

  test('fromArray throws on unknown permission', () => {
    assert.throws(() => helpers.PERMISSIONS.fromArray(['superadmin']), /Unknown permission/);
  });

  test('grantStatus returns correct status strings', () => {
    assert.equal(helpers.grantStatus(null), 'none');
    assert.equal(helpers.grantStatus({ grantedAt: 0 }), 'none');
    assert.equal(helpers.grantStatus({ grantedAt: 1, isRevoked: true, expiresAt: 0 }), 'revoked');
    // Active
    const future = Math.floor(Date.now() / 1000) + 3600;
    assert.equal(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: future }), 'active');
    // Expired
    const past = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: past }), 'expired');
    // No expiry
    assert.equal(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: 0 }), 'active');
  });

  test('serializeReport converts bigints to numbers', () => {
    const r = {
      pdfHash: '0x' + 'a'.repeat(64), owner: '0x1234',
      studentId: '0x' + 'b'.repeat(64),
      timestamp: 1_700_000_000n, blockNumber: 12345n,
      metadataURI: '', isRevoked: false,
    };
    const s = helpers.serializeReport(r);
    assert.equal(typeof s.timestamp,   'number');
    assert.equal(typeof s.blockNumber, 'number');
    assert.ok(s.date.includes('T'));  // ISO date
  });

  test('serializeGrant converts bigints and adds permNames', () => {
    const g = {
      grantedBy: '0x1234', grantedAt: 1_700_000_000n,
      expiresAt: 0n, permissions: 7n, isRevoked: false,
    };
    const s = helpers.serializeGrant(g);
    assert.deepEqual(s.permNames, ['view','download','annotate']);
    assert.equal(s.status, 'active');
    assert.equal(s.expiryDate, null);
  });

  test('decodeContractError handles custom error names', () => {
    const msg = helpers.decodeContractError({ errorName: 'NotOwner' });
    assert.ok(msg.toLowerCase().includes('owner'));
  });

  test('decodeContractError falls back to err.reason', () => {
    const msg = helpers.decodeContractError({ reason: 'Something failed' });
    assert.equal(msg, 'Something failed');
  });

  test('decodeContractError handles unknown errors', () => {
    const msg = helpers.decodeContractError({ message: 'unknown' });
    assert.equal(msg, 'unknown');
  });

  test('addGasBuffer adds 20% by default', () => {
    const est = 100_000n;
    const buf = helpers.addGasBuffer(est);
    assert.equal(buf, 120_000n);
  });

  test('addGasBuffer accepts custom percentage', () => {
    const est = 100_000n;
    const buf = helpers.addGasBuffer(est, 50);
    assert.equal(buf, 150_000n);
  });

  // ══════════════════════════════════════════════════════════════
  // Section 2 — BlockchainService (requires local Hardhat node)
  // ══════════════════════════════════════════════════════════════
  section('BlockchainService (requires running Hardhat node)');

  // Check if local node is available
  const nodeAvailable = await _checkLocalNode();
  const SKIP = !nodeAvailable;
  if (SKIP) {
    console.log('  ⚠  Hardhat node not running — skipping live tests');
    console.log('     Start with: npx hardhat node (in separate terminal)');
    console.log('     Then deploy: npm run deploy:local\n');
  }

  // If node is available, run live tests
  let service, contractAddress;
  if (nodeAvailable) {
    contractAddress = await _deployContract();
  }

  await test('constructor throws on missing rpcUrl', () => {
    assert.throws(() => new BlockchainService({ contractAddress: '0x123' }), /rpcUrl/);
  });

  await test('constructor throws on missing contractAddress', () => {
    assert.throws(() => new BlockchainService({ rpcUrl: 'http://x' }), /contractAddress/);
  });

  await test('connect() returns self (chainable)', async () => {
    if (!nodeAvailable) return;
    service = new BlockchainService({
      rpcUrl: 'http://127.0.0.1:8545',
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      contractAddress,
    });
    const result = await service.connect();
    assert.strictEqual(result, service);
  }, SKIP);

  await test('getInfo returns chain metadata', async () => {
    const info = await service.getInfo();
    assert.equal(typeof info.chainId, 'string');
    assert.ok(info.blockNumber > 0);
    assert.ok(info.contractAddress === contractAddress);
    assert.ok(info.signerAddress);
  }, SKIP);

  await test('registerReport anchors hash on-chain', async () => {
    const id   = randomId();
    const hash = sha256hex('test-pdf-content');
    const result = await service.registerReport({
      reportId:  id,
      pdfHash:   hash,
      studentId: 'STU-001',
    });
    assert.equal(result.status, 'confirmed');
    assert.match(result.txHash, /^0x[0-9a-f]{64}$/);
    assert.ok(result.blockNumber > 0);
  }, SKIP);

  await test('verifyIntegrity returns valid=true for correct hash', async () => {
    const id   = randomId();
    const hash = sha256hex('verify-test');
    await service.registerReport({ reportId: id, pdfHash: hash, studentId: 'STU-002' });
    const result = await service.verifyIntegrity(id, hash);
    assert.equal(result.valid, true);
    assert.ok(result.onChain);
  }, SKIP);

  await test('verifyIntegrity returns valid=false for wrong hash', async () => {
    const id   = randomId();
    const hash = sha256hex('real-content');
    await service.registerReport({ reportId: id, pdfHash: hash, studentId: 'STU-003' });
    const result = await service.verifyIntegrity(id, sha256hex('tampered'));
    assert.equal(result.valid, false);
    assert.ok(result.reason.toLowerCase().includes('tamper') || result.reason.includes('mismatch'));
  }, SKIP);

  await test('verifyIntegrity returns valid=false for unknown report', async () => {
    const result = await service.verifyIntegrity('GHOST-REPORT-XYZ', sha256hex('x'));
    assert.equal(result.valid, false);
  }, SKIP);

  // CHANGED: grantAccess / revokeAccess / getAllGrants tests removed.
  //          Contract v2 has no on-chain access control — grantAccess, revokeAccess,
  //          hasAccess, and getAllGrants were removed from the contract to cut deployment
  //          gas from ~1.7M to ~300k. Access control now lives in MongoDB (backend).
  //          These tests should be moved to backend/test/ against the Node service layer.

  await test('updateReportHash updates and re-verifies', async () => {
    const id    = randomId();
    const hash1 = sha256hex('v1');
    const hash2 = sha256hex('v2');
    await service.registerReport({ reportId: id, pdfHash: hash1, studentId: 'STU-007' });

    assert.equal((await service.verifyIntegrity(id, hash1)).valid, true);
    await service.updateReportHash(id, hash2);
    assert.equal((await service.verifyIntegrity(id, hash1)).valid, false);
    assert.equal((await service.verifyIntegrity(id, hash2)).valid, true);
  }, SKIP);

  // CHANGED: revokeReport test removed. Contract v2 has no revokeReport function.
  //          On-chain revocation was removed to cut gas cost. Set
  //          report.blockchain.status = 'revoked' in MongoDB instead.
  //          verifyIntegrity in v2 checks only pdfHash match — it has no
  //          isRevoked field, so it cannot return false for a "revoked" report.

  await test('getReport returns correct owner and hash', async () => {
    const id   = randomId();
    const hash = sha256hex('getreport-test');
    await service.registerReport({ reportId: id, pdfHash: hash, studentId: 'STU-009' });
    const r = await service.getReport(id);
    assert.equal(r.pdfHash, helpers.encodeHash(hash));
    // CHANGED: removed assert.equal(r.isRevoked, false) — isRevoked was removed
    //          from the v2 contract struct (pdfHash, owner, timestamp only).
    assert.ok(r.timestamp > 0);
    assert.ok(r.date);
  }, SKIP);

  // CHANGED: getOwnerReports test removed. Contract v2 has no _ownerReports[] array
  //          or getOwnerReports() function — the mapping was removed to save ~42k gas
  //          per registerReport call. Query MongoDB reports collection by userId instead.

  // ══════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  ${passed} passed | ${failed} failed | ${skipped} skipped | ${passed + failed + skipped} total`);
  if (results.length) {
    console.log('\n  Failed:');
    results.forEach(r => console.log(`    ✗ ${r.name}: ${r.error}`));
  }
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

// ── Deploy contract to local node ─────────────────────────────────
async function _deployContract() {
  try {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const signer   = new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    );
    const fs   = require('fs');
    const path = require('path');
    // CHANGED: Hardhat compile produces CareerReport.json (not separate .abi.json / .bin)
    const artifactPath = path.join(__dirname, '../artifacts/contracts/CareerReport.sol/CareerReport.json');

    if (!fs.existsSync(artifactPath)) { // CHANGED: single file check replaces two-file check
      console.log('  ⚠  Compiled artifacts not found — skipping live deploy');
      return null;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')); // CHANGED: single JSON
    const abi      = artifact.abi;        // CHANGED: extract abi field
    const bytecode = artifact.bytecode;   // CHANGED: already includes 0x prefix
    const factory  = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return await contract.getAddress();
  } catch (e) {
    console.log('  ⚠  Deploy failed:', e.message.substring(0, 80));
    return null;
  }
}

// ── Check if local node is running ────────────────────────────────
async function _checkLocalNode() {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: 8545, method: 'POST',
      headers: { 'Content-Type': 'application/json' } }, res => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    req.write(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
    req.end();
  });
}

main().catch(err => { console.error(err); process.exit(1); });
