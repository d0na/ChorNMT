// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IChoreographyCreatorPolicy.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IChoreographyAssetView {
    function hasNode(string memory name) external view returns (bool);
    function getNodeNames() external view returns (string[] memory);
    function getNodeTypeAndOutgoing(
        string memory name
    ) external view returns (uint8, string[] memory);
    function getNodeTypeAndEdges(
        string memory name
    ) external view returns (uint8, string[] memory, string[] memory);
    function hasRole(string memory role) external view returns (bool);
    function getRole(string memory role) external view returns (address);
    function getRoleNames() external view returns (string[] memory);
}

interface IParticipantView {
    function creatorSmartPolicy() external view returns (address);
    function participantType() external view returns (bytes32);
    function hasCapability(bytes32 capability) external view returns (bool);
}

contract CreatorSmartPolicy is SmartPolicy, IChoreographyCreatorPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
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
    uint256 public protectedNodeCount;
    mapping(bytes32 => bool) public protectedRoles;
    bool public enforceKnownRoles;
    bool public enforceDistinctRoleAccounts;
    address public participantNmt;
    address public participantCertifier;

    struct RoleRequirement {
        bool enabled;
        bytes32 participantType;
        bytes32[] capabilities;
    }

    mapping(bytes32 => RoleRequirement) private roleRequirements;

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

    function setProtectedRole(string calldata name, bool protectedRole) external onlyAdministrator {
        protectedRoles[keccak256(bytes(name))] = protectedRole;
    }

    function setKnownRolesEnabled(bool enabled) external onlyAdministrator {
        enforceKnownRoles = enabled;
    }

    function setDistinctRoleAccountsEnabled(bool enabled) external onlyAdministrator {
        enforceDistinctRoleAccounts = enabled;
    }

    // Participants must be minted by participantNmt and certified by participantCertifier,
    // the Creator policy whose administrator sets participant types and capabilities.
    function setParticipantRegistry(
        address participantNmtAddress,
        address participantCertifierAddress
    ) external onlyAdministrator {
        participantNmt = participantNmtAddress;
        participantCertifier = participantCertifierAddress;
    }

    function setRoleRequirement(
        string calldata name,
        bytes32 participantTypeValue,
        bytes32[] calldata capabilities
    ) external onlyAdministrator {
        roleRequirements[keccak256(bytes(name))] = RoleRequirement(true, participantTypeValue, capabilities);
    }

    function clearRoleRequirement(string calldata name) external onlyAdministrator {
        delete roleRequirements[keccak256(bytes(name))];
    }

    function getRoleRequirement(
        string calldata name
    ) external view returns (bool, bytes32, bytes32[] memory) {
        RoleRequirement storage requirement = roleRequirements[keccak256(bytes(name))];
        return (requirement.enabled, requirement.participantType, requirement.capabilities);
    }

    function isRoleRequirementSatisfied(
        address asset,
        string calldata name
    ) external view returns (bool) {
        return _satisfiesRoleRequirement(
            roleRequirements[keccak256(bytes(name))],
            IChoreographyAssetView(asset).getRole(name)
        );
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

        return taskCount <= maxTaskCount && sequenceFlowCount <= maxSequenceFlowCount;
    }

    function evaluateRoleUpdate(
        address asset,
        string[] memory roleNames,
        address[] memory addresses
    ) public view override returns (bool) {
        if (roleNames.length != addresses.length) {
            return false;
        }

        IChoreographyAssetView choreography = IChoreographyAssetView(asset);
        for (uint256 i = 0; i < roleNames.length; i++) {
            bytes32 nameHash = keccak256(bytes(roleNames[i]));
            if (
                bytes(roleNames[i]).length == 0 ||
                protectedRoles[nameHash] ||
                _isDuplicate(roleNames, i) ||
                (enforceKnownRoles && !choreography.hasRole(roleNames[i])) ||
                !_satisfiesRoleRequirement(roleRequirements[nameHash], addresses[i])
            ) {
                return false;
            }
        }
        return !enforceDistinctRoleAccounts || _hasDistinctRoleAccounts(choreography, roleNames, addresses);
    }

    function _satisfiesRoleRequirement(
        RoleRequirement storage requirement,
        address participant
    ) private view returns (bool) {
        if (!requirement.enabled) {
            return true;
        }
        if (!_isParticipantAsset(participant)) {
            return false;
        }

        IParticipantView candidate = IParticipantView(participant);
        if (
            candidate.creatorSmartPolicy() != participantCertifier ||
            candidate.participantType() != requirement.participantType
        ) {
            return false;
        }
        for (uint256 i = 0; i < requirement.capabilities.length; i++) {
            if (!candidate.hasCapability(requirement.capabilities[i])) {
                return false;
            }
        }
        return true;
    }

    // A participant asset is genuine when participantNmt has minted its token: the token id
    // is the asset address, and only the NMT deploys the asset.
    function _isParticipantAsset(address participant) private view returns (bool) {
        if (participantNmt == address(0) || participant == address(0)) {
            return false;
        }
        try IERC721(participantNmt).ownerOf(uint256(uint160(participant))) returns (address) {
            return true;
        } catch {
            return false;
        }
    }

    function _hasDistinctRoleAccounts(
        IChoreographyAssetView choreography,
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
