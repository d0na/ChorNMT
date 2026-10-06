// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";

contract HolderSmartPolicy is SmartPolicy {
    bytes4 private constant SET_NAME = bytes4(keccak256("setName(bytes32)"));
    bytes4 private constant SET_DESCRIPTOR = bytes4(keccak256("setDescriptor(bytes32)"));
    bytes4 private constant SET_BPMN = bytes4(keccak256("setBpmn(string)"));
    bytes4 private constant SET_MESSAGES = bytes4(keccak256("setMessages(bytes32[])"));
    bytes4 private constant SET_TOKEN_URI = bytes4(keccak256("setTokenURI(string)"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        if (IMutableAsset(resource).getHolder() != subject) {
            return false;
        }

        bytes4 signature = decodeSignature(action);
        return
            signature == SET_NAME ||
            signature == SET_DESCRIPTOR ||
            signature == SET_BPMN ||
            signature == SET_MESSAGES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED;
    }
}
