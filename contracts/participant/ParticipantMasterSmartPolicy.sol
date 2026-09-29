// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./ParticipantMutableAsset.sol";

// A participant asset is a role license. Its holder may sell it only to an organization
// qualified for the license type and for every capability the license carries.
contract ParticipantMasterSmartPolicy is SmartPolicy {
    bytes4 private constant MINT = bytes4(keccak256("mint(address,address,address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));

    address public immutable administrator;
    bool public transfersEnabled = true;
    mapping(address => bool) public authorizedIssuers;
    mapping(address => mapping(bytes32 => bool)) public qualifications;

    modifier onlyAdministrator() {
        require(msg.sender == administrator, "Caller is not the policy administrator");
        _;
    }

    constructor(address administratorAddress) {
        require(administratorAddress != address(0), "Invalid administrator");
        administrator = administratorAddress;
        authorizedIssuers[administratorAddress] = true;
    }

    function setAuthorizedIssuer(address account, bool allowed) external onlyAdministrator {
        authorizedIssuers[account] = allowed;
    }

    function setQualification(
        address account,
        bytes32 qualification,
        bool qualified
    ) external onlyAdministrator {
        qualifications[account][qualification] = qualified;
    }

    function setTransfersEnabled(bool enabled) external onlyAdministrator {
        transfersEnabled = enabled;
    }

    function isQualifiedFor(address account, address license) public view returns (bool) {
        ParticipantMutableAsset participant = ParticipantMutableAsset(license);
        if (!qualifications[account][participant.participantType()]) {
            return false;
        }
        bytes32[] memory capabilities = participant.getCapabilities();
        for (uint256 i = 0; i < capabilities.length; i++) {
            if (!qualifications[account][capabilities[i]]) {
                return false;
            }
        }
        return true;
    }

    function isHolderQualified(address license) external view returns (bool) {
        return isQualifiedFor(MutableAsset(license).getHolder(), license);
    }

    function _addressAt(bytes memory action, uint256 offset) private pure returns (address value) {
        require(action.length >= offset + 32, "Malformed policy action");
        assembly {
            value := mload(add(add(action, 32), offset))
        }
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);

        if (signature == MINT) {
            return authorizedIssuers[subject];
        }

        if (signature == TRANSFER) {
            address from = _addressAt(action, 4);
            address to = _addressAt(action, 36);
            return
                transfersEnabled &&
                subject == from &&
                MutableAsset(resource).getHolder() == from &&
                isQualifiedFor(to, resource);
        }

        return false;
    }
}
