// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/SmartPolicy.sol";
import "./IParticipantAsset.sol";
import "./IParticipantNMT.sol";

// The policy of the license authorities over role licenses. It stands for a policy translated
// from XACML: license types (one ParticipantNMT each), the authority that issues each type, and
// the organizations qualified for each type are written here, not set at runtime. Change them by
// deploying a new policy and installing it with setMasterSmartPolicy. Accounts are the default
// Hardhat accounts used by the test and evaluation scenarios.
contract ParticipantMasterSmartPolicy is SmartPolicy {
    bytes4 private constant MINT = bytes4(keccak256("mint(address,address,address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    bytes4 private constant SET_MASTER_SMART_POLICY = bytes4(keccak256("setMasterSmartPolicy(address)"));

    bytes32 private constant SPECIAL_CARRIER = "SpecialCarrier";
    bytes32 private constant CARRIER = "Carrier";
    bytes32 private constant SUPPLIER = "Supplier";
    bytes32 private constant BULK_BUYER = "BulkBuyer";
    bytes32 private constant MANUFACTURER = "Manufacturer";
    bytes32 private constant MIDDLEMAN = "Middleman";

    // Organizations.
    address private constant CARRIER_A = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc; // account 5
    address private constant CARRIER_B = 0x976EA74026E726554dB657fA54763abd0C3a0aa9; // account 6
    address private constant CARRIER_C = 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955; // account 7
    address private constant SUPPLIER_COMPANY = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f; // account 8
    address private constant BULK_BUYER_COMPANY = 0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097; // account 14
    address private constant MANUFACTURER_COMPANY = 0xcd3B766CCDd6AE721141F452C550Ca635964ce71; // account 15
    address private constant MIDDLEMAN_COMPANY = 0x2546BcD3c84621e976D8185a91A922aE77ECEc30; // account 16

    // Authorities: each one issues its own license types and no other.
    address private constant TRANSPORT_AUTHORITY = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; // account 9
    address private constant BULK_BUYER_AUTHORITY = 0xBcd4042DE499D14e55001CcbB24a551F3b954096; // account 10
    address private constant MANUFACTURER_AUTHORITY = 0x71bE63f3384f5fb98995898A86B02Fb2426c5788; // account 11
    address private constant MIDDLEMAN_AUTHORITY = 0xFABB0ac9d68B0B445fB7357272Ff202C5651694a; // account 12
    address private constant SUPPLIER_AUTHORITY = 0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec; // account 13

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);
        // The resource is the license NMT, which fixes the type of the licenses it mints. Only
        // the authority of that type mints its licenses and replaces this policy on its NMT.
        if (signature == MINT || signature == SET_MASTER_SMART_POLICY) {
            return isIssuerOf(subject, IParticipantNMT(resource).participantType());
        }

        if (signature == TRANSFER) {
            address from = _addressAt(action, 4);
            address to = _addressAt(action, 36);
            IParticipantAsset license = IParticipantAsset(resource);
            return
                subject == from &&
                license.getHolder() == from &&
                isQualifiedFor(to, license.participantType());
        }

        return false;
    }

    function isIssuerOf(address account, bytes32 participantType) public pure returns (bool) {
        if (participantType == SPECIAL_CARRIER || participantType == CARRIER) {
            return account == TRANSPORT_AUTHORITY;
        }
        if (participantType == SUPPLIER) {
            return account == SUPPLIER_AUTHORITY;
        }
        if (participantType == BULK_BUYER) {
            return account == BULK_BUYER_AUTHORITY;
        }
        if (participantType == MANUFACTURER) {
            return account == MANUFACTURER_AUTHORITY;
        }
        if (participantType == MIDDLEMAN) {
            return account == MIDDLEMAN_AUTHORITY;
        }
        return false;
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
        if (participantType == BULK_BUYER) {
            return account == BULK_BUYER_COMPANY;
        }
        if (participantType == MANUFACTURER) {
            return account == MANUFACTURER_COMPANY;
        }
        if (participantType == MIDDLEMAN) {
            return account == MIDDLEMAN_COMPANY;
        }
        return false;
    }
}
