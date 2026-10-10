// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";
import "../base/SmartPolicy.sol";
import "./IChoreographyPolicy.sol";

// The default Holder policy: the holder may edit roles, nodes, and links, with no further
// constraint on their content.
contract HolderSmartPolicy is SmartPolicy, IChoreographyPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        if (IMutableAsset(resource).getHolder() != subject) {
            return false;
        }

        bytes4 signature = decodeSignature(action);
        return
            signature == SET_ROLES ||
            signature == SET_NODES ||
            signature == SET_LINKED;
    }

    function evaluateNodeUpdate(
        address,
        string[] calldata,
        uint8[] calldata,
        string[][] calldata,
        string[][] calldata
    ) external pure returns (bool) {
        return true;
    }

    function evaluateRoleUpdate(
        address,
        string[] calldata,
        address[] calldata
    ) external pure returns (bool) {
        return true;
    }
}
