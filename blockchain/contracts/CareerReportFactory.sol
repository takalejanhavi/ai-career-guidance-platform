// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CareerReport.sol";

/**
 * @title CareerReportFactory
 * @notice Deploys and tracks CareerReport instances per institution.
 *         Enables multi-tenant architecture where each institution or
 *         deployment context has its own isolated contract.
 *
 * @dev This is an optional layer on top of CareerReport for large-scale
 *      deployments. For a single-institution setup, deploy CareerReport directly.
 */
contract CareerReportFactory {

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotOwner();
    error AlreadyDeployed(bytes32 institutionId);
    error NotDeployed(bytes32 institutionId);

    // ── State ─────────────────────────────────────────────────────────────────
    address public owner;
    uint256 public totalDeployments;

    struct Deployment {
        address contractAddress;
        address deployedBy;
        uint256 deployedAt;
        string  institutionName;
        bool    isActive;
    }

    /// @dev institutionId => Deployment
    mapping(bytes32 => Deployment) private _deployments;
    bytes32[] private _institutionIds;

    // ── Events ────────────────────────────────────────────────────────────────
    event ContractDeployed(
        bytes32 indexed institutionId,
        address indexed contractAddress,
        address indexed deployedBy,
        string          institutionName,
        uint256         timestamp
    );

    event DeploymentDeactivated(bytes32 indexed institutionId, uint256 timestamp);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Deploy ────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new CareerReport contract for an institution.
     *
     * @param institutionId   bytes32 identifier (keccak256 of institution UUID)
     * @param institutionName Human-readable name for the institution
     * @return contractAddress The deployed CareerReport address
     */
    function deploy(bytes32 institutionId, string calldata institutionName)
        external
        onlyOwner
        returns (address contractAddress)
    {
        if (_deployments[institutionId].contractAddress != address(0)) {
            revert AlreadyDeployed(institutionId);
        }

        CareerReport instance = new CareerReport();

        _deployments[institutionId] = Deployment({
            contractAddress: address(instance),
            deployedBy:      msg.sender,
            deployedAt:      block.timestamp,
            institutionName: institutionName,
            isActive:        true
        });

        _institutionIds.push(institutionId);
        totalDeployments++;

        emit ContractDeployed(
            institutionId,
            address(instance),
            msg.sender,
            institutionName,
            block.timestamp
        );

        return address(instance);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    function getDeployment(bytes32 institutionId)
        external
        view
        returns (Deployment memory)
    {
        if (_deployments[institutionId].contractAddress == address(0)) {
            revert NotDeployed(institutionId);
        }
        return _deployments[institutionId];
    }

    function getContractAddress(bytes32 institutionId)
        external
        view
        returns (address)
    {
        return _deployments[institutionId].contractAddress;
    }

    function getAllInstitutions()
        external
        view
        returns (bytes32[] memory)
    {
        return _institutionIds;
    }

    function deactivate(bytes32 institutionId) external onlyOwner {
        _deployments[institutionId].isActive = false;
        emit DeploymentDeactivated(institutionId, block.timestamp);
    }
}
