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
    bytes32 private constant BULK_BUYER = "BulkBuyer";
    bytes32 private constant MANUFACTURER = "Manufacturer";
    bytes32 private constant MIDDLEMAN = "Middleman";

    // Messages of the paper-example choreography, by name. A license type may declare the
    // messages its participant sends: the message on its band of each task it takes part in.
    bytes32 private constant PURCHASE_ORDER = "Purchase Order"; // Bulk Buyer, Order
    bytes32 private constant ORDER_CONFIRMATION = "Order Confirmation"; // Manufacturer, Order
    bytes32 private constant COMPONENT_ORDER = "Component Order"; // Manufacturer, Order Intermediate
    bytes32 private constant DELIVERY_DATE_COMMITMENT = "Delivery Date Commitment"; // Middleman, Order Intermediate
    bytes32 private constant FORWARDED_ORDER = "Forwarded Order"; // Middleman, FWD Oder Intermediate
    bytes32 private constant TRANSPORT_ORDER = "Transport Order"; // Middleman, Order Special Transport
    bytes32 private constant TRANSPORT_DOCUMENTATION = "Prepare transport documentation"; // Middleman, Prepare Transport Documentation
    bytes32 private constant GOODS_RECEIPT = "Goods Receipt"; // Manufacturer, Arrival Intermediate
    bytes32 private constant DELIVERY_NOTE = "Delivery Note"; // Manufacturer, Delivery of Product
    bytes32 private constant PAYMENT = "Payment"; // Bulk Buyer, Delivery of Product
    bytes32 private constant AVAILABILITY_NOTICE = "Availability Notice"; // Supplier, FWD Oder Intermediate
    bytes32 private constant PICKUP_SCHEDULE = "Pickup Schedule"; // Special Carrier, Order Special Transport
    bytes32 private constant CARGO_DETAILS_REQUEST = "Cargo Details Request"; // Special Carrier, Request Details
    bytes32 private constant LOADING_SLOT = "Loading Slot"; // Supplier, Request Details
    bytes32 private constant CARGO_SPECIFICATION = "Cargo Specification"; // Supplier, Transport Details
    bytes32 private constant VEHICLE_ASSIGNMENT = "Vehicle Assignment"; // Special Carrier, Transport Details
    bytes32 private constant WAYBILL = "Waybill"; // Supplier, Waybill for Intermediate
    bytes32 private constant SIGNED_WAYBILL = "Signed Waybill"; // Special Carrier, Waybill for Intermediate
    bytes32 private constant ARRIVAL_NOTICE = "Arrival Notice"; // Special Carrier, Arrival Intermediate

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
                message == PICKUP_SCHEDULE ||
                message == CARGO_DETAILS_REQUEST ||
                message == VEHICLE_ASSIGNMENT ||
                message == SIGNED_WAYBILL ||
                message == ARRIVAL_NOTICE;
        }
        if (participantType == CARRIER) {
            return message == PICKUP_SCHEDULE || message == ARRIVAL_NOTICE;
        }
        if (participantType == SUPPLIER) {
            return
                message == AVAILABILITY_NOTICE ||
                message == LOADING_SLOT ||
                message == CARGO_SPECIFICATION ||
                message == WAYBILL;
        }
        if (participantType == BULK_BUYER) {
            return message == PURCHASE_ORDER || message == PAYMENT;
        }
        if (participantType == MANUFACTURER) {
            return
                message == ORDER_CONFIRMATION ||
                message == COMPONENT_ORDER ||
                message == GOODS_RECEIPT ||
                message == DELIVERY_NOTE;
        }
        if (participantType == MIDDLEMAN) {
            return
                message == DELIVERY_DATE_COMMITMENT ||
                message == FORWARDED_ORDER ||
                message == TRANSPORT_ORDER ||
                message == TRANSPORT_DOCUMENTATION;
        }
        return false;
    }
}
