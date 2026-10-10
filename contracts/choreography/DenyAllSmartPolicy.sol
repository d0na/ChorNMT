// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/SmartPolicy.sol";
import "./IChoreographyPolicy.sol";

// Denies every action and every domain check: installed as Holder policy it freezes an asset.
contract DenyAllSmartPolicy is SmartPolicy, IChoreographyPolicy {
    function evaluate(
        address,
        bytes memory,
        address
    ) public pure override returns (bool) {
        return false;
    }

    function evaluateNodeUpdate(
        address,
        string[] calldata,
        uint8[] calldata,
        string[][] calldata,
        string[][] calldata
    ) external pure returns (bool) {
        return false;
    }

    function evaluateRoleUpdate(
        address,
        string[] calldata,
        address[] calldata
    ) external pure returns (bool) {
        return false;
    }
}
