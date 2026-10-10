// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IChoreographyAsset.sol";
import "./IChoreographyPolicy.sol";

// The default choreography Creator policy. It stands for a policy translated from XACML: the
// holder edits the model with no BPMN constraint beyond well-formed updates (distinct names,
// sequence flows declared on both endpoints, so the model can always be rendered), and only the
// administrator (Hardhat account 0) replaces the policy. Constraints are a different policy
// (ConstrainedCreatorSmartPolicy and its scenarios), installed with setCreatorSmartPolicy.
contract CreatorSmartPolicy is SmartPolicy, IChoreographyPolicy {
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
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) public view virtual override returns (bool) {
        return
            names.length == nodeTypes.length &&
            names.length == incoming.length &&
            names.length == outgoing.length &&
            _hasDistinctNames(names) &&
            _hasConsistentFlows(IChoreographyAsset(asset), names, incoming, outgoing);
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

    // Every sequence flow of the post-update model is declared on both endpoints:
    // B is in A.outgoing if and only if A is in B.incoming.
    function _hasConsistentFlows(
        IChoreographyAsset choreography,
        string[] memory names,
        string[][] memory incoming,
        string[][] memory outgoing
    ) private view returns (bool) {
        for (uint256 i = 0; i < names.length; i++) {
            for (uint256 j = 0; j < outgoing[i].length; j++) {
                (string[] memory targetIncoming, ) = _finalEdges(choreography, names, incoming, outgoing, outgoing[i][j]);
                if (!_containsName(targetIncoming, names[i])) {
                    return false;
                }
            }
            for (uint256 j = 0; j < incoming[i].length; j++) {
                (, string[] memory sourceOutgoing) = _finalEdges(choreography, names, incoming, outgoing, incoming[i][j]);
                if (!_containsName(sourceOutgoing, names[i])) {
                    return false;
                }
            }
            if (choreography.hasNode(names[i]) && !_keepsUnchangedNeighbours(choreography, names, incoming[i], outgoing[i], i)) {
                return false;
            }
        }
        return true;
    }

    // A previous neighbour outside the update still references this node, so the update must
    // keep the matching reference.
    function _keepsUnchangedNeighbours(
        IChoreographyAsset choreography,
        string[] memory names,
        string[] memory nextIncoming,
        string[] memory nextOutgoing,
        uint256 index
    ) private view returns (bool) {
        (, string[] memory currentIncoming, string[] memory currentOutgoing) = choreography.getNodeTypeAndEdges(names[index]);
        for (uint256 j = 0; j < currentOutgoing.length; j++) {
            if (!_containsName(names, currentOutgoing[j]) && !_containsName(nextOutgoing, currentOutgoing[j])) {
                (, string[] memory targetIncoming, ) = choreography.getNodeTypeAndEdges(currentOutgoing[j]);
                if (_containsName(targetIncoming, names[index])) {
                    return false;
                }
            }
        }
        for (uint256 j = 0; j < currentIncoming.length; j++) {
            if (!_containsName(names, currentIncoming[j]) && !_containsName(nextIncoming, currentIncoming[j])) {
                (, , string[] memory sourceOutgoing) = choreography.getNodeTypeAndEdges(currentIncoming[j]);
                if (_containsName(sourceOutgoing, names[index])) {
                    return false;
                }
            }
        }
        return true;
    }

    // The edges of a node after the update: from the update when it is there, else from the asset;
    // none for an unknown node.
    function _finalEdges(
        IChoreographyAsset choreography,
        string[] memory names,
        string[][] memory incoming,
        string[][] memory outgoing,
        string memory name
    ) private view returns (string[] memory, string[] memory) {
        bytes32 nameHash = keccak256(bytes(name));
        for (uint256 i = 0; i < names.length; i++) {
            if (keccak256(bytes(names[i])) == nameHash) {
                return (incoming[i], outgoing[i]);
            }
        }
        if (choreography.hasNode(name)) {
            (, string[] memory currentIncoming, string[] memory currentOutgoing) = choreography.getNodeTypeAndEdges(name);
            return (currentIncoming, currentOutgoing);
        }
        return (new string[](0), new string[](0));
    }

    function _containsName(string[] memory names, string memory candidate) internal pure returns (bool) {
        bytes32 candidateHash = keccak256(bytes(candidate));
        for (uint256 i = 0; i < names.length; i++) {
            if (keccak256(bytes(names[i])) == candidateHash) {
                return true;
            }
        }
        return false;
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
