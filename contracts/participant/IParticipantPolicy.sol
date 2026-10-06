// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Domain check of a participant license update. Both the Creator and the Holder policy
/// of a license implement it, since the asset asks both.
interface IParticipantPolicy {
    function evaluateMessagesUpdate(
        address asset,
        bytes32[] calldata messages
    ) external view returns (bool);
}
