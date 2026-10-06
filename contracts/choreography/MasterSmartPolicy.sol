// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";

// The choreography authority's policy over the NMT. It stands for a policy translated from
// XACML: authorized creators and eligible holders are written here, not set at runtime.
// Change them by deploying a new policy and installing it with setMasterSmartPolicy.
// Accounts are the default Hardhat accounts used by the test and evaluation scenarios.
contract MasterSmartPolicy is SmartPolicy {
    bytes4 internal constant MINT = bytes4(keccak256("mint(address,address,address)"));
    bytes4 internal constant MINT_WITH_INITIAL_MODEL = bytes4(keccak256("mintWithInitialModel(address,address,address,(string[],address[],string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[]))"));
    bytes4 internal constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    bytes4 internal constant MINT_VERSION = bytes4(keccak256("mintVersion(address,address,address,uint256)"));
    bytes4 internal constant SET_MASTER_SMART_POLICY = bytes4(keccak256("setMasterSmartPolicy(address)"));

    address private constant AUTHORITY = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // account 0
    address private constant PARTNER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // account 1

    // The authority: creates choreographies and is the only one who replaces this policy.
    address public constant administrator = AUTHORITY;

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view virtual override returns (bool) {
        bytes4 signature = decodeSignature(action);

        if (signature == SET_MASTER_SMART_POLICY) {
            return subject == AUTHORITY;
        }

        if (signature == MINT || signature == MINT_WITH_INITIAL_MODEL) {
            return _isAuthorizedCreator(subject) && _isEligibleHolder(_addressAt(action, 4));
        }

        if (signature == TRANSFER) {
            address from = _addressAt(action, 4);
            return
                subject == from &&
                _isEligibleHolder(_addressAt(action, 36)) &&
                IMutableAsset(resource).getHolder() == from;
        }

        if (signature == MINT_VERSION) {
            if (!_isEligibleHolder(_addressAt(action, 4))) {
                return false;
            }
            if (_isAuthorizedCreator(subject)) {
                return true;
            }
            // A holder may version its own choreography if it keeps the Creator policy.
            IMutableAsset predecessor = IMutableAsset(resource);
            return
                predecessor.getHolder() == subject &&
                predecessor.creatorSmartPolicy() == _addressAt(action, 36);
        }

        return false;
    }

    function _isAuthorizedCreator(address account) private pure returns (bool) {
        return account == AUTHORITY;
    }

    function _isEligibleHolder(address account) private pure returns (bool) {
        return account == AUTHORITY || account == PARTNER;
    }
}
