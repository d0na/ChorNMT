// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract SmartPolicy {
    error MalformedAction();
    error InvalidAddress();

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

    // Static ABI arguments of the action, read at a fixed offset (4 + 32 * index).
    function _wordAt(bytes memory action, uint256 offset) internal pure returns (bytes32 value) {
        if (action.length < offset + 32) revert MalformedAction();
        assembly {
            value := mload(add(add(action, 32), offset))
        }
    }

    function _addressAt(bytes memory action, uint256 offset) internal pure returns (address value) {
        if (action.length < offset + 32) revert MalformedAction();
        assembly {
            value := and(mload(add(add(action, 32), offset)), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}
