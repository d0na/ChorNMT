// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BPMNChoreography {

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

    struct Choreography {
        mapping(string => Node) nodesByName;
        mapping(string => bool) hasNode;
        string[] nodeNames;

        mapping(string => address) roles;
        mapping(string => bool) hasRole;
        string[] roleNames;
    }

    Choreography private choreography;


    // ============================================================
    //                         NODE SETTERS
    // ============================================================

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
    ) public {
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

            if (!choreography.hasNode[names[i]]) {
                choreography.hasNode[names[i]] = true;
                choreography.nodeNames.push(names[i]);
            }

            Node storage node = choreography.nodesByName[names[i]];

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
    }


    // ============================================================
    //                       ROLE SETTERS
    // ============================================================

    function setRoles(
        string[] memory roleNames,
        address[] memory addresses
    ) public {
        require(roleNames.length == addresses.length, "Array size mismatch");

        for (uint256 i = 0; i < roleNames.length; i++) {
            require(bytes(roleNames[i]).length > 0, "Role name required");

            if (!choreography.hasRole[roleNames[i]]) {
                choreography.hasRole[roleNames[i]] = true;
                choreography.roleNames.push(roleNames[i]);
            }

            choreography.roles[roleNames[i]] = addresses[i];
        }
    }


    // ============================================================
    //                          GETTERS
    // ============================================================

    function getNode(string memory name)
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
        Node storage node = choreography.nodesByName[name];

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

    function getNodeNames()
        public
        view
        returns (string[] memory)
    {
        return choreography.nodeNames;
    }

    function getRole(string memory role)
        public
        view
        returns (address)
    {
        return choreography.roles[role];
    }

    function getRoleNames()
        public
        view
        returns (string[] memory)
    {
        return choreography.roleNames;
    }
}
