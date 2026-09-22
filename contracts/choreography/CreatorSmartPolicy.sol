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
    mapping(bytes32 => bool) public allowedTaskNames;
    mapping(bytes32 => bool) public protectedNodes;

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

    function setAllowedTaskName(string calldata name, bool allowed) external onlyAdministrator {
        allowedTaskNames[keccak256(bytes(name))] = allowed;
    }

    function setProtectedNode(string calldata name, bool protectedNode) external onlyAdministrator {
        protectedNodes[keccak256(bytes(name))] = protectedNode;
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        if (MutableAsset(resource).getHolder() != subject) {
            return false;
        }

        bytes4 signature = decodeSignature(action);
        return
            signature == SET_ROLES ||
            signature == SET_NODES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED ||
            signature == SET_CREATOR_POLICY ||
            signature == TRANSFER;
    }

    function evaluateNodeUpdate(
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory outgoing
    ) public view override returns (bool) {
        if (names.length != nodeTypes.length || names.length != outgoing.length) {
            return false;
        }

        IChoreographyAssetView choreography = IChoreographyAssetView(asset);
        (uint256 taskCount, uint256 sequenceFlowCount) = _currentCounts(choreography);

        for (uint256 i = 0; i < names.length; i++) {
            bytes32 nameHash = keccak256(bytes(names[i]));
            if (bytes(names[i]).length == 0 || protectedNodes[nameHash] || _isDuplicate(names, i)) {
                return false;
            }

            if (choreography.hasNode(names[i])) {
                (uint8 currentType, string[] memory currentOutgoing) = choreography.getNodeTypeAndOutgoing(names[i]);
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

            if (enforceKnownFlowTargets && !_hasKnownFlowTargets(choreography, outgoing[i], names)) {
                return false;
            }
        }

        return taskCount <= maxTaskCount && sequenceFlowCount <= maxSequenceFlowCount;
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
