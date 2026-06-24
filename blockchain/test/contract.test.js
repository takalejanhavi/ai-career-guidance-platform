'use strict';

/**
 * Contract test runner — ethers.js v6 / CareerReport v2.
 *
 * Runs against Hardhat Network (in-process) or a local node.
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

// ── Provider ───────────────────────────────────────────────────────
async function getProvider() {
  try {
    const hre      = require('hardhat');
    // BrowserProvider wraps the Hardhat EIP-1193 in-process provider for ethers v6
    const provider = new ethers.BrowserProvider(hre.network.provider);
    await provider.getBlockNumber();
    return { provider, type: 'hardhat-in-process' };
  } catch {}

  try {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    await provider.getBlockNumber();
    return { provider, type: 'external-node' };
  } catch {}

  return null;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   CareerReport v2 Contract Tests                     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const conn = await getProvider();
  if (!conn) {
    console.log('  !  No Ethereum provider available.');
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
  console.log(`\n${'='.repeat(54)}`);
  console.log(`  ${p} passed | ${f} failed | ${p + f} total`);
  if (errors.length) {
    console.log('\n  Failures:');
    errors.forEach(e => console.log(`    x ${e.name}`));
  }
  console.log(`${'='.repeat(54)}\n`);
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
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: true,  expiresAt: 0 }), 'revoked');
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: 0 }), 'active');
    const past = Math.floor(Date.now() / 1000) - 100;
    assert(helpers.grantStatus({ grantedAt: 1, isRevoked: false, expiresAt: past }), 'expired');
  });
}

// ── Contract tests (requires network) ─────────────────────────────
async function runContractTests(provider) {
  await runPureTests();

  // ── CHANGED: ethers v6 fix ─────────────────────────────────────
  //
  //   WRONG (ethers v5 pattern — crashes in v6):
  //     const signers = await provider.listAccounts();
  //     const owner   = await provider.getSigner(signers[0]);
  //
  //   In ethers v6, listAccounts() returns JsonRpcSigner[], not string[].
  //   Passing a signer object to getSigner() makes it call .toLowerCase()
  //   on the object, which throws "address.toLowerCase is not a function".
  //
  //   CORRECT (ethers v6): getSigner(index: number) — numeric index only.
  //
  const owner = await provider.getSigner(0); // CHANGED: was provider.getSigner(signers[0])
  const alice = await provider.getSigner(1); // CHANGED: was provider.getSigner(signers[1])
  const bob   = await provider.getSigner(2); // CHANGED: was provider.getSigner(signers[2])
  const carol = await provider.getSigner(3); // CHANGED: was provider.getSigner(signers[3])

  // CHANGED: removed intermediate `signers` array entirely — it is no longer needed
  const ownerAddr = await owner.getAddress();
  const aliceAddr = await alice.getAddress();
  const bobAddr   = await bob.getAddress();
  const carolAddr = await carol.getAddress();

  // ── CHANGED: artifact loading ──────────────────────────────────
  //
  //   WRONG: loaded non-existent CareerReport.abi.json and CareerReport.bin
  //   Hardhat compile does NOT produce separate .abi.json / .bin files.
  //   It produces a single CareerReport.json with abi + bytecode fields.
  //
  const ARTIFACT_PATH = path.join(            // CHANGED: was ABI_PATH + BIN_PATH pair
    __dirname,
    '../artifacts/contracts/CareerReport.sol/CareerReport.json'
  );
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')); // CHANGED: single JSON
  const abi      = artifact.abi;              // CHANGED: was JSON.parse(readFileSync(ABI_PATH))
  const bytecode = artifact.bytecode;         // CHANGED: was '0x' + readFileSync(BIN_PATH); already has 0x

  async function deploy(signer) {
    const factory  = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  // Helpers
  function rh()  { return '0x' + crypto.randomBytes(32).toString('hex'); }
  function rid() { return helpers.encodeReportId('RPT-' + Math.random().toString(36).slice(2)); }

  // CHANGED: H1-H3 only (no SID / PERM — contract v2 removed all access control)
  const ZERO = ethers.ZeroHash;
  const H1   = rh();
  const H2   = rh();
  const H3   = rh();

  // ── Deployment ─────────────────────────────────────────────────
  sec('Deployment');
  let c = await deploy(owner);

  await t('deploys with bytecode at address', async () => { // CHANGED: was "owner is deployer" (no owner in v2)
    const addr = await c.getAddress();
    const code = await provider.getCode(addr);
    if (code === '0x') throw new Error('no bytecode at deployed address');
  });

  await t('reports mapping returns zero struct for unknown id', async () => { // CHANGED: was "starts unpaused" (no pause in v2)
    const raw = await c.reports(rid());
    if (raw.owner !== ethers.ZeroAddress) throw new Error('owner should be zero address');
  });

  // CHANGED: entire "PERM constants" test removed — contract v2 has no permission system

  // ── registerReport(bytes32, bytes32) ───────────────────────────
  sec('registerReport(bytes32, bytes32)'); // CHANGED: was registerReport with 4 args
  c = await deploy(alice);

  await t('anchors pdfHash, owner and timestamp', async () => { // CHANGED: uses 2-arg v2 API
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: was registerReport(id, H1, SID, 'ipfs://test')
    const r = await c.getReport(id);
    if (r.pdfHash !== H1)      throw new Error(`pdfHash: ${r.pdfHash}`);
    if (r.owner   !== aliceAddr) throw new Error(`owner: ${r.owner}`);
    if (r.timestamp === 0n)    throw new Error('timestamp should be non-zero');
    // CHANGED: removed r.isRevoked check — field removed in v2
  });

  await t('reportExists returns false then true', async () => { // CHANGED: replaces "increments totalReports" (no totalReports in v2)
    const id = rid();
    if (await c.reportExists(id)) throw new Error('should be false before registration');
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    if (!await c.reportExists(id)) throw new Error('should be true after registration');
  });

  await t('public reports mapping readable directly', async () => {
    const id = rid();
    await (await c.registerReport(id, H2)).wait(); // CHANGED: 2-arg v2 call
    const raw = await c.reports(id);               // CHANGED: reads v2 struct (pdfHash, owner, timestamp)
    if (raw.pdfHash !== H2)      throw new Error(`pdfHash: ${raw.pdfHash}`);
    if (raw.owner   !== aliceAddr) throw new Error(`owner: ${raw.owner}`);
  });

  await t('emits Registered event with correct args', async () => {
    const id      = rid();
    const receipt = await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    // CHANGED: ethers v6 event parsing — use receipt.logs + interface.parseLog()
    // ethers v5 used receipt.events[] which no longer exists in v6
    const iface   = c.interface;
    const log     = receipt.logs.find(l => {
      try { return iface.parseLog(l)?.name === 'Registered'; } catch { return false; }
    });
    if (!log) throw new Error('Registered event not found in receipt.logs');
    const parsed = iface.parseLog(log);
    if (parsed.args.pdfHash !== H1)       throw new Error(`event pdfHash: ${parsed.args.pdfHash}`);
    if (parsed.args.owner   !== aliceAddr) throw new Error(`event owner: ${parsed.args.owner}`);
  });

  await t('reverts ZeroHash on zero pdfHash', async () => {
    try { await c.registerReport(rid(), ZERO); throw new Error('should revert'); } // CHANGED: 2-arg v2 call
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  await t('reverts AlreadyRegistered on duplicate reportId', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    try { await c.registerReport(id, H2); throw new Error('should revert'); } // CHANGED: 2-arg v2 call
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  // ── verifyIntegrity(bytes32, bytes32) ──────────────────────────
  sec('verifyIntegrity(bytes32, bytes32)');
  c = await deploy(alice);

  await t('returns true for correct hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    if (!await c.verifyIntegrity(id, H1)) throw new Error('should be valid');
  });

  await t('returns false for wrong hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    if (await c.verifyIntegrity(id, H2)) throw new Error('should be invalid');
  });

  await t('returns false for unknown report', async () => {
    if (await c.verifyIntegrity(rid(), H1)) throw new Error('ghost should be invalid');
  });

  // CHANGED: removed "returns false after revokeReport" — revokeReport removed in v2

  await t('false then true after updateReportHash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    await (await c.updateReportHash(id, H2)).wait();
    if ( await c.verifyIntegrity(id, H1)) throw new Error('old hash should fail');
    if (!await c.verifyIntegrity(id, H2)) throw new Error('new hash should pass');
  });

  // ── updateReportHash(bytes32, bytes32) ─────────────────────────
  sec('updateReportHash(bytes32, bytes32)');
  c = await deploy(alice);

  await t('updates pdfHash and emits HashUpdated', async () => {
    const id      = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    const receipt = await (await c.updateReportHash(id, H2)).wait();
    // CHANGED: ethers v6 event parsing via receipt.logs (not receipt.events)
    const iface   = c.interface;
    const log     = receipt.logs.find(l => {
      try { return iface.parseLog(l)?.name === 'HashUpdated'; } catch { return false; }
    });
    if (!log) throw new Error('HashUpdated event not found');
    const r = await c.getReport(id);
    if (r.pdfHash !== H2) throw new Error(`pdfHash after update: ${r.pdfHash}`);
  });

  await t('reverts NotFound for unknown report', async () => {
    try { await c.updateReportHash(rid(), H2); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  await t('reverts NotRegistrant for non-owner caller', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    // CHANGED: contract.connect(signer) is unchanged in v6
    try { await c.connect(bob).updateReportHash(id, H2); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  await t('reverts ZeroHash for zero new hash', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    try { await c.updateReportHash(id, ZERO); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  // ── getReport(bytes32) ─────────────────────────────────────────
  sec('getReport(bytes32)');
  c = await deploy(alice);

  await t('returns Report{pdfHash, owner, timestamp}', async () => { // CHANGED: v2 struct only has 3 fields
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    const r = await c.getReport(id);
    if (r.pdfHash !== H1)                   throw new Error('pdfHash mismatch');
    if (r.owner   !== aliceAddr)             throw new Error('owner mismatch');
    if (typeof r.timestamp !== 'bigint')     throw new Error('timestamp must be bigint');
    // CHANGED: removed r.studentId, r.blockNumber, r.metadataURI, r.isRevoked — all removed in v2
  });

  await t('reverts NotFound for unregistered id', async () => {
    try { await c.getReport(rid()); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
  });

  // ── reportExists(bytes32) ──────────────────────────────────────
  sec('reportExists(bytes32)');
  c = await deploy(alice);

  await t('returns false before registration', async () => {
    if (await c.reportExists(rid())) throw new Error('should be false');
  });

  await t('returns true after registration', async () => {
    const id = rid();
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    if (!await c.reportExists(id)) throw new Error('should be true');
  });

  // ── Struct packing — 2 storage slots ──────────────────────────
  sec('Struct packing (owner + uint96 timestamp in 1 slot)'); // CHANGED: new section for v2 optimization

  await t('owner address preserved exactly after packing', async () => {
    const id = rid();
    c = await deploy(alice);
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    const r = await c.getReport(id);
    // CHANGED: compare lowercased — ethers v6 returns checksummed addresses
    if (r.owner.toLowerCase() !== aliceAddr.toLowerCase())
      throw new Error(`packed owner wrong: ${r.owner}`);
  });

  await t('timestamp fits uint96 and is within 60s of now', async () => { // CHANGED: new v2-specific test
    const id  = rid();
    c = await deploy(alice);
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    const r   = await c.getReport(id);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (r.timestamp < now - 60n || r.timestamp > now + 60n)
      throw new Error(`timestamp out of range: ${r.timestamp}`);
  });

  // CHANGED: removed grantAccess / revokeAccess section — access control removed in v2
  // CHANGED: removed updatePermissions section — removed in v2
  // CHANGED: removed pause / unpause section — removed in v2
  // CHANGED: removed ownership transfer section — removed in v2
  // CHANGED: removed on-chain encodeReportId section — pure utility removed in v2

  // ── Full workflow ──────────────────────────────────────────────
  sec('Full workflow');
  c = await deploy(alice);

  await t('register -> exists -> verify -> update -> verify-new', async () => { // CHANGED: removed revoke step (no v2 revoke)
    const id = rid();

    // step 1: register
    await (await c.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    if (!await c.reportExists(id))        throw new Error('step1: reportExists');
    if (!await c.verifyIntegrity(id, H1)) throw new Error('step1: verifyIntegrity');

    // step 2: update hash
    await (await c.updateReportHash(id, H2)).wait();
    if ( await c.verifyIntegrity(id, H1)) throw new Error('step2: old hash should fail');
    if (!await c.verifyIntegrity(id, H2)) throw new Error('step2: new hash should pass');

    // step 3: update again — verify idempotent
    await (await c.updateReportHash(id, H3)).wait();
    if ( await c.verifyIntegrity(id, H2)) throw new Error('step3: H2 should fail');
    if (!await c.verifyIntegrity(id, H3)) throw new Error('step3: H3 should pass');
  });

  await t('two reports are fully independent', async () => { // CHANGED: new test for isolation
    const id1 = rid(), id2 = rid();
    await (await c.registerReport(id1, H1)).wait(); // CHANGED: 2-arg v2 call
    await (await c.registerReport(id2, H2)).wait(); // CHANGED: 2-arg v2 call
    if (!await c.verifyIntegrity(id1, H1)) throw new Error('id1 verify');
    if (!await c.verifyIntegrity(id2, H2)) throw new Error('id2 verify');
    // updating id1 must not corrupt id2
    await (await c.updateReportHash(id1, H3)).wait();
    if (!await c.verifyIntegrity(id2, H2)) throw new Error('id2 should be unchanged');
    if ( await c.verifyIntegrity(id2, H3)) throw new Error('id2 should not carry id1 hash');
  });

  await t('different signers can each register separate reports', async () => { // CHANGED: new signer-isolation test
    const id1 = rid(), id2 = rid(), id3 = rid();
    const cAlice  = c.connect(alice);
    const cBob    = c.connect(bob);
    const cCarol  = c.connect(carol);
    await (await cAlice.registerReport(id1, H1)).wait(); // CHANGED: 2-arg v2 call
    await (await cBob  .registerReport(id2, H2)).wait(); // CHANGED: 2-arg v2 call
    await (await cCarol.registerReport(id3, H3)).wait(); // CHANGED: 2-arg v2 call
    const r1 = await c.getReport(id1);
    const r2 = await c.getReport(id2);
    const r3 = await c.getReport(id3);
    if (r1.owner.toLowerCase() !== aliceAddr.toLowerCase()) throw new Error('id1 owner');
    if (r2.owner.toLowerCase() !== bobAddr.toLowerCase())   throw new Error('id2 owner');
    if (r3.owner.toLowerCase() !== carolAddr.toLowerCase()) throw new Error('id3 owner');
  });

  await t('non-registrant cannot update another owner\'s report', async () => { // CHANGED: new cross-owner guard test
    const id = rid();
    const cAlice = c.connect(alice);
    await (await cAlice.registerReport(id, H1)).wait(); // CHANGED: 2-arg v2 call
    // bob tries to update alice's report — must fail with NotRegistrant
    try { await c.connect(bob).updateReportHash(id, H2); throw new Error('should revert'); }
    catch (e) { if (e.message.includes('should revert')) throw e; }
    // alice's original hash must be intact
    if (!await c.verifyIntegrity(id, H1)) throw new Error('hash should be unchanged');
  });
}

main().catch(err => { console.error(err); process.exit(1); });
