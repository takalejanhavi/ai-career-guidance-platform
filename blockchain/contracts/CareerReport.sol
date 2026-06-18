// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CareerReport
 * @author CareerAI Platform
 * @notice Stores SHA-256 hashes of career guidance reports on-chain,
 *         manages granular access permissions, and enables cryptographic
 *         integrity verification.
 *
 * @dev Design decisions:
 *   - Reports are identified by a bytes32 reportId (keccak256 of off-chain UUID).
 *   - The PDF SHA-256 hash is stored as bytes32.
 *   - Access is granted per (reportId, grantee) pair with optional expiry.
 *   - The contract owner can pause all state-changing operations (emergency circuit breaker).
 *   - All critical operations emit events for off-chain indexing.
 *   - Uses custom errors instead of require strings for gas efficiency.
 */
contract CareerReport {

    // ── Custom errors ─────────────────────────────────────────────────────────

    error NotOwner();
    error NotReportOwner(bytes32 reportId, address caller);
    error ReportAlreadyExists(bytes32 reportId);
    error ReportNotFound(bytes32 reportId);
    error InvalidHash();
    error AccessNotGranted(bytes32 reportId, address grantee);
    error AccessAlreadyGranted(bytes32 reportId, address grantee);
    error AccessExpired(bytes32 reportId, address grantee);
    error InvalidExpiry(uint256 expiry);
    error ZeroAddress();
    error Paused();
    error SelfGrant();
    error EmptyMetadata();

    // ── Data structures ───────────────────────────────────────────────────────

    /**
     * @notice Immutable report record stored on-chain.
     * @param pdfHash        SHA-256 hash of the PDF as bytes32
     * @param owner          Address that registered this report
     * @param studentId      Off-chain student identifier (hashed for privacy)
     * @param timestamp      Block timestamp when report was registered
     * @param blockNumber    Block number of registration
     * @param metadataURI    Optional IPFS URI or URL to off-chain metadata
     * @param isRevoked      Whether the report has been revoked by the owner
     */
    struct Report {
        bytes32 pdfHash;
        address owner;
        bytes32 studentId;
        uint256 timestamp;
        uint256 blockNumber;
        string  metadataURI;
        bool    isRevoked;
    }

    /**
     * @notice Access grant record.
     * @param grantedBy   Address that created this grant (must be report owner)
     * @param grantedAt   Timestamp when access was granted
     * @param expiresAt   Expiry timestamp (0 = never expires)
     * @param permissions Bitmask: bit 0=view, bit 1=download, bit 2=annotate
     * @param isRevoked   Whether this specific grant has been revoked
     */
    struct AccessGrant {
        address grantedBy;
        uint256 grantedAt;
        uint256 expiresAt;
        uint8   permissions;
        bool    isRevoked;
    }

    // Permission bitmask constants
    uint8 public constant PERM_VIEW       = 0x01;  // bit 0
    uint8 public constant PERM_DOWNLOAD   = 0x02;  // bit 1
    uint8 public constant PERM_ANNOTATE   = 0x04;  // bit 2
    uint8 public constant PERM_ALL        = 0x07;  // all three

    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;
    bool    public paused;
    uint256 public totalReports;
    uint256 public totalGrants;

    /// @dev reportId => Report
    mapping(bytes32 => Report) private _reports;

    /// @dev reportId => grantee => AccessGrant
    mapping(bytes32 => mapping(address => AccessGrant)) private _grants;

    /// @dev reportId => array of grantees (for enumeration)
    mapping(bytes32 => address[]) private _grantees;

    /// @dev owner address => list of their reportIds
    mapping(address => bytes32[]) private _ownerReports;

    // ── Events ────────────────────────────────────────────────────────────────

    event ReportRegistered(
        bytes32 indexed reportId,
        bytes32 indexed pdfHash,
        address indexed owner,
        bytes32         studentId,
        uint256         timestamp,
        uint256         blockNumber
    );

    event ReportRevoked(
        bytes32 indexed reportId,
        address indexed revokedBy,
        uint256         timestamp
    );

    event ReportHashUpdated(
        bytes32 indexed reportId,
        bytes32         oldHash,
        bytes32         newHash,
        address indexed updatedBy,
        uint256         timestamp
    );

    event AccessGranted(
        bytes32 indexed reportId,
        address indexed grantedTo,
        address indexed grantedBy,
        uint8           permissions,
        uint256         expiresAt,
        uint256         timestamp
    );

    event AccessRevoked(
        bytes32 indexed reportId,
        address indexed revokedFrom,
        address indexed revokedBy,
        uint256         timestamp
    );

    event AccessPermissionsUpdated(
        bytes32 indexed reportId,
        address indexed grantee,
        uint8           oldPermissions,
        uint8           newPermissions,
        uint256         timestamp
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event ContractPaused(address indexed by, uint256 timestamp);
    event ContractUnpaused(address indexed by, uint256 timestamp);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReportOwner(bytes32 reportId) {
        if (_reports[reportId].owner != msg.sender) {
            revert NotReportOwner(reportId, msg.sender);
        }
        _;
    }

    modifier reportExists(bytes32 reportId) {
        if (_reports[reportId].owner == address(0)) {
            revert ReportNotFound(reportId);
        }
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ── Report management ─────────────────────────────────────────────────────

    /**
     * @notice Register a new career report hash on-chain.
     * @dev    Caller becomes the report owner and can manage access.
     *         reportId should be keccak256(abi.encodePacked(offChainReportUUID)).
     *
     * @param reportId    Unique identifier (bytes32)
     * @param pdfHash     SHA-256 hash of the PDF (bytes32)
     * @param studentId   Hashed student identifier (bytes32) for privacy
     * @param metadataURI Optional IPFS/URL pointing to off-chain metadata
     */
    function registerReport(
        bytes32 reportId,
        bytes32 pdfHash,
        bytes32 studentId,
        string calldata metadataURI
    ) external whenNotPaused {
        if (pdfHash == bytes32(0))    revert InvalidHash();
        if (_reports[reportId].owner != address(0)) {
            revert ReportAlreadyExists(reportId);
        }

        _reports[reportId] = Report({
            pdfHash:     pdfHash,
            owner:       msg.sender,
            studentId:   studentId,
            timestamp:   block.timestamp,
            blockNumber: block.number,
            metadataURI: metadataURI,
            isRevoked:   false
        });

        _ownerReports[msg.sender].push(reportId);
        totalReports++;

        emit ReportRegistered(
            reportId,
            pdfHash,
            msg.sender,
            studentId,
            block.timestamp,
            block.number
        );
    }

    /**
     * @notice Update the PDF hash of an existing report.
     * @dev    Only callable by the report owner (e.g., after PDF regeneration).
     *         Emits ReportHashUpdated with old and new hashes for audit trail.
     *
     * @param reportId   The report to update
     * @param newPdfHash The new SHA-256 hash
     */
    function updateReportHash(
        bytes32 reportId,
        bytes32 newPdfHash
    ) external whenNotPaused onlyReportOwner(reportId) {
        if (newPdfHash == bytes32(0)) revert InvalidHash();

        bytes32 oldHash = _reports[reportId].pdfHash;
        _reports[reportId].pdfHash = newPdfHash;

        emit ReportHashUpdated(
            reportId, oldHash, newPdfHash, msg.sender, block.timestamp
        );
    }

    /**
     * @notice Permanently revoke a report.
     * @dev    Revoked reports still exist on-chain (immutability) but
     *         verifyIntegrity will return false for them.
     *         All active grants are effectively nullified.
     *
     * @param reportId The report to revoke
     */
    function revokeReport(bytes32 reportId)
        external
        whenNotPaused
        onlyReportOwner(reportId)
    {
        _reports[reportId].isRevoked = true;
        emit ReportRevoked(reportId, msg.sender, block.timestamp);
    }

    // ── Access management ─────────────────────────────────────────────────────

    /**
     * @notice Grant access to a career report for a specific address.
     * @dev    Only the report owner can grant access.
     *         Overwrites any existing grant for the same grantee.
     *         PERM_VIEW is always included when granting any permission.
     *
     * @param reportId    The target report
     * @param grantee     Address to grant access to
     * @param permissions Bitmask (PERM_VIEW | PERM_DOWNLOAD | PERM_ANNOTATE)
     * @param expiresAt   Unix timestamp for expiry (0 = never expires)
     */
    function grantAccess(
        bytes32 reportId,
        address grantee,
        uint8   permissions,
        uint256 expiresAt
    )
        external
        whenNotPaused
        reportExists(reportId)
        onlyReportOwner(reportId)
    {
        if (grantee == address(0))    revert ZeroAddress();
        if (grantee == msg.sender)    revert SelfGrant();
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert InvalidExpiry(expiresAt);
        }

        // Always include VIEW permission
        uint8 perms = permissions | PERM_VIEW;

        bool isNew = _grants[reportId][grantee].grantedAt == 0;

        _grants[reportId][grantee] = AccessGrant({
            grantedBy:   msg.sender,
            grantedAt:   block.timestamp,
            expiresAt:   expiresAt,
            permissions: perms,
            isRevoked:   false
        });

        if (isNew) {
            _grantees[reportId].push(grantee);
            totalGrants++;
        }

        emit AccessGranted(
            reportId, grantee, msg.sender, perms, expiresAt, block.timestamp
        );
    }

    /**
     * @notice Revoke access for a specific grantee on a report.
     * @dev    Can be called by the report owner.
     *         Does not delete the grant record — marks it as revoked
     *         for auditability.
     *
     * @param reportId  The target report
     * @param grantee   Address to revoke access from
     */
    function revokeAccess(bytes32 reportId, address grantee)
        external
        whenNotPaused
        reportExists(reportId)
        onlyReportOwner(reportId)
    {
        AccessGrant storage grant = _grants[reportId][grantee];
        if (grant.grantedAt == 0) revert AccessNotGranted(reportId, grantee);

        grant.isRevoked = true;

        emit AccessRevoked(reportId, grantee, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the permissions of an existing access grant.
     * @dev    Useful for upgrading (e.g., add DOWNLOAD) or downgrading access.
     *
     * @param reportId       The target report
     * @param grantee        The grantee to update
     * @param newPermissions New permission bitmask
     */
    function updatePermissions(
        bytes32 reportId,
        address grantee,
        uint8   newPermissions
    )
        external
        whenNotPaused
        reportExists(reportId)
        onlyReportOwner(reportId)
    {
        AccessGrant storage grant = _grants[reportId][grantee];
        if (grant.grantedAt == 0) revert AccessNotGranted(reportId, grantee);
        if (grant.isRevoked)      revert AccessNotGranted(reportId, grantee);

        uint8 old = grant.permissions;
        grant.permissions = newPermissions | PERM_VIEW;

        emit AccessPermissionsUpdated(
            reportId, grantee, old, grant.permissions, block.timestamp
        );
    }

    /**
     * @notice Renew or change the expiry of an existing grant.
     *
     * @param reportId  The target report
     * @param grantee   The grantee
     * @param expiresAt New expiry timestamp (0 = never expires)
     */
    function renewAccess(
        bytes32 reportId,
        address grantee,
        uint256 expiresAt
    )
        external
        whenNotPaused
        reportExists(reportId)
        onlyReportOwner(reportId)
    {
        AccessGrant storage grant = _grants[reportId][grantee];
        if (grant.grantedAt == 0)  revert AccessNotGranted(reportId, grantee);
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert InvalidExpiry(expiresAt);
        }

        grant.expiresAt  = expiresAt;
        grant.isRevoked  = false;   // can be used to un-revoke with new expiry
    }

    // ── Verification ──────────────────────────────────────────────────────────

    /**
     * @notice Verify that a given hash matches the on-chain record.
     * @dev    Returns false if:
     *           - Report does not exist
     *           - Report has been revoked
     *           - Hash does not match
     *         This is the primary integrity-check function.
     *
     * @param reportId  The report to check
     * @param pdfHash   The hash to verify against the on-chain record
     * @return valid    True if hash matches and report is not revoked
     */
    function verifyIntegrity(bytes32 reportId, bytes32 pdfHash)
        external
        view
        returns (bool valid)
    {
        Report storage r = _reports[reportId];
        return (
            r.owner    != address(0) &&
            !r.isRevoked             &&
            r.pdfHash  == pdfHash
        );
    }

    /**
     * @notice Check whether an address has active access to a report
     *         with a specific permission bit.
     *
     * @param reportId   The report to check
     * @param grantee    The address to check
     * @param permission The specific permission bit to check (PERM_VIEW etc.)
     * @return hasAccess True if the grantee has active, unexpired access with that permission
     */
    function hasAccess(
        bytes32 reportId,
        address grantee,
        uint8   permission
    ) external view returns (bool) {
        // Report owner always has full access
        if (_reports[reportId].owner == grantee) return true;

        AccessGrant storage grant = _grants[reportId][grantee];
        if (grant.grantedAt == 0)  return false;
        if (grant.isRevoked)       return false;
        if (grant.expiresAt != 0 && block.timestamp > grant.expiresAt) return false;

        return (grant.permissions & permission) != 0;
    }

    /**
     * @notice Check access using the caller's own address.
     *
     * @param reportId   The report to check
     * @param permission The permission bit
     * @return True if caller has active access
     */
    function checkMyAccess(bytes32 reportId, uint8 permission)
        external
        view
        returns (bool)
    {
        if (_reports[reportId].owner == msg.sender) return true;

        AccessGrant storage grant = _grants[reportId][msg.sender];
        if (grant.grantedAt == 0)  return false;
        if (grant.isRevoked)       return false;
        if (grant.expiresAt != 0 && block.timestamp > grant.expiresAt) return false;

        return (grant.permissions & permission) != 0;
    }

    // ── Read functions ────────────────────────────────────────────────────────

    /**
     * @notice Get the full report record.
     */
    function getReport(bytes32 reportId)
        external
        view
        reportExists(reportId)
        returns (Report memory)
    {
        return _reports[reportId];
    }

    /**
     * @notice Get the stored hash for a report.
     *
     * @return pdfHash  The on-chain hash (bytes32(0) if report not found)
     */
    function getReportHash(bytes32 reportId)
        external
        view
        returns (bytes32 pdfHash)
    {
        return _reports[reportId].pdfHash;
    }

    /**
     * @notice Get the access grant record for a specific grantee.
     */
    function getAccessGrant(bytes32 reportId, address grantee)
        external
        view
        returns (AccessGrant memory)
    {
        return _grants[reportId][grantee];
    }

    /**
     * @notice List all grantees for a report.
     * @dev    Includes revoked and expired grantees (filter off-chain).
     *
     * @return grantees Array of grantee addresses
     */
    function getGrantees(bytes32 reportId)
        external
        view
        reportExists(reportId)
        returns (address[] memory)
    {
        return _grantees[reportId];
    }

    /**
     * @notice Get the count of active (non-revoked, non-expired) grants for a report.
     */
    function getActiveGrantCount(bytes32 reportId)
        external
        view
        returns (uint256 count)
    {
        address[] memory grantees = _grantees[reportId];
        for (uint256 i = 0; i < grantees.length; i++) {
            AccessGrant storage g = _grants[reportId][grantees[i]];
            if (!g.isRevoked && (g.expiresAt == 0 || g.expiresAt > block.timestamp)) {
                count++;
            }
        }
    }

    /**
     * @notice Get all report IDs registered by an owner address.
     */
    function getOwnerReports(address reportOwner)
        external
        view
        returns (bytes32[] memory)
    {
        return _ownerReports[reportOwner];
    }

    /**
     * @notice Check whether a report exists.
     */
    function reportExists_(bytes32 reportId) external view returns (bool) {
        return _reports[reportId].owner != address(0);
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    /**
     * @notice Transfer contract ownership.
     * @dev    New owner can pause/unpause and manage platform-level settings.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Pause all state-changing operations (emergency circuit breaker).
     */
    function pause() external onlyOwner {
        paused = true;
        emit ContractPaused(msg.sender, block.timestamp);
    }

    /**
     * @notice Resume normal operations.
     */
    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender, block.timestamp);
    }

    // ── Utility (pure/view helpers) ───────────────────────────────────────────

    /**
     * @notice Encode an off-chain UUID string into a bytes32 reportId.
     * @dev    Off-chain: use ethers.keccak256(ethers.toUtf8Bytes(uuid))
     */
    function encodeReportId(string calldata uuid)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(uuid));
    }

    /**
     * @notice Encode a hex SHA-256 hash string into bytes32.
     * @dev    Off-chain: use ethers.hexlify(ethers.toUtf8Bytes('0x'+hexHash))
     *         or pass directly as bytes32 from a 0x-prefixed 64-char hex string.
     */
    function encodeHash(bytes32 rawHash) external pure returns (bytes32) {
        return rawHash;
    }
}
