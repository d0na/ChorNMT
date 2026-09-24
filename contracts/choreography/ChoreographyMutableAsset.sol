// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "./IChoreographyCreatorPolicy.sol";

contract ChoreographyMutableAsset is MutableAsset {
    enum NodeType {
        START_EVENT,
        END_EVENT,
        TASK,
        EXCLUSIVE_SPLIT,
        EXCLUSIVE_JOIN,
        PARALLEL_SPLIT,
        PARALLEL_JOIN,
        EVENT_BASED_GATEWAY
    }

    struct Node {
        string name;
        NodeType nodeType;
        string[] incoming;
        string[] outgoing;
        string[] conditions;
        string initiatorRole;
        string participantRole;
        string initiatingMessage;
        string returnMessage;
    }

    struct Descriptor {
        mapping(string => Node) nodesByName;
        mapping(string => bool) hasNode;
        string[] nodeNames;
        mapping(string => address) roles;
        mapping(string => bool) hasRole;
        string[] roleNames;
    }

    struct InitialModel {
        string[] roleNames;
        address[] roleAddresses;
        string[] names;
        NodeType[] nodeTypes;
        string[][] incoming;
        string[][] outgoing;
        string[][] conditions;
        string[] initiatorRoles;
        string[] participantRoles;
        string[] initiatingMessages;
        string[] returnMessages;
    }

    Descriptor private descriptor;
    event RolesChanged(string[] roleNames);
    event NodesChanged(string[] nodeNames);
    event ChoreographyInitialized(string[] roleNames, string[] nodeNames);

    constructor(
        address nmtAddress,
        address creatorSmartPolicyAddress,
        address holderSmartPolicyAddress
    )
        MutableAsset(
            nmtAddress,
            creatorSmartPolicyAddress,
            holderSmartPolicyAddress
        )
    {}

    function setRoles(
        string[] memory roleNames,
        address[] memory addresses
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setRoles(string[],address[])", roleNames, addresses),
            address(this)
        )
    {
        require(
            IChoreographyCreatorPolicy(creatorSmartPolicy).evaluateRoleUpdate(
                address(this),
                roleNames,
                addresses
            ),
            "Operation DENIED by CREATOR role policy"
        );
        _setRoles(roleNames, addresses);
    }

    function _setRoles(
        string[] memory roleNames,
        address[] memory addresses
    ) private {
        require(roleNames.length == addresses.length, "Array size mismatch");

        for (uint256 i = 0; i < roleNames.length; i++) {
            require(bytes(roleNames[i]).length > 0, "Role name required");

            if (!descriptor.hasRole[roleNames[i]]) {
                descriptor.hasRole[roleNames[i]] = true;
                descriptor.roleNames.push(roleNames[i]);
            }

            descriptor.roles[roleNames[i]] = addresses[i];
        }

        emit RolesChanged(roleNames);
    }

    function setNodes(
        string[] memory names,
        NodeType[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing,
        string[][] memory conditions,
        string[] memory initiatorRoles,
        string[] memory participantRoles,
        string[] memory initiatingMessages,
        string[] memory returnMessages
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature(
                "setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])",
                names,
                nodeTypes,
                incoming,
                outgoing,
                conditions,
                initiatorRoles,
                participantRoles,
                initiatingMessages,
                returnMessages
            ),
            address(this)
        )
    {
        _evaluateCreatorNodePolicy(names, nodeTypes, incoming, outgoing);
        _setNodes(
            names,
            nodeTypes,
            incoming,
            outgoing,
            conditions,
            initiatorRoles,
            participantRoles,
            initiatingMessages,
            returnMessages
        );
    }

    function _evaluateCreatorNodePolicy(
        string[] memory names,
        NodeType[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) private view {
        uint8[] memory types = new uint8[](nodeTypes.length);
        for (uint256 i = 0; i < nodeTypes.length; i++) {
            types[i] = uint8(nodeTypes[i]);
        }

        require(
            IChoreographyCreatorPolicy(creatorSmartPolicy).evaluateNodeUpdate(
                address(this),
                names,
                types,
                incoming,
                outgoing
            ),
            "Operation DENIED by CREATOR BPMN policy"
        );
    }

    function _setNodes(
        string[] memory names,
        NodeType[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing,
        string[][] memory conditions,
        string[] memory initiatorRoles,
        string[] memory participantRoles,
        string[] memory initiatingMessages,
        string[] memory returnMessages
    ) private {
        require(
            names.length == nodeTypes.length &&
                names.length == incoming.length &&
                names.length == outgoing.length &&
                names.length == conditions.length &&
                names.length == initiatorRoles.length &&
                names.length == participantRoles.length &&
                names.length == initiatingMessages.length &&
                names.length == returnMessages.length,
            "Array size mismatch"
        );

        for (uint256 i = 0; i < names.length; i++) {
            require(bytes(names[i]).length > 0, "Node name required");

            if (!descriptor.hasNode[names[i]]) {
                descriptor.hasNode[names[i]] = true;
                descriptor.nodeNames.push(names[i]);
            }

            Node storage node = descriptor.nodesByName[names[i]];
            node.name = names[i];
            node.nodeType = nodeTypes[i];
            node.initiatorRole = initiatorRoles[i];
            node.participantRole = participantRoles[i];
            node.initiatingMessage = initiatingMessages[i];
            node.returnMessage = returnMessages[i];

            delete node.incoming;
            for (uint256 j = 0; j < incoming[i].length; j++) {
                node.incoming.push(incoming[i][j]);
            }

            delete node.outgoing;
            for (uint256 j = 0; j < outgoing[i].length; j++) {
                node.outgoing.push(outgoing[i][j]);
            }

            delete node.conditions;
            for (uint256 j = 0; j < conditions[i].length; j++) {
                node.conditions.push(conditions[i][j]);
            }
        }

        emit NodesChanged(names);
    }

    function initializeChoreography(InitialModel memory model) public onlyNMT {
        _setRoles(model.roleNames, model.roleAddresses);
        _setNodes(
            model.names,
            model.nodeTypes,
            model.incoming,
            model.outgoing,
            model.conditions,
            model.initiatorRoles,
            model.participantRoles,
            model.initiatingMessages,
            model.returnMessages
        );
        emit ChoreographyInitialized(model.roleNames, model.names);
    }

    function setTokenURI(
        string memory uri
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setTokenURI(string)", uri),
            address(this)
        )
    {
        _setTokenURI(uri);
    }

    function getNode(
        string memory name
    )
        public
        view
        returns (
            string memory,
            NodeType,
            string[] memory,
            string[] memory,
            string[] memory,
            string memory,
            string memory,
            string memory,
            string memory
        )
    {
        Node storage node = descriptor.nodesByName[name];

        return (
            node.name,
            node.nodeType,
            node.incoming,
            node.outgoing,
            node.conditions,
            node.initiatorRole,
            node.participantRole,
            node.initiatingMessage,
            node.returnMessage
        );
    }

    function getNodeNames() public view returns (string[] memory) {
        return descriptor.nodeNames;
    }

    function hasNode(string memory name) public view returns (bool) {
        return descriptor.hasNode[name];
    }

    function getNodeTypeAndOutgoing(
        string memory name
    ) public view returns (uint8, string[] memory) {
        Node storage node = descriptor.nodesByName[name];
        return (uint8(node.nodeType), node.outgoing);
    }

    function getNodeTypeAndEdges(
        string memory name
    ) public view returns (uint8, string[] memory, string[] memory) {
        Node storage node = descriptor.nodesByName[name];
        return (uint8(node.nodeType), node.incoming, node.outgoing);
    }

    function getRole(string memory role) public view returns (address) {
        return descriptor.roles[role];
    }

    function getRoleNames() public view returns (string[] memory) {
        return descriptor.roleNames;
    }
}
