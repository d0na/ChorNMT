// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";

contract CreatorSmartPolicy is SmartPolicy {
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        return
            decodeSignature(action) != SET_CREATOR_POLICY &&
            MutableAsset(resource).getHolder() == subject;
    }
}
