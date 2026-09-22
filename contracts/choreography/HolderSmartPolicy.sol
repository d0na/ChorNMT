// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";

contract HolderSmartPolicy is SmartPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
    bytes4 private constant SET_TOKEN_URI = bytes4(keccak256("setTokenURI(string)"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));
    bytes4 private constant SET_CREATOR_POLICY = bytes4(keccak256("setCreatorSmartPolicy(address)"));

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        if (MutableAsset(resource).getHolder() != subject) {
            return false;
        }

        bytes4 signature = decodeSignature(action);
        return
            signature == SET_ROLES ||
            signature == SET_NODES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED ||
            signature == SET_CREATOR_POLICY;
    }
}
