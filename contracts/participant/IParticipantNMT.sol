// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Views of a ParticipantNMT that policies may call. ParticipantNMT implements it, so the
/// compiler keeps both in agreement.
interface IParticipantNMT {
    /// The license type of every license this NMT mints, fixed at deploy time.
    function participantType() external view returns (bytes32);
}
