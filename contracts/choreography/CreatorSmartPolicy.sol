// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IChoreographyCreatorPolicy.sol";

interface IChoreographyAssetView {
    function hasNode(string memory name) external view returns (bool);
    function getNodeNames() external view returns (string[] memory);
    function getNodeTypeAndOutgoing(
        string memory name
    ) external view returns (uint8, string[] memory);
    function getNodeTypeAndEdges(
        string memory name
    ) external view returns (uint8, string[] memory, string[] memory);
}

contract CreatorSmartPolicy is SmartPolicy, IChoreographyCreatorPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
    bytes4 private constant SET_TOKEN_URI = bytes4(keccak256("setTokenURI(string)"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    uint8 private constant TASK = 2;

    address public immutable administrator;
    uint256 public maxTaskCount = type(uint256).max;
    uint256 public maxSequenceFlowCount = type(uint256).max;
    bool public enforceTaskNameAllowlist;
    bool public enforceKnownFlowTargets;
    bool public enforceConsistentFlows;
    mapping(bytes32 => bool) public allowedTaskNames;
    mapping(bytes32 => bool) public protectedNodes;
    uint256 public protectedNodeCount;
    mapping(bytes32 => bool) public protectedRoles;
    mapping(bytes32 => bytes32) public roleCategories;

    modifier onlyAdministrator() {
        require(msg.sender == administrator, "Caller is not the policy administrator");
        _;
    }

    constructor() {
        administrator = msg.sender;
    }

    function setBpmnLimits(
        uint256 maximumTaskCount,
        uint256 maximumSequenceFlowCount
    ) external onlyAdministrator {
        maxTaskCount = maximumTaskCount;
        maxSequenceFlowCount = maximumSequenceFlowCount;
    }

    function setTaskNameAllowlistEnabled(bool enabled) external onlyAdministrator {
        enforceTaskNameAllowlist = enabled;
    }

    function setKnownFlowTargetsEnabled(bool enabled) external onlyAdministrator {
        enforceKnownFlowTargets = enabled;
    }

    function setConsistentFlowsEnabled(bool enabled) external onlyAdministrator {
        enforceConsistentFlows = enabled;
    }

    function setAllowedTaskName(string calldata name, bool allowed) external onlyAdministrator {
        allowedTaskNames[keccak256(bytes(name))] = allowed;
    }

    function setProtectedNode(string calldata name, bool protectedNode) external onlyAdministrator {
        bytes32 nameHash = keccak256(bytes(name));
        if (protectedNodes[nameHash] == protectedNode) {
            return;
        }
        protectedNodes[nameHash] = protectedNode;
        if (protectedNode) {
            protectedNodeCount++;
        } else {
            protectedNodeCount--;
        }
    }

    // The category a role requires from its participant, matched against the
    // participant asset descriptor. Zero means any participant asset.
    function setRoleCategory(string calldata role, bytes32 category) external onlyAdministrator {
        roleCategories[keccak256(bytes(role))] = category;
    }

    function setProtectedRole(string calldata name, bool protectedRole) external onlyAdministrator {
        protectedRoles[keccak256(bytes(name))] = protectedRole;
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);
        if (signature == SET_CREATOR_POLICY) {
            return subject == administrator;
        }

        if (MutableAsset(resource).getHolder() != subject) {
            return false;
        }

        return
            signature == SET_ROLES ||
            signature == SET_NODES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED ||
            signature == TRANSFER;
    }

    function evaluateNodeUpdate(
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) public view override returns (bool) {
        if (
            names.length != nodeTypes.length ||
            names.length != incoming.length ||
            names.length != outgoing.length
        ) {
            return false;
        }

        IChoreographyAssetView choreography = IChoreographyAssetView(asset);
        (uint256 taskCount, uint256 sequenceFlowCount) = _currentCounts(choreography);

        for (uint256 i = 0; i < names.length; i++) {
            bytes32 nameHash = keccak256(bytes(names[i]));
            if (bytes(names[i]).length == 0 || protectedNodes[nameHash] || _isDuplicate(names, i)) {
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

            if (nodeTypes[i] == TASK && enforceTaskNameAllowlist && !allowedTaskNames[nameHash]) {
                return false;
            }

            if (
                enforceKnownFlowTargets &&
                (!_hasKnownFlowTargets(choreography, incoming[i], names) ||
                    !_hasKnownFlowTargets(choreography, outgoing[i], names))
            ) {
                return false;
            }

            if (
                protectedNodeCount > 0 &&
                (!_sameProtectedEndpoints(currentIncoming, incoming[i]) ||
                    !_sameProtectedEndpoints(currentOutgoing, outgoing[i]))
            ) {
                return false;
            }
        }

        if (enforceConsistentFlows && !_hasConsistentFlows(choreography, names, incoming, outgoing)) {
            return false;
        }

        return taskCount <= maxTaskCount && sequenceFlowCount <= maxSequenceFlowCount;
    }

    // Every sequence flow of the post-update model must be declared on both
    // endpoints: B in A.outgoing if and only if A in B.incoming.
    function _hasConsistentFlows(
        IChoreographyAssetView choreography,
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

    // A previous neighbour outside the update still references this node, so
    // the update must keep the matching reference.
    function _keepsUnchangedNeighbours(
        IChoreographyAssetView choreography,
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

    function _finalEdges(
        IChoreographyAssetView choreography,
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

    function evaluateRoleUpdate(
        address,
        string[] memory roleNames,
        address[] memory addresses
    ) public view override returns (bool) {
        if (roleNames.length != addresses.length) {
            return false;
        }

        for (uint256 i = 0; i < roleNames.length; i++) {
            if (
                bytes(roleNames[i]).length == 0 ||
                protectedRoles[keccak256(bytes(roleNames[i]))] ||
                _isDuplicate(roleNames, i) ||
                !_isEmptyOrParticipant(addresses[i], roleCategories[keccak256(bytes(roleNames[i]))])
            ) {
                return false;
            }
        }
        return true;
    }

    // A role is either unassigned (zero address) or bound to a
    // ParticipantMutableAsset: a tokenized asset (its NMT owns the token whose ID
    // is the asset address) whose descriptor matches the role category, if any.
    // Which specific participants are acceptable is decided by the holder.
    function _isEmptyOrParticipant(address participant, bytes32 category) private view returns (bool) {
        if (participant == address(0)) {
            return true;
        }
        if (participant.code.length == 0) {
            return false;
        }
        (bool hasNmt, address participantNmt) = _staticAddress(participant, abi.encodeWithSignature("nmt()"));
        if (!hasNmt || participantNmt.code.length == 0) {
            return false;
        }
        (bool hasOwner, address owner) = _staticAddress(
            participantNmt,
            abi.encodeWithSignature("ownerOf(uint256)", uint256(uint160(participant)))
        );
        if (!hasOwner || owner == address(0)) {
            return false;
        }
        (bool hasDescriptor, bytes memory descriptor) = participant.staticcall(abi.encodeWithSignature("getDescriptor()"));
        if (!hasDescriptor || descriptor.length != 32) {
            return false;
        }
        return category == bytes32(0) || abi.decode(descriptor, (bytes32)) == category;
    }

    function _staticAddress(address target, bytes memory data) private view returns (bool, address) {
        (bool success, bytes memory result) = target.staticcall(data);
        if (!success || result.length != 32) {
            return (false, address(0));
        }
        return (true, abi.decode(result, (address)));
    }

    function _currentCounts(
        IChoreographyAssetView choreography
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

    function _isDuplicate(string[] memory names, uint256 index) private pure returns (bool) {
        for (uint256 i = 0; i < index; i++) {
            if (keccak256(bytes(names[i])) == keccak256(bytes(names[index]))) {
                return true;
            }
        }
        return false;
    }

    function _hasKnownFlowTargets(
        IChoreographyAssetView choreography,
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
    ) private view returns (bool) {
        return _protectedSubset(current, next) && _protectedSubset(next, current);
    }

    function _protectedSubset(
        string[] memory source,
        string[] memory target
    ) private view returns (bool) {
        for (uint256 i = 0; i < source.length; i++) {
            if (protectedNodes[keccak256(bytes(source[i]))] && !_containsName(target, source[i])) {
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
