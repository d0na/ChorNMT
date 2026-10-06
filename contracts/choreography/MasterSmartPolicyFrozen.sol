// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MasterSmartPolicy.sol";

// The Master rules with ownership transfers and new versions closed: a different XACML
// policy, installed with setMasterSmartPolicy when the authority freezes the choreographies.
contract MasterSmartPolicyFrozen is MasterSmartPolicy {
    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);
        if (signature == TRANSFER || signature == MINT_VERSION) {
            return false;
        }
        return super.evaluate(subject, action, resource);
    }
}
