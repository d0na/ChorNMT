// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IParticipantAsset.sol";
import "./IParticipantPolicy.sol";

// The certifier's policy. It stands for a policy translated from XACML: the messages each
// license type may declare are written here, not set at runtime. Change them by deploying
// a new policy and installing it with setCreatorSmartPolicy.
contract CreatorSmartPolicy is SmartPolicy, IParticipantPolicy {
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));
    bytes4 private constant SET_NAME = bytes4(keccak256("setName(bytes32)"));
    bytes4 private constant SET_PROFILE = bytes4(keccak256("setProfile(bytes32)"));
    bytes4 private constant SET_MESSAGES = bytes4(keccak256("setMessages(bytes32[])"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));

    bytes32 private constant SPECIAL_CARRIER = "SpecialCarrier";
    bytes32 private constant CARRIER = "Carrier";
    bytes32 private constant SUPPLIER = "Supplier";

    // Messages of the paper-example choreography (BPMN message ids).
    bytes32 private constant ORDER_SPECIAL_TRANSPORT = "Message_0dai5by";
    bytes32 private constant REQUEST_DETAILS = "Message_10n229k";
    bytes32 private constant TRANSPORT_DETAILS = "Message_1325zdq";
    bytes32 private constant WAYBILL_FOR_INTERMEDIATE = "Message_1vaojlk";
    bytes32 private constant ARRIVAL_INTERMEDIATE = "Message_11ex51i";
    // Added by the parallel transport preparation delta.
    bytes32 private constant PREPARE_TRANSPORT_DOCUMENTATION = "Prepare transport documentation";

    // The certifier: the only one who replaces this policy on a license.
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
        if (signature == SET_CREATOR_POLICY) {
            return subject == administrator;
        }

        if (
            signature == SET_NAME ||
            signature == SET_PROFILE ||
            signature == SET_MESSAGES ||
            signature == SET_LINKED ||
            signature == TRANSFER
        ) {
            return IMutableAsset(resource).getHolder() == subject;
        }

        return false;
    }

    function evaluateMessagesUpdate(
        address asset,
        bytes32[] calldata messages
    ) external view returns (bool) {
        bytes32 participantType = IParticipantAsset(asset).participantType();
        for (uint256 i = 0; i < messages.length; i++) {
            if (!isAllowedMessage(participantType, messages[i])) {
                return false;
            }
        }
        return true;
    }

    function isAllowedMessage(bytes32 participantType, bytes32 message) public pure returns (bool) {
        if (participantType == SPECIAL_CARRIER) {
            return
                message == ORDER_SPECIAL_TRANSPORT ||
                message == REQUEST_DETAILS ||
                message == TRANSPORT_DETAILS ||
                message == WAYBILL_FOR_INTERMEDIATE ||
                message == ARRIVAL_INTERMEDIATE ||
                message == PREPARE_TRANSPORT_DOCUMENTATION;
        }
        if (participantType == CARRIER) {
            return message == ORDER_SPECIAL_TRANSPORT || message == ARRIVAL_INTERMEDIATE;
        }
        if (participantType == SUPPLIER) {
            return
                message == REQUEST_DETAILS ||
                message == TRANSPORT_DETAILS ||
                message == WAYBILL_FOR_INTERMEDIATE;
        }
        return false;
    }
}
