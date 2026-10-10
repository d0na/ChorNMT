// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IParticipantPolicy.sol";

contract HolderSmartPolicy is SmartPolicy, IParticipantPolicy {
    bytes4 private constant SET_NAME = bytes4(keccak256("setName(bytes32)"));
    bytes4 private constant SET_PROFILE = bytes4(keccak256("setProfile(bytes32)"));
    bytes4 private constant SET_MESSAGES = bytes4(keccak256("setMessages(bytes32[])"));
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
            signature == SET_PROFILE ||
            signature == SET_MESSAGES ||
            signature == SET_LINKED;
    }

    // The default Holder policy adds no constraint on messages beyond the Creator's.
    function evaluateMessagesUpdate(
        address,
        bytes32[] calldata
    ) external pure returns (bool) {
        return true;
    }
}
