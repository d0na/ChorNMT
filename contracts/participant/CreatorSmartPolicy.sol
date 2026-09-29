// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";

contract CreatorSmartPolicy is SmartPolicy {
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));
    bytes4 private constant SET_PARTICIPANT_TYPE = bytes4(keccak256("setParticipantType(bytes32)"));
    bytes4 private constant SET_CAPABILITIES = bytes4(keccak256("setCapabilities(bytes32[])"));

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
        return MutableAsset(resource).getHolder() == subject;
    }
}
