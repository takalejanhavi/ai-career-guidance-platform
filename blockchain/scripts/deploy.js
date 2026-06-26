'use strict';
/**
 * Deployment Script — CareerReport & CareerReportFactory
 * ========================================================
 * Deploys both contracts, optionally verifies on Polygonscan,
 * and writes a deployment manifest to deployments/<network>.json.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network polygon_mumbai
 */

const { ethers, network, run } = require('hardhat');
const fs   = require('fs');
const path = require('path');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   MentorChain Blockchain — Deployment Script         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Signers ───────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log(`Network    : ${network.name} (chainId: ${network.config.chainId || 'unknown'})`);
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Balance    : ${ethers.formatEther(balance)} ETH/MATIC\n`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has zero balance — fund it before deploying');
  }

  const deployments = {};

  // ── Deploy CareerReport ───────────────────────────────────────
  console.log('Deploying CareerReport…');
  const t0 = Date.now();

  const CareerReport        = await ethers.getContractFactory('CareerReport');
  const gasEstimate         = await ethers.provider.estimateGas(
    await CareerReport.getDeployTransaction()
  );
  console.log(`  Estimated gas : ${gasEstimate.toLocaleString()}`);

  const careerReport        = await CareerReport.deploy();
  await careerReport.waitForDeployment();
  const crAddress           = await careerReport.getAddress();
  const crReceipt           = await careerReport.deploymentTransaction().wait(1);

  console.log(`  ✓ CareerReport deployed`);
  console.log(`    Address      : ${crAddress}`);
  console.log(`    Tx hash      : ${crReceipt.hash}`);
  console.log(`    Block        : ${crReceipt.blockNumber}`);
  console.log(`    Gas used     : ${crReceipt.gasUsed.toLocaleString()}`);
  console.log(`    Time         : ${Date.now() - t0}ms\n`);

  deployments.CareerReport = {
    address:     crAddress,
    txHash:      crReceipt.hash,
    blockNumber: crReceipt.blockNumber,
    gasUsed:     crReceipt.gasUsed.toString(),
    deployedAt:  new Date().toISOString(),
    deployer:    deployer.address,
  };

  // ── Deploy CareerReportFactory ────────────────────────────────
  console.log('Deploying CareerReportFactory…');
  const t1 = Date.now();

  const CareerReportFactory = await ethers.getContractFactory('CareerReportFactory');
  const factory             = await CareerReportFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress      = await factory.getAddress();
  const factReceipt         = await factory.deploymentTransaction().wait(1);

  console.log(`  ✓ CareerReportFactory deployed`);
  console.log(`    Address      : ${factoryAddress}`);
  console.log(`    Tx hash      : ${factReceipt.hash}`);
  console.log(`    Block        : ${factReceipt.blockNumber}`);
  console.log(`    Gas used     : ${factReceipt.gasUsed.toLocaleString()}`);
  console.log(`    Time         : ${Date.now() - t1}ms\n`);

  deployments.CareerReportFactory = {
    address:     factoryAddress,
    txHash:      factReceipt.hash,
    blockNumber: factReceipt.blockNumber,
    gasUsed:     factReceipt.gasUsed.toString(),
    deployedAt:  new Date().toISOString(),
    deployer:    deployer.address,
  };

  // ── Verify ownership ──────────────────────────────────────────
  // CHANGED: CareerReport v2 has no owner — ownership concept removed to save gas.
  //          CareerReportFactory still has its own owner state variable.
  const factOwner = await factory.owner();
  console.log(`Contract owners:`);
  console.log(`  CareerReport         : (none — v2 is permissionless, no owner state)`);
  console.log(`  CareerReportFactory  : ${factOwner}`);

  if (factOwner.toLowerCase() !== deployer.address.toLowerCase()) { // CHANGED: only check factory
    throw new Error('CareerReportFactory owner mismatch');
  }

  // ── Save deployment manifest ──────────────────────────────────
  const netName    = network.name;
  const deployDir  = path.join(__dirname, '..', 'deployments');
  const deployFile = path.join(deployDir, `${netName}.json`);

  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const manifest = {
    network:    netName,
    chainId:    network.config.chainId || null,
    deployedAt: new Date().toISOString(),
    contracts:  deployments,
  };

  fs.writeFileSync(deployFile, JSON.stringify(manifest, null, 2));
  console.log(`\nDeployment manifest saved → ${deployFile}`);

  // ── Polygonscan verification (skip for local) ─────────────────
  if (netName !== 'hardhat' && netName !== 'localhost') {
    console.log('\nWaiting 5 blocks for Etherscan indexing…');
    await new Promise(r => setTimeout(r, 30_000));

    try {
      await run('verify:verify', { address: crAddress, constructorArguments: [] });
      console.log('✓ CareerReport verified on Polygonscan');
    } catch (e) {
      console.warn('Verification skipped (already verified or key missing):', e.message);
    }

    try {
      await run('verify:verify', { address: factoryAddress, constructorArguments: [] });
      console.log('✓ CareerReportFactory verified on Polygonscan');
    } catch (e) {
      console.warn('Factory verification skipped:', e.message);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   Deployment complete!                               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  CONTRACT_ADDRESS=${crAddress}`);
  console.log(`  FACTORY_ADDRESS=${factoryAddress}\n`);

  return deployments;
}

main().catch(err => {
  console.error('\n❌  Deployment failed:', err.message);
  process.exit(1);
});
