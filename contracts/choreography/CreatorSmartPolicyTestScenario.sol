// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ConstrainedCreatorSmartPolicy.sol";

// Creator constraints of the small fixture in scripts/test-policies.js
// (Start -> Delivery -> End, roles Buyer, Supplier, Carrier).
contract CreatorSmartPolicyTestScenario is ConstrainedCreatorSmartPolicy {
    bytes32 private constant START = keccak256("Start");
    bytes32 private constant DELIVERY = keccak256("Delivery");
    bytes32 private constant INSPECTION = keccak256("Inspection");
    bytes32 private constant PACKING = keccak256("Packing");
    bytes32 private constant LABELING = keccak256("Labeling");
    bytes32 private constant SHIPPING = keccak256("Shipping");
    bytes32 private constant BUYER = keccak256("Buyer");
    bytes32 private constant CARRIER = keccak256("Carrier");
    bytes32 private constant SPECIAL_CARRIER_LICENSE = "SpecialCarrier";

    constructor(address participantAttributeManager) ConstrainedCreatorSmartPolicy(participantAttributeManager) {}

    function _maxTaskCount() internal pure override returns (uint256) {
        return 4;
    }

    function _maxSequenceFlowCount() internal pure override returns (uint256) {
        return 5;
    }

    function _isAllowedTaskName(bytes32 nameHash) internal pure override returns (bool) {
        return
            nameHash == DELIVERY ||
            nameHash == INSPECTION ||
            nameHash == PACKING ||
            nameHash == LABELING ||
            nameHash == SHIPPING;
    }

    function _isProtectedNode(bytes32 nameHash) internal pure override returns (bool) {
        return nameHash == START;
    }

    function _isProtectedRole(bytes32 nameHash) internal pure override returns (bool) {
        return nameHash == BUYER;
    }

    function _requiredParticipantType(bytes32 nameHash) internal pure override returns (bytes32) {
        return nameHash == CARRIER ? SPECIAL_CARRIER_LICENSE : bytes32(0);
    }

    function _distinctRoleAccountsRequired() internal pure override returns (bool) {
        return true;
    }
}
