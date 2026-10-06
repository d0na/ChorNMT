// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Domain checks of a choreography update. The asset asks both its Creator and its Holder
/// policy; a policy without constraints returns true without reading the asset.
interface IChoreographyPolicy {
    function evaluateNodeUpdate(
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory incoming,
        string[][] memory outgoing
    ) external view returns (bool);

    function evaluateRoleUpdate(
        address asset,
        string[] memory roleNames,
        address[] memory addresses
    ) external view returns (bool);
}
