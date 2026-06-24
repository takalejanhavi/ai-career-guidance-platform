// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  CareerReport
 * @notice Minimal on-chain integrity registry for AI career guidance reports.
 *
 *         Sole responsibility: prove that report <reportId> had PDF hash
 *         <pdfHash> at <timestamp>, registered by <owner>.  Nothing more.
 *
 *         Access control, permissions, psychologist grants, metadata,
 *         audit logs, and all business logic live off-chain (MongoDB/Node.js).
 *
 * @dev    Storage layout — each Report occupies exactly 2 storage slots:
 *           slot 0  pdfHash   (bytes32, 32 bytes)
 *           slot 1  owner     (address, 20 bytes)
 *                   timestamp (uint96,  12 bytes)  ← packed with owner
 *
 *         uint96 timestamp overflows in year ~2.5 trillion CE.
 *         Existence sentinel: owner == address(0) → not registered.
 */
contract CareerReport {

    // ── Custom errors ─────────────────────────────────────────────────────────

    error NotRegistrant(bytes32 reportId, address caller);
    error AlreadyRegistered(bytes32 reportId);
    error NotFound(bytes32 reportId);
    error ZeroHash();

    // ── Report struct ─────────────────────────────────────────────────────────

    struct Report {
        bytes32 pdfHash;    // slot 0
        address owner;      // slot 1, bytes 0-19
        uint96  timestamp;  // slot 1, bytes 20-31  (packed with owner)
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    /// @notice Public mapping so any caller can read raw report data directly.
    mapping(bytes32 => Report) public reports;

    // ── Events ────────────────────────────────────────────────────────────────

    /// @dev Three indexed fields = maximum Ethereum allows per event.
    event Registered(
        bytes32 indexed reportId,
        bytes32 indexed pdfHash,
        address indexed owner,
        uint256         timestamp
    );

    event HashUpdated(
        bytes32 indexed reportId,
        bytes32         newHash,
        uint256         timestamp
    );

    // ── Write functions ───────────────────────────────────────────────────────

    /**
     * @notice Anchor a report hash on-chain.
     *         msg.sender becomes the permanent registrant.
     *
     * @param reportId  keccak256(abi.encodePacked(mongoReportId)) — computed off-chain
     *                  see: ethers.keccak256(ethers.toUtf8Bytes(reportId))
     * @param pdfHash   SHA-256(pdfBytes) cast to bytes32 — computed off-chain
     *                  see: ethers.hexlify(sha256Buffer)
     */
    function registerReport(bytes32 reportId, bytes32 pdfHash) external {
        if (pdfHash == bytes32(0))                 revert ZeroHash();
        if (reports[reportId].owner != address(0)) revert AlreadyRegistered(reportId);

        reports[reportId] = Report({
            pdfHash  : pdfHash,
            owner    : msg.sender,
            timestamp: uint96(block.timestamp)
        });

        emit Registered(reportId, pdfHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the stored hash after a report PDF is regenerated.
     *         Only the original registrant can call this.
     *
     * @param reportId    Report to update
     * @param newPdfHash  SHA-256 of the new PDF version
     */
    function updateReportHash(bytes32 reportId, bytes32 newPdfHash) external {
        Report storage r = reports[reportId];
        if (r.owner == address(0))    revert NotFound(reportId);
        if (r.owner != msg.sender)    revert NotRegistrant(reportId, msg.sender);
        if (newPdfHash == bytes32(0)) revert ZeroHash();

        r.pdfHash = newPdfHash;

        emit HashUpdated(reportId, newPdfHash, block.timestamp);
    }

    // ── Read functions ────────────────────────────────────────────────────────

    /**
     * @notice Returns true iff the supplied hash matches the on-chain record.
     *         Primary public verification function.
     *
     * @param reportId  Report to check
     * @param pdfHash   Hash to verify
     * @return valid    False if report is unknown or hash mismatches
     */
    function verifyIntegrity(bytes32 reportId, bytes32 pdfHash)
        external
        view
        returns (bool valid)
    {
        Report storage r = reports[reportId];
        return r.owner != address(0) && r.pdfHash == pdfHash;
    }

    /**
     * @notice Fetch the full on-chain record.
     * @dev    Reverts with NotFound if the report was never registered.
     */
    function getReport(bytes32 reportId)
        external
        view
        returns (Report memory)
    {
        if (reports[reportId].owner == address(0)) revert NotFound(reportId);
        return reports[reportId];
    }

    /**
     * @notice Check whether a report has been registered.
     */
    function reportExists(bytes32 reportId) external view returns (bool) {
        return reports[reportId].owner != address(0);
    }
}
