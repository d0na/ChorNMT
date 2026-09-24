// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IChoreographyAssetReader {
    function getRoleNames() external view returns (string[] memory);
    function getRole(string memory role) external view returns (address);
    function getNodeNames() external view returns (string[] memory);
    function getNode(
        string memory name
    )
        external
        view
        returns (
            string memory,
            uint8,
            string[] memory,
            string[] memory,
            string[] memory,
            string memory,
            string memory,
            string memory,
            string memory
        );
}

/// Builds the ERC-721 metadata of a choreography asset from its on-chain state.
/// The `choreography` field uses the same role and node shape as an NMT dataset.
contract ChoreographyTokenURIRenderer {
    function tokenURI(address asset) external view returns (string memory) {
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(metadata(asset)))
        );
    }

    function metadata(address asset) public view returns (string memory) {
        IChoreographyAssetReader reader = IChoreographyAssetReader(asset);
        return string.concat(
            '{"name":"ChorNMT choreography ',
            Strings.toChecksumHexString(asset),
            '","description":"BPMN choreography stored in a ChorNMT mutable asset.","choreography":{"schemaVersion":"1.0","roles":',
            _rolesJson(reader),
            ',"nodes":',
            _nodesJson(reader),
            "}}"
        );
    }

    function _rolesJson(IChoreographyAssetReader reader) private view returns (string memory json) {
        string[] memory names = reader.getRoleNames();
        json = "[";
        for (uint256 i = 0; i < names.length; i++) {
            json = string.concat(
                json,
                i == 0 ? "" : ",",
                '{"name":',
                _jsonString(names[i]),
                ',"address":"',
                Strings.toChecksumHexString(reader.getRole(names[i])),
                '"}'
            );
        }
        json = string.concat(json, "]");
    }

    function _nodesJson(IChoreographyAssetReader reader) private view returns (string memory json) {
        string[] memory names = reader.getNodeNames();
        json = "[";
        for (uint256 i = 0; i < names.length; i++) {
            json = string.concat(json, i == 0 ? "" : ",", _nodeJson(reader, names[i]));
        }
        json = string.concat(json, "]");
    }

    function _nodeJson(
        IChoreographyAssetReader reader,
        string memory name
    ) private view returns (string memory) {
        (
            ,
            uint8 nodeType,
            string[] memory incoming,
            string[] memory outgoing,
            string[] memory conditions,
            string memory initiatorRole,
            string memory participantRole,
            string memory initiatingMessage,
            string memory returnMessage
        ) = reader.getNode(name);

        string memory edges = string.concat(
            ',"incoming":',
            _jsonArray(incoming),
            ',"outgoing":',
            _jsonArray(outgoing),
            ',"conditions":',
            _jsonArray(conditions)
        );
        string memory participants = string.concat(
            ',"initiatorRole":',
            _jsonString(initiatorRole),
            ',"participantRole":',
            _jsonString(participantRole),
            ',"initiatingMessage":',
            _jsonString(initiatingMessage),
            ',"returnMessage":',
            _jsonString(returnMessage)
        );
        return string.concat(
            '{"name":',
            _jsonString(name),
            ',"nodeType":',
            Strings.toString(nodeType),
            edges,
            participants,
            "}"
        );
    }

    function _jsonArray(string[] memory values) private pure returns (string memory json) {
        json = "[";
        for (uint256 i = 0; i < values.length; i++) {
            json = string.concat(json, i == 0 ? "" : ",", _jsonString(values[i]));
        }
        json = string.concat(json, "]");
    }

    function _jsonString(string memory value) private pure returns (string memory) {
        return string.concat('"', Strings.escapeJSON(value), '"');
    }
}
