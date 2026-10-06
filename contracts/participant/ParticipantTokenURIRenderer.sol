// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./IParticipantAsset.sol";

/// Builds the ERC-721 metadata of a participant license from its on-chain state, so a buyer
/// sees the certified type and the current holder rather than a claim stored by the seller.
contract ParticipantTokenURIRenderer {
    function tokenURI(address asset) external view returns (string memory) {
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(metadata(asset)))
        );
    }

    function metadata(address asset) public view returns (string memory) {
        IParticipantAsset license = IParticipantAsset(asset);
        address holder = license.getHolder();
        address writer = license.getMessagesWriter();
        string memory organization = string.concat(
            ',"holder":"',
            Strings.toChecksumHexString(holder),
            '","name":',
            _jsonString(license.getName()),
            ',"profile":"',
            Strings.toHexString(uint256(license.getProfile()), 32),
            '"'
        );
        string memory messages = string.concat(
            ',"messages":',
            _jsonArray(license.getMessages()),
            ',"messagesWriter":"',
            Strings.toChecksumHexString(writer),
            '","messagesWrittenByHolder":',
            writer == holder ? "true" : "false"
        );
        return string.concat(
            '{"name":"ChorNMT participant license ',
            Strings.toChecksumHexString(asset),
            '","description":"Role license stored in a ChorNMT participant asset.","participant":{"schemaVersion":"1.0","participantType":',
            _jsonString(license.participantType()),
            organization,
            messages,
            "}}"
        );
    }

    function _jsonArray(bytes32[] memory values) private pure returns (string memory json) {
        json = "[";
        for (uint256 i = 0; i < values.length; i++) {
            json = string.concat(json, i == 0 ? "" : ",", _jsonString(values[i]));
        }
        json = string.concat(json, "]");
    }

    // Values are short strings encoded as bytes32 (ethers encodeBytes32String): trailing zero bytes are padding.
    function _jsonString(bytes32 value) private pure returns (string memory) {
        uint256 length = 0;
        while (length < 32 && value[length] != 0) {
            length++;
        }
        bytes memory text = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            text[i] = value[i];
        }
        return string.concat('"', Strings.escapeJSON(string(text)), '"');
    }
}
