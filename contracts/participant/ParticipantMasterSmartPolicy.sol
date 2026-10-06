// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/SmartPolicy.sol";
import "./IParticipantAsset.sol";

// The authority's policy over role licenses. It stands for a policy translated from XACML:
// license types, their issuers, and the organizations qualified for each type are written
// here, not set at runtime. Change them by deploying a new policy and installing it with
// setMasterSmartPolicy. Accounts are the default Hardhat accounts used by the test and
// evaluation scenarios.
contract ParticipantMasterSmartPolicy is SmartPolicy {
    bytes4 private constant MINT_WITH_PARTICIPANT_TYPE = bytes4(keccak256("mintWithParticipantType(address,address,address,bytes32)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    bytes4 private constant SET_MASTER_SMART_POLICY = bytes4(keccak256("setMasterSmartPolicy(address)"));

    bytes32 private constant SPECIAL_CARRIER = "SpecialCarrier";
    bytes32 private constant CARRIER = "Carrier";
    bytes32 private constant SUPPLIER = "Supplier";

    address private constant CARRIER_A = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc; // account 5
    address private constant CARRIER_B = 0x976EA74026E726554dB657fA54763abd0C3a0aa9; // account 6
    address private constant CARRIER_C = 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955; // account 7
    address private constant SUPPLIER_COMPANY = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f; // account 8
    address private constant AUTHORITY = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; // account 9

    // The authority: issues every license type and is the only one who replaces this policy.
    address public constant administrator = AUTHORITY;

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);

        if (signature == MINT_WITH_PARTICIPANT_TYPE) {
            return isIssuerOf(subject, _wordAt(action, 100));
        }

        if (signature == TRANSFER) {
            address from = address(uint160(uint256(_wordAt(action, 4))));
            address to = address(uint160(uint256(_wordAt(action, 36))));
            IParticipantAsset license = IParticipantAsset(resource);
            return
                subject == from &&
                license.getHolder() == from &&
                isQualifiedFor(to, license.participantType());
        }

        if (signature == SET_MASTER_SMART_POLICY) {
            return subject == AUTHORITY;
        }

        return false;
    }

    function isIssuerOf(address account, bytes32 participantType) public pure returns (bool) {
        return
            account == AUTHORITY &&
            (participantType == SPECIAL_CARRIER || participantType == CARRIER || participantType == SUPPLIER);
    }

    function isQualifiedFor(address account, bytes32 participantType) public pure returns (bool) {
        if (participantType == SPECIAL_CARRIER) {
            return account == CARRIER_A || account == CARRIER_B;
        }
        if (participantType == CARRIER) {
            return account == CARRIER_A || account == CARRIER_B || account == CARRIER_C;
        }
        if (participantType == SUPPLIER) {
            return account == SUPPLIER_COMPANY;
        }
        return false;
    }

    function _wordAt(bytes memory action, uint256 offset) private pure returns (bytes32 value) {
        require(action.length >= offset + 32, "Malformed policy action");
        assembly {
            value := mload(add(add(action, 32), offset))
        }
    }
}
