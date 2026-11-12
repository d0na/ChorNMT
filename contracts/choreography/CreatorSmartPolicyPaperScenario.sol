// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ConstrainedCreatorSmartPolicy.sol";

// Creator constraints of the paper example (references/paper-example.bpmn) evolved by the
// parallel transport preparation delta: 10 tasks and 14 sequence flows, with room for one
// more of each. The experiment instance is born with it (scripts/experiment/phases.js, F2).
contract CreatorSmartPolicyPaperScenario is ConstrainedCreatorSmartPolicy {
    // Tasks of the evolved paper example.
    bytes32 private constant ORDER = keccak256("Order");
    bytes32 private constant ORDER_INTERMEDIATE = keccak256("Order Intermediate");
    bytes32 private constant FWD_ORDER_INTERMEDIATE = keccak256("FWD Oder Intermediate");
    bytes32 private constant ORDER_SPECIAL_TRANSPORT = keccak256("Order Special Transport");
    bytes32 private constant REQUEST_DETAILS = keccak256("Request Details");
    bytes32 private constant TRANSPORT_DETAILS = keccak256("Transport Details");
    bytes32 private constant PREPARE_TRANSPORT_DOCUMENTATION = keccak256("Prepare Transport Documentation");
    bytes32 private constant WAYBILL_FOR_INTERMEDIATE = keccak256("Waybill for Intermediate");
    bytes32 private constant ARRIVAL_INTERMEDIATE = keccak256("Arrival Intermediate");
    bytes32 private constant DELIVERY_OF_PRODUCT = keccak256("Delivery of Product");
    // Optional tasks the Creator approves in advance.
    bytes32 private constant OPTIONAL_CUSTOMS_INSPECTION = keccak256("Optional Customs Inspection");
    bytes32 private constant OPTIONAL_QUALITY_INSPECTION = keccak256("Optional Quality Inspection");

    // Roles of the paper example and the license type each one requires.
    bytes32 private constant BULK_BUYER = keccak256("Bulk Buyer");
    bytes32 private constant MANUFACTURER = keccak256("Manufacturer");
    bytes32 private constant MIDDLEMAN = keccak256("Middleman");
    bytes32 private constant SUPPLIER = keccak256("Supplier");
    bytes32 private constant SPECIAL_CARRIER = keccak256("Special Carrier");
    bytes32 private constant BULK_BUYER_LICENSE = "BulkBuyer";
    bytes32 private constant MANUFACTURER_LICENSE = "Manufacturer";
    bytes32 private constant MIDDLEMAN_LICENSE = "Middleman";
    bytes32 private constant SUPPLIER_LICENSE = "Supplier";
    bytes32 private constant SPECIAL_CARRIER_LICENSE = "SpecialCarrier";

    // Attribute managers of the five license types the roles require, one per type.
    IChoreographyParticipantAM private immutable bulkBuyerParticipants;
    IChoreographyParticipantAM private immutable manufacturerParticipants;
    IChoreographyParticipantAM private immutable middlemanParticipants;
    IChoreographyParticipantAM private immutable supplierParticipants;
    IChoreographyParticipantAM private immutable specialCarrierParticipants;

    constructor(
        address bulkBuyerAttributeManagerAddress,
        address manufacturerAttributeManagerAddress,
        address middlemanAttributeManagerAddress,
        address supplierAttributeManagerAddress,
        address specialCarrierAttributeManagerAddress
    ) {
        if (
            bulkBuyerAttributeManagerAddress == address(0) ||
            manufacturerAttributeManagerAddress == address(0) ||
            middlemanAttributeManagerAddress == address(0) ||
            supplierAttributeManagerAddress == address(0) ||
            specialCarrierAttributeManagerAddress == address(0)
        ) revert InvalidAddress();
        bulkBuyerParticipants = IChoreographyParticipantAM(bulkBuyerAttributeManagerAddress);
        manufacturerParticipants = IChoreographyParticipantAM(manufacturerAttributeManagerAddress);
        middlemanParticipants = IChoreographyParticipantAM(middlemanAttributeManagerAddress);
        supplierParticipants = IChoreographyParticipantAM(supplierAttributeManagerAddress);
        specialCarrierParticipants = IChoreographyParticipantAM(specialCarrierAttributeManagerAddress);
    }

    function _maxTaskCount() internal pure override returns (uint256) {
        return 11;
    }

    function _maxSequenceFlowCount() internal pure override returns (uint256) {
        return 15;
    }

    function _isAllowedTaskName(bytes32 nameHash) internal pure override returns (bool) {
        return
            nameHash == ORDER ||
            nameHash == ORDER_INTERMEDIATE ||
            nameHash == FWD_ORDER_INTERMEDIATE ||
            nameHash == ORDER_SPECIAL_TRANSPORT ||
            nameHash == REQUEST_DETAILS ||
            nameHash == TRANSPORT_DETAILS ||
            nameHash == PREPARE_TRANSPORT_DOCUMENTATION ||
            nameHash == WAYBILL_FOR_INTERMEDIATE ||
            nameHash == ARRIVAL_INTERMEDIATE ||
            nameHash == DELIVERY_OF_PRODUCT ||
            nameHash == OPTIONAL_CUSTOMS_INSPECTION ||
            nameHash == OPTIONAL_QUALITY_INSPECTION;
    }

    function _isProtectedNode(bytes32 nameHash) internal pure override returns (bool) {
        return nameHash == ORDER;
    }

    function _isProtectedRole(bytes32) internal pure override returns (bool) {
        return false;
    }

    function _requiredParticipantType(bytes32 nameHash) internal pure override returns (bytes32) {
        if (nameHash == BULK_BUYER) return BULK_BUYER_LICENSE;
        if (nameHash == MANUFACTURER) return MANUFACTURER_LICENSE;
        if (nameHash == MIDDLEMAN) return MIDDLEMAN_LICENSE;
        if (nameHash == SUPPLIER) return SUPPLIER_LICENSE;
        if (nameHash == SPECIAL_CARRIER) return SPECIAL_CARRIER_LICENSE;
        return bytes32(0);
    }

    function _participantAttributeManager(bytes32 participantType) internal view override returns (IChoreographyParticipantAM) {
        if (participantType == BULK_BUYER_LICENSE) return bulkBuyerParticipants;
        if (participantType == MANUFACTURER_LICENSE) return manufacturerParticipants;
        if (participantType == MIDDLEMAN_LICENSE) return middlemanParticipants;
        if (participantType == SUPPLIER_LICENSE) return supplierParticipants;
        return specialCarrierParticipants;
    }

    function _distinctRoleAccountsRequired() internal pure override returns (bool) {
        return false;
    }
}
