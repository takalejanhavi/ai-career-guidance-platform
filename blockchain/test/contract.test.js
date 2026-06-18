'use strict';

/**
 * Contract test runner — uses ethers.js with pre-compiled artifacts.
 * Runs against Hardhat Network (in-process via JSON-RPC) without
 * needing the solc compiler to be downloaded.
 *
 * Run: node test/contract.test.js
 */

const { ethers } = require('ethers');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');
const helpers    = require('../src/utils/contractHelpers');

// ── Test infrastructure ────────────────────────────────────────────
let p = 0, f = 0;
const errors = [];

async function t(name, fn) {
  try {
    await fn();
    process.stdout.write(`  ✓  ${name}\n`);
    p++;
  } catch (err) {
    const msg = err.reason || err.shortMessage || err.message || String(err);
    process.stdout.write(`  ✗  ${name}: ${msg.substring(0, 120)}\n`);
    f++;
    errors.push({ name, msg });
  }
}

function sec(name) { console.log(`\n  ${name}\n  ${'─'.repeat(name.length)}`); }

// ── Hardhat Network provider ───────────────────────────────────────
// Uses the Hardhat Network provider that hardhat node exposes
// We instantiate it in-process via @nomicfoundation/hardhat-network-provider
// Actually we'll use the JSON-RPC approach since hardhat node cmd isn't running
// Instead use ethers with hardhat's in-process network

// ── Attempt to connect to hardhat's in-process provider ───────────
async function getProvider() {
  // Try to use hardhat's provider directly
  try {
    const hre = require('hardhat');
    const provider = new ethers.BrowserProvider(hre.network.provider);
    await provider.getBlockNumber();
    return { provider, type: 'hardhat-in-process' };
  } catch {}

  // Fallback: try local node
  try {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    await provider.getBlockNumber();
    return { provider, type: 'external-node' };
  } catch {}

  return null;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   CareerReport Contract Tests                        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const conn = await getProvider();
  if (!conn) {
    console.log('  ⚠  No Ethereum provider available.');
    console.log('     For contract tests, run: npx hardhat node');
    console.log('     Then: node test/contract.test.js\n');
    console.log('  Running pure unit tests only (no network required)...\n');
    await runPureTests();
    summary();
    return;
  }

  console.log(`  Provider: ${conn.type}\n`);
  await runContractTests(conn.provider);

  summary();
}

function summary() {
  console.log(`\n${'═'.repeat(54)}`);
  console.log(`  ${p} passed | ${f} failed | ${p + f} total`);
  if (errors.length) {
    console.log('\n  Failures:');
    errors.forEach(e => console.log(`    ✗ ${e.name}`));
  }
  console.log(`${'═'.repeat(54)}\n`);
  process.exit(f > 0 ? 1 : 0);
}

// ── Pure tests (no network) ────────────────────────────────────────
async function runPureTests() {
  sec('contractHelpers (pure)');

  await t('encodeReportId returns 0x+64 hex', () => {
    const id = helpers.encodeReportId('RPT-TEST');
    if (!id.match(/^0x[0-9a-f]{64}$/)) throw new Error(`Bad format: ${id}`);
  });

  await t('encodeHash validates 64-char hex', () => {
    const h = helpers.encodeHash('a'.repeat(64));
    if (h !== '0x' + 'a'.repeat(64)) throw new Error('Mismatch');
  });

  await t('encodeHash rejects wrong length', () => {
    try { helpers.encodeHash('0xabcd'); throw new Error('Should have thrown'); }
    catch (e) { if (e.message.includes('Should have')) throw e; }
  });

  await t('PERMISSIONS bitmask roundtrip', () => {
    const arr  = ['view', 'download'];
    const mask = helpers.PERMISSIONS.fromArray(arr);
    const back = helpers.PERMISSIONS.toArray(mask);
    if (JSON.stringify(back) !== JSON.stringify(arr)) throw new Error(`${back} !== ${arr}`);
  });

  await t('grantStatus returns correct strings', () => {
    const assert = (a, b) => { if (a !== b) throw new Error(`${a} !== ${b}`); };
    assert(helpers.grantStatus(null), 'none');
    assert(helpers.grantStatus({ grantedAt: 0 }), 'none');
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: true, expiresAt: 0 }), 'revoked');
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: 0 }), 'active');
    const past = Math.floor(Date.now()/1000) - 100;
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: past }), 'expired');
  });
}

