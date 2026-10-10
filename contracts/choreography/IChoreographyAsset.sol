// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";

/// Views of a ChoreographyMutableAsset that policies and the renderer may call.
/// ChoreographyMutableAsset implements it, so the compiler keeps both in agreement.
interface IChoreographyAsset is IMutableAsset {
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

    function getNode(
        string memory name
    )
        external
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
        );
    function getNodeNames() external view returns (string[] memory);
    function hasNode(string memory name) external view returns (bool);
    function getNodeTypeAndOutgoing(
        string memory name
    ) external view returns (uint8, string[] memory);
    function getNodeTypeAndEdges(
        string memory name
    ) external view returns (uint8, string[] memory, string[] memory);
    function getRole(string memory role) external view returns (address);
    function hasRole(string memory role) external view returns (bool);
    function getRoleNames() external view returns (string[] memory);
    function tokenURI() external view returns (string memory);
}
