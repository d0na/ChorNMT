// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BPMNChoreography {

    /// Types of BPMN nodes
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


    /// Choreography node
    struct Node {

        string id;
        NodeType nodeType;
        string name;

        // Incoming and outgoing nodes
        string[] incoming;
        string[] outgoing;

        string[] conditions;
        // Used for choreography tasks
        string initiatorRole;
        string participantRole;

        // Messages exchanged by the task
        string initiatingMessage;
        string returnMessage;
    }


    /// Process instance
    struct Choreography {
        // BPMN nodes
        mapping(string => Node) nodes;
        // Role bindings
        mapping(string => address) roles;
    }


    /// Current choreography
    Choreography private choreography;



    // ============================================================
    //                         NODE SETTERS
    // ============================================================


    function setNodes(
    string[] memory ids,
    NodeType[] memory nodeTypes,
    string[] memory names,
    string[][] memory incoming,
    string[][] memory outgoing,
    string[][] memory conditions,
    string[] memory initiatorRoles,
    string[] memory participantRoles,
    string[] memory initiatingMessages,
    string[] memory returnMessages
) public {

    require(
        ids.length == nodeTypes.length &&
        ids.length == names.length &&
        ids.length == incoming.length &&
        ids.length == outgoing.length &&
        ids.length == conditions.length &&
        ids.length == initiatorRoles.length &&
        ids.length == participantRoles.length &&
        ids.length == initiatingMessages.length &&
        ids.length == returnMessages.length,
        "Array size mismatch"
    );


    for (uint256 i = 0; i < ids.length; i++) {

        Node storage node = choreography.nodes[ids[i]];


        node.id = ids[i];
        node.nodeType = nodeTypes[i];
        node.name = names[i];


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

        require(
            roleNames.length == addresses.length,
            "Array size mismatch"
        );


        for (uint256 i = 0; i < roleNames.length; i++) {

            choreography.roles[roleNames[i]] = addresses[i];
        }
    }



    // ============================================================
    //                          GETTERS
    // ============================================================

function getNode(string memory id)
    public
    view
    returns (
        string memory,
        NodeType,
        string memory,
        string[] memory,
        string[] memory,
        string[] memory,
        string memory,
        string memory,
        string memory,
        string memory
    )
{
    Node storage node = choreography.nodes[id];

    return (
        node.id,
        node.nodeType,
        node.name,
        node.incoming,
        node.outgoing,
        node.conditions,
        node.initiatorRole,
        node.participantRole,
        node.initiatingMessage,
        node.returnMessage
    );
    }

   


    function getRole(string memory role)
        public
        view
        returns(address)
    {
        return choreography.roles[role];
    }
}