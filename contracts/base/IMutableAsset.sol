// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Views of a MutableAsset that tokens and policies may call.
interface IMutableAsset {
    function nmt() external view returns (address);
    function linked() external view returns (address);
    function creatorSmartPolicy() external view returns (address);
    function holderSmartPolicy() external view returns (address);
    function getHolder() external view returns (address);
}
