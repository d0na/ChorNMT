// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IChoreographyCreatorPolicy.sol";

// The default choreography Creator policy. It stands for a policy translated from XACML: the
// holder edits the model with no BPMN constraint beyond well-formed updates, and only the
// administrator (Hardhat account 0) replaces the policy. Constraints are a different policy
// (ConstrainedCreatorSmartPolicy and its scenarios), installed with setCreatorSmartPolicy.
contract CreatorSmartPolicy is SmartPolicy, IChoreographyCreatorPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));

    // The certifier of the choreography: the only one who replaces this policy.
    address public constant administrator = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // account 0

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);
        if (signature == SET_CREATOR_POLICY) {
            return subject == administrator;
        }

        if (IMutableAsset(resource).getHolder() != subject) {
            return false;
        }

        return
            signature == SET_ROLES ||
            signature == SET_NODES ||
            signature == SET_LINKED ||
            signature == TRANSFER;
    }

    function evaluateNodeUpdate(
        address,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) public view virtual override returns (bool) {
        return
            names.length == nodeTypes.length &&
            names.length == incoming.length &&
            names.length == outgoing.length &&
            _hasDistinctNames(names);
    }

    function evaluateRoleUpdate(
        address,
        string[] memory roleNames,
        address[] memory addresses
    ) public view virtual override returns (bool) {
        return roleNames.length == addresses.length && _hasDistinctNames(roleNames);
    }

    // Every name is non-empty and appears once in the update.
    function _hasDistinctNames(string[] memory names) internal pure returns (bool) {
        for (uint256 i = 0; i < names.length; i++) {
            if (bytes(names[i]).length == 0 || _isDuplicate(names, i)) {
                return false;
            }
        }
        return true;
    }

    function _isDuplicate(string[] memory names, uint256 index) private pure returns (bool) {
        bytes32 nameHash = keccak256(bytes(names[index]));
        for (uint256 i = 0; i < index; i++) {
            if (keccak256(bytes(names[i])) == nameHash) {
                return true;
            }
        }
        return false;
    }
}
