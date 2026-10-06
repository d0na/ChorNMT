// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CreatorSmartPolicy.sol";
import "./IChoreographyAsset.sol";
import "./IChoreographyParticipantAM.sol";

// A Creator policy with BPMN and role constraints. The rules are fixed here; the data they
// use (limits, allowed task names, protected nodes and roles, required license types) are
// literals written by each scenario policy that extends this one.
//
// On setNodes the post-update model must stay within the task and sequence-flow limits,
// every changed task must have an allowed name, every flow endpoint must exist or be in the
// update, and no protected node may change or gain or lose a link. On setRoles a role must
// exist and not be protected, a role with a required type must be linked to a certified
// license of that type, and, when the scenario asks for it, no account plays two roles.
abstract contract ConstrainedCreatorSmartPolicy is CreatorSmartPolicy {
    error InvalidAddress();

    uint8 private constant TASK = uint8(IChoreographyAsset.NodeType.TASK);

    IChoreographyParticipantAM private immutable participants;

    constructor(address participantAttributeManager) {
        if (participantAttributeManager == address(0)) revert InvalidAddress();
        participants = IChoreographyParticipantAM(participantAttributeManager);
    }

    function evaluateNodeUpdate(
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) public view override returns (bool) {
        if (!super.evaluateNodeUpdate(asset, names, nodeTypes, incoming, outgoing)) {
            return false;
        }

        IChoreographyAsset choreography = IChoreographyAsset(asset);
        (uint256 taskCount, uint256 sequenceFlowCount) = _currentCounts(choreography);

        for (uint256 i = 0; i < names.length; i++) {
            bytes32 nameHash = keccak256(bytes(names[i]));
            if (_isProtectedNode(nameHash)) {
                return false;
            }

            string[] memory currentIncoming;
            string[] memory currentOutgoing;
            if (choreography.hasNode(names[i])) {
                uint8 currentType;
                (currentType, currentIncoming, currentOutgoing) = choreography.getNodeTypeAndEdges(names[i]);
                taskCount = _replaceTaskCount(taskCount, currentType, nodeTypes[i]);
                sequenceFlowCount = sequenceFlowCount - currentOutgoing.length + outgoing[i].length;
            } else {
                if (nodeTypes[i] == TASK) {
                    taskCount++;
                }
                sequenceFlowCount += outgoing[i].length;
            }

            if (
                (nodeTypes[i] == TASK && !_isAllowedTaskName(nameHash)) ||
                !_hasKnownFlowTargets(choreography, incoming[i], names) ||
                !_hasKnownFlowTargets(choreography, outgoing[i], names) ||
                !_sameProtectedEndpoints(currentIncoming, incoming[i]) ||
                !_sameProtectedEndpoints(currentOutgoing, outgoing[i])
            ) {
                return false;
            }
        }

        return taskCount <= _maxTaskCount() && sequenceFlowCount <= _maxSequenceFlowCount();
    }

    function evaluateRoleUpdate(
        address asset,
        string[] memory roleNames,
        address[] memory addresses
    ) public view override returns (bool) {
        if (!super.evaluateRoleUpdate(asset, roleNames, addresses)) {
            return false;
        }

        IChoreographyAsset choreography = IChoreographyAsset(asset);
        for (uint256 i = 0; i < roleNames.length; i++) {
            bytes32 nameHash = keccak256(bytes(roleNames[i]));
            if (_isProtectedRole(nameHash) || !choreography.hasRole(roleNames[i])) {
                return false;
            }
            bytes32 requiredType = _requiredParticipantType(nameHash);
            if (requiredType != bytes32(0) && participants.participantTypeOf(addresses[i]) != requiredType) {
                return false;
            }
        }
        return !_distinctRoleAccountsRequired() || _hasDistinctRoleAccounts(choreography, roleNames, addresses);
    }

    // Scenario literals.
    function _maxTaskCount() internal pure virtual returns (uint256);
    function _maxSequenceFlowCount() internal pure virtual returns (uint256);
    function _isAllowedTaskName(bytes32 nameHash) internal pure virtual returns (bool);
    function _isProtectedNode(bytes32 nameHash) internal pure virtual returns (bool);
    function _isProtectedRole(bytes32 nameHash) internal pure virtual returns (bool);
    // The license type a role requires; zero when the role takes any account.
    function _requiredParticipantType(bytes32 nameHash) internal pure virtual returns (bytes32);
    function _distinctRoleAccountsRequired() internal pure virtual returns (bool);

    function _hasDistinctRoleAccounts(
        IChoreographyAsset choreography,
        string[] memory roleNames,
        address[] memory addresses
    ) private view returns (bool) {
        for (uint256 i = 0; i < addresses.length; i++) {
            for (uint256 j = 0; j < i; j++) {
                if (addresses[i] == addresses[j]) {
                    return false;
                }
            }
        }

        string[] memory currentRoles = choreography.getRoleNames();
        for (uint256 i = 0; i < currentRoles.length; i++) {
            if (_containsName(roleNames, currentRoles[i])) {
                continue;
            }
            address current = choreography.getRole(currentRoles[i]);
            for (uint256 j = 0; j < addresses.length; j++) {
                if (addresses[j] == current) {
                    return false;
                }
            }
        }
        return true;
    }

    function _currentCounts(
        IChoreographyAsset choreography
    ) private view returns (uint256 taskCount, uint256 sequenceFlowCount) {
        string[] memory names = choreography.getNodeNames();
        for (uint256 i = 0; i < names.length; i++) {
            (uint8 nodeType, string[] memory outgoing) = choreography.getNodeTypeAndOutgoing(names[i]);
            if (nodeType == TASK) {
                taskCount++;
            }
            sequenceFlowCount += outgoing.length;
        }
    }

    function _replaceTaskCount(
        uint256 taskCount,
        uint8 currentType,
        uint8 nextType
    ) private pure returns (uint256) {
        if (currentType == TASK && nextType != TASK) {
            return taskCount - 1;
        }
        if (currentType != TASK && nextType == TASK) {
            return taskCount + 1;
        }
        return taskCount;
    }

    function _hasKnownFlowTargets(
        IChoreographyAsset choreography,
        string[] memory targets,
        string[] memory pendingNames
    ) private view returns (bool) {
        for (uint256 i = 0; i < targets.length; i++) {
            if (!choreography.hasNode(targets[i]) && !_containsName(pendingNames, targets[i])) {
                return false;
            }
        }
        return true;
    }

    function _sameProtectedEndpoints(
        string[] memory current,
        string[] memory next
    ) private pure returns (bool) {
        return _protectedSubset(current, next) && _protectedSubset(next, current);
    }

    function _protectedSubset(
        string[] memory source,
        string[] memory target
    ) private pure returns (bool) {
        for (uint256 i = 0; i < source.length; i++) {
            if (_isProtectedNode(keccak256(bytes(source[i]))) && !_containsName(target, source[i])) {
                return false;
            }
        }
        return true;
    }

    function _containsName(
        string[] memory names,
        string memory candidate
    ) private pure returns (bool) {
        bytes32 candidateHash = keccak256(bytes(candidate));
        for (uint256 i = 0; i < names.length; i++) {
            if (keccak256(bytes(names[i])) == candidateHash) {
                return true;
            }
        }
        return false;
    }
}