// ── Contract tests (requires network) ─────────────────────────────
async function runContractTests(provider) {
  await runPureTests();

  const signers = await provider.listAccounts();
  const owner   = await provider.getSigner(signers[0]);
  const alice   = await provider.getSigner(signers[1]);
  const bob     = await provider.getSigner(signers[2]);
  const carol   = await provider.getSigner(signers[3]);

  const ABI_PATH = path.join(__dirname, '../artifacts/contracts/CareerReport.sol/CareerReport.abi.json');
  const BIN_PATH = path.join(__dirname, '../artifacts/contracts/CareerReport.sol/CareerReport.bin');
  const abi      = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
  const bytecode = '0x' + fs.readFileSync(BIN_PATH, 'utf8');

  async function deploy(signer) {
    const factory  = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  function rh() { return '0x' + crypto.randomBytes(32).toString('hex'); }
  function rid() { return helpers.encodeReportId('RPT-' + Math.random().toString(36).slice(2)); }
  const ZERO = ethers.ZeroHash;
  const H1 = rh(), H2 = rh(), SID = rh();
  const PERM = helpers.PERMISSIONS;
  const nextWeek = () => BigInt(Math.floor(Date.now()/1000) + 7*86400);

  sec('Deployment');
  let c = await deploy(owner);
  await t('owner is deployer', async () => {
    if (await c.owner() !== await owner.getAddress()) throw new Error('owner mismatch');
  });
  await t('starts unpaused', async () => {
    if (await c.paused()) throw new Error('should be unpaused');
  });
  await t('PERM constants correct', async () => {
    if (Number(await c.PERM_VIEW()) !== 1)    throw new Error('VIEW');
    if (Number(await c.PERM_DOWNLOAD()) !== 2) throw new Error('DOWNLOAD');
    if (Number(await c.PERM_ANNOTATE()) !== 4) throw new Error('ANNOTATE');
    if (Number(await c.PERM_ALL()) !== 7)      throw new Error('ALL');
  });

  sec('registerReport');
  const aliceAddr = await alice.getAddress();
  const bobAddr   = await bob.getAddress();
  const carolAddr = await carol.getAddress();

  c = await deploy(alice);
  await t('registers and stores data', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, 'ipfs://test')).wait();
    const r = await c.getReport(id);
    if (r.pdfHash !== H1) throw new Error('hash mismatch');
    if (r.owner !== aliceAddr) throw new Error('owner mismatch');
    if (r.isRevoked) throw new Error('should not be revoked');
  });
  await t('increments totalReports', async () => {
    await (await c.registerReport(rid(), H1, SID, '')).wait();
    await (await c.registerReport(rid(), H2, SID, '')).wait();
    const total = await c.totalReports();
    if (total < 2n) throw new Error('totalReports < 2');
  });
  await t('reverts on zero hash', async () => {
    try { await c.registerReport(rid(), ZERO, SID, ''); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });
  await t('reverts on duplicate reportId', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, '')).wait();
    try { await c.registerReport(id, H2, SID, ''); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  sec('verifyIntegrity');
  c = await deploy(alice);
  await t('returns true for correct hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, '')).wait();
    if (!await c.verifyIntegrity(id, H1)) throw new Error('should be valid');
  });
  await t('returns false for wrong hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, '')).wait();
    if (await c.verifyIntegrity(id, H2)) throw new Error('should be invalid');
  });
  await t('returns false for unknown report', async () => {
    if (await c.verifyIntegrity(rid(), H1)) throw new Error('ghost should be invalid');
  });
  await t('returns false after revokeReport', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, '')).wait();
    await (await c.revokeReport(id)).wait();
    if (await c.verifyIntegrity(id, H1)) throw new Error('revoked should be invalid');
  });
  await t('returns true after updateReportHash with new hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, '')).wait();
    await (await c.updateReportHash(id, H2)).wait();
    if (await c.verifyIntegrity(id, H1)) throw new Error('old hash should be invalid');
    if (!await c.verifyIntegrity(id, H2)) throw new Error('new hash should be valid');
  });

  sec('grantAccess / revokeAccess');
  c = await deploy(alice);
  const id1 = rid();
  await (await c.registerReport(id1, H1, SID, '')).wait();
  await t('grants access and hasAccess returns true', async () => {
    await (await c.grantAccess(id1, bobAddr, PERM.VIEW, 0)).wait();
    if (!await c.hasAccess(id1, bobAddr, PERM.VIEW)) throw new Error('bob should have VIEW');
  });
  await t('VIEW does not imply DOWNLOAD', async () => {
    if (await c.hasAccess(id1, bobAddr, PERM.DOWNLOAD)) throw new Error('should not have DOWNLOAD');
  });
  await t('revokes access', async () => {
    await (await c.revokeAccess(id1, bobAddr)).wait();
    if (await c.hasAccess(id1, bobAddr, PERM.VIEW)) throw new Error('should not have access');
  });
  await t('report owner always has access', async () => {
    if (!await c.hasAccess(id1, aliceAddr, PERM.ALL)) throw new Error('owner should have all access');
  });
  await t('grantor cannot be grantee (self-grant)', async () => {
    try { await c.grantAccess(id1, aliceAddr, PERM.VIEW, 0); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });
  await t('grantAccess reverts on zero address', async () => {
    try { await c.grantAccess(id1, ethers.ZeroAddress, PERM.VIEW, 0); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });
  await t('non-owner cannot grant access', async () => {
    try { await c.connect(bob).grantAccess(id1, carolAddr, PERM.VIEW, 0); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  sec('updatePermissions');
  c = await deploy(alice);
  const id2 = rid();
  await (await c.registerReport(id2, H1, SID, '')).wait();
  await (await c.grantAccess(id2, bobAddr, PERM.VIEW, 0)).wait();
  await t('upgrades permissions', async () => {
    await (await c.updatePermissions(id2, bobAddr, PERM.ALL)).wait();
    if (!await c.hasAccess(id2, bobAddr, PERM.ANNOTATE)) throw new Error('should have ANNOTATE');
  });

  sec('pause / unpause');
  c = await deploy(owner);
  await t('owner can pause', async () => {
    await (await c.pause()).wait();
    if (!await c.paused()) throw new Error('should be paused');
  });
  await t('registerReport reverts when paused', async () => {
    try { await c.registerReport(rid(), H1, SID, ''); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });
  await t('owner can unpause', async () => {
    await (await c.unpause()).wait();
    if (await c.paused()) throw new Error('should be unpaused');
  });
  await t('non-owner cannot pause', async () => {
    try { await c.connect(alice).pause(); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  sec('ownership transfer');
  c = await deploy(owner);
  await t('transfers ownership', async () => {
    await (await c.transferOwnership(aliceAddr)).wait();
    if (await c.owner() !== aliceAddr) throw new Error('owner mismatch');
  });
  await t('previous owner loses admin rights', async () => {
    try { await c.transferOwnership(bobAddr); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  sec('encodeReportId (on-chain vs off-chain)');
  c = await deploy(owner);
  await t('on-chain matches off-chain keccak256', async () => {
    const uuid     = 'RPT-INTEGRATION-XYZ';
    const onChain  = await c.encodeReportId(uuid);
    const offChain = helpers.encodeReportId(uuid);
    if (onChain !== offChain) throw new Error(`on=${onChain} off=${offChain}`);
  });

  sec('Full workflow');
  c = await deploy(alice);
  await t('register→grant→verify→update→revoke', async () => {
    const id = rid();
    await (await c.registerReport(id, H1, SID, 'ipfs://test')).wait();
    if (!await c.verifyIntegrity(id, H1)) throw new Error('step1: verify');

    await (await c.grantAccess(id, bobAddr, PERM.VIEW | PERM.DOWNLOAD, nextWeek())).wait();
    if (!await c.hasAccess(id, bobAddr, PERM.VIEW)) throw new Error('step2: view');

    await (await c.updatePermissions(id, bobAddr, PERM.ALL)).wait();
    if (!await c.hasAccess(id, bobAddr, PERM.ANNOTATE)) throw new Error('step3: annotate');

    await (await c.updateReportHash(id, H2)).wait();
    if (await c.verifyIntegrity(id, H1)) throw new Error('step4: old hash should fail');
    if (!await c.verifyIntegrity(id, H2)) throw new Error('step4: new hash should pass');

    await (await c.revokeAccess(id, bobAddr)).wait();
    if (await c.hasAccess(id, bobAddr, PERM.VIEW)) throw new Error('step5: access revoked');

    await (await c.revokeReport(id)).wait();
    if (await c.verifyIntegrity(id, H2)) throw new Error('step6: revoked report');
  });
}

main().catch(err => { console.error(err); process.exit(1); });
