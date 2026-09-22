// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/SmartPolicy.sol";

contract DenyAllSmartPolicy is SmartPolicy {
    function evaluate(
        address,
        bytes memory,
        address
    ) public pure override returns (bool) {
        return false;
    }
}
