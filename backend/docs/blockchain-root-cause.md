# Blockchain Integration — Root Cause Analysis

## Executive Summary

The backend's `blockchain.service.js` was written against a **fictional contract ABI** that does not match `CareerReport.sol`. Every on-chain call from the backend will fail at runtime with an `execution reverted` error because the functions it tries to call (`storeHash`, `verifyHash`, `getTimestamp`) do not exist in the deployed contract.

---

## Bug 1 — Wrong function name: `storeHash()` vs `registerReport()`

### Location
`backend/src/services/blockchain.service.js` line 68

```js
// BROKEN — storeHash does not exist in CareerReport.sol
const gas = await contract.methods.storeHash(bytes32Hash).estimateGas({ from: account.address });
const receipt = await contract.methods.storeHash(bytes32Hash).send({ ... });
```

### What the contract actually requires
`CareerReport.sol` lines 208–232

```solidity
function registerReport(
    bytes32 reportId,      // keccak256 of the off-chain report UUID
    bytes32 pdfHash,       // SHA-256 of the PDF file as bytes32
    bytes32 studentId,     // keccak256 of the student ID (privacy)
    string calldata metadataURI
) external whenNotPaused
```

### Impact
- `storeHash` does not exist in the ABI. ethers/web3 will throw immediately on `estimateGas` because the function selector resolves to `0x00000000` (no match), causing `execution reverted` before any transaction is broadcast.
- Even if it did send, `storeHash` only accepts one argument (a bare hash). `registerReport` requires four arguments and ties the hash to a specific `reportId` and `studentId`. The whole on-chain data model is different.
- `report.blockchain.status` will always end up as `'failed'`, the audit log will log `blockchain.anchor_failed`, and students will never see their report verified on-chain.

---

## Bug 2 — Wrong function name: `verifyHash()` vs `verifyIntegrity()`

### Location
`backend/src/services/blockchain.service.js` line 81

```js
// BROKEN — verifyHash does not exist in CareerReport.sol
return contract.methods.verifyHash(bytes32Hash).call();
```

### What the contract actually requires
`CareerReport.sol` lines 291–305

```solidity
function verifyIntegrity(
    bytes32 reportId,  // must be the same reportId used during registerReport
    bytes32 pdfHash    // the hash to verify against the stored record
) external view returns (bool valid)
```

### Impact
- The call throws and `verifyBlockchain()` in `report.service.js` never reaches the on-chain check. The service falls back to its MongoDB-only check (`onChain && hashMatch`), which only looks at the database, not the blockchain.
- A tampered PDF whose database record was also altered would still show as "verified".

---

## Bug 3 — Phantom function: `getTimestamp()`

### Location
`backend/src/services/blockchain.service.js` lines 18–24 (ABI definition)

```js
{
  "name": "getTimestamp",   // does not exist in CareerReport.sol
  ...
}
```

### Impact
This function is never called by any production code path, so it causes no immediate runtime error. However, its presence in the ABI suggests the original service was written against a completely different contract. It is evidence that the ABI was hand-authored from imagination rather than generated from the actual compiled contract.

---

## Bug 4 — Wrong library: `web3.js` vs `ethers.js`

### Location
`backend/src/services/blockchain.service.js` lines 34–38

```js
const Web3 = require('web3');
web3Instance = new Web3(env.BLOCKCHAIN_RPC_URL);
```

### Impact
The standalone blockchain layer (`/blockchain/src/services/BlockchainService.js`) uses `ethers.js` v6. The backend uses `web3.js`. The two libraries have incompatible API surfaces:
- `web3.js` uses `contract.methods.fn().send()` / `.call()`
- `ethers.js` uses `contract.fn()` directly

Mixing the two in a monorepo creates two separate dependency trees (~2MB each), two sets of wallet management patterns, and two serialisation approaches for `bytes32` values. Unifying on ethers.js (which the standalone layer already uses and tests) eliminates this split.

---

## Bug 5 — Missing arguments passed from worker

### Location
`backend/src/jobs/workers.js` line 74

```js
const result = await blockchain.anchorHash(hash);
```

The worker passes only the raw SHA-256 `hash` string. But `registerReport()` requires:
1. `reportId` — the keccak256-encoded MongoDB report `_id` or UUID
2. `pdfHash` — the SHA-256 hash (✓ already available)
3. `studentId` — the keccak256-encoded student identifier
4. `metadataURI` — optional IPFS/URL string

The worker has `reportId` and implicitly has access to `userId` from `job.data`, but it never fetches the `studentId` or constructs the `reportId` bytes32. This must also be fixed in the worker alongside the service.

---

## Summary of Broken → Fixed Mapping

| Broken (current) | Fixed (correct) |
|-----------------|-----------------|
| `contract.methods.storeHash(hash)` | `contract.registerReport(reportId, pdfHash, studentId, metadataURI)` |
| `contract.methods.verifyHash(hash)` | `contract.verifyIntegrity(reportId, pdfHash)` |
| `contract.methods.getTimestamp(hash)` | (removed — `getReport(reportId)` returns timestamp) |
| `require('web3')` | `require('ethers')` |
| Inline ABI (3 phantom functions) | Real ABI from compiled artifacts |
| `anchorHash(hash)` called with 1 arg | `registerReport({reportId, pdfHash, studentId})` called with full data |
| Worker passes only `hash` | Worker passes `reportId`, `hash`, `userId` to service |
| `verifyBlockchain` only checks MongoDB | `verifyBlockchain` calls on-chain `verifyIntegrity` |
