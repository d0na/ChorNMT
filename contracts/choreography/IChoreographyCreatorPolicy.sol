// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IChoreographyCreatorPolicy {
    function evaluateNodeUpdate(
        address asset,
        string[] memory names,
        uint8[] memory nodeTypes,
        string[][] memory outgoing
    ) external view returns (bool);
}
