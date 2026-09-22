// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract SmartPolicy {
    function decodeSignature(
        bytes memory payload
    ) public pure returns (bytes4) {
        return
            bytes4(
                bytes.concat(payload[0], payload[1], payload[2], payload[3])
            );
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view virtual returns (bool);
}
