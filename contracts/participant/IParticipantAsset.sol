// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";

/// Views of a ParticipantMutableAsset (a role license) that policies may call.
/// ParticipantMutableAsset implements it, so the compiler keeps both in agreement.
interface IParticipantAsset is IMutableAsset {
    function participantType() external view returns (bytes32);
    function getCapabilities() external view returns (bytes32[] memory);
    function hasCapability(bytes32 capability) external view returns (bool);
    function getMessages() external view returns (bytes32[] memory);
}
