// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";

// The choreography authority's policy over the NMT. It stands for a policy translated from
// XACML: the administrator, the authorized creator, and the eligible holders are written here,
// not set at runtime. They are three parts: the administrator does not mint.
// Change them by deploying a new policy and installing it with setMasterSmartPolicy.
// Accounts are the default Hardhat accounts used by the test and evaluation scenarios.
contract MasterSmartPolicy is SmartPolicy {
    bytes4 private constant MINT = bytes4(keccak256("mint(address,address,address)"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    bytes4 private constant SET_MASTER_SMART_POLICY = bytes4(keccak256("setMasterSmartPolicy(address)"));

    address private constant AUTHORITY = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // account 0
    address private constant PARTNER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // account 1
    address private constant CREATOR = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65; // account 4

    // The authority: the only one who replaces this policy. It is not an authorized creator.
    address public constant administrator = AUTHORITY;

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);

        if (signature == SET_MASTER_SMART_POLICY) {
            return subject == AUTHORITY;
        }

        if (signature == MINT) {
            return _isAuthorizedCreator(subject) && _isEligibleHolder(_addressAt(action, 4));
        }

        if (signature == TRANSFER) {
            address from = _addressAt(action, 4);
            return
                subject == from &&
                _isEligibleHolder(_addressAt(action, 36)) &&
                IMutableAsset(resource).getHolder() == from;
        }

        return false;
    }

    function _isAuthorizedCreator(address account) private pure returns (bool) {
        return account == CREATOR;
    }

    function _isEligibleHolder(address account) private pure returns (bool) {
        return account == AUTHORITY || account == PARTNER;
    }
}
