// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";

contract CreatorSmartPolicy is SmartPolicy {
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));
    bytes4 private constant SET_PARTICIPANT_TYPE = bytes4(keccak256("setParticipantType(bytes32)"));
    bytes4 private constant SET_CAPABILITIES = bytes4(keccak256("setCapabilities(bytes32[])"));
    bytes4 private constant SET_NAME = bytes4(keccak256("setName(bytes32)"));
    bytes4 private constant SET_DESCRIPTOR = bytes4(keccak256("setDescriptor(bytes32)"));
    bytes4 private constant SET_BPMN = bytes4(keccak256("setBpmn(string)"));
    bytes4 private constant SET_MESSAGES = bytes4(keccak256("setMessages(bytes32[])"));
    bytes4 private constant SET_TOKEN_URI = bytes4(keccak256("setTokenURI(string)"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));

    // The administrator certifies licenses: only it sets their type and capabilities.
    address public immutable administrator;

    constructor() {
        administrator = msg.sender;
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);
        if (
            signature == SET_CREATOR_POLICY ||
            signature == SET_PARTICIPANT_TYPE ||
            signature == SET_CAPABILITIES
        ) {
            return subject == administrator;
        }

        if (
            signature == SET_NAME ||
            signature == SET_DESCRIPTOR ||
            signature == SET_BPMN ||
            signature == SET_MESSAGES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED ||
            signature == TRANSFER
        ) {
            return IMutableAsset(resource).getHolder() == subject;
        }

        return false;
    }
}
