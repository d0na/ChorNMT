// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/IMutableAsset.sol";

/// Views of a ParticipantMutableAsset (a role license) that policies and the renderer may call.
/// ParticipantMutableAsset implements it, so the compiler keeps both in agreement.
interface IParticipantAsset is IMutableAsset {
    function participantType() external view returns (bytes32);
    function getName() external view returns (bytes32);
    function getProfile() external view returns (bytes32);
    function getMessages() external view returns (bytes32[] memory);
    function getMessagesWriter() external view returns (address);
    function tokenURI() external view returns (string memory);
}
