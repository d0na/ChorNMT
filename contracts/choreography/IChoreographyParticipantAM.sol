// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Attributes of the organizations that may play a choreography role, read by the Creator policy.
interface IChoreographyParticipantAM {
    /// The type of a genuine, certified role license; zero for any other address.
    function participantTypeOf(address participant) external view returns (bytes32);
}
