// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/NMT.sol";
import "./IParticipantAsset.sol";
import "./IParticipantPolicy.sol";

/// A role license. Its type is fixed at mint; the holder's organization data (name, profile)
/// is cleared when the license is sold, while its messages stay, marked with their writer.
contract ParticipantMutableAsset is MutableAsset, IParticipantAsset {
    bytes32 public immutable participantType;

    bytes32 private name;
    bytes32 private profile;
    address private messagesWriter;
    bytes32[] private messages;

    event NameChanged(bytes32 name);
    event ProfileChanged(bytes32 profile);
    event MessagesChanged(bytes32[] messages, address writer);

    constructor(
        address nmtAddress,
        address creatorSmartPolicyAddress,
        address holderSmartPolicyAddress,
        bytes32 participantTypeValue
    )
        MutableAsset(
            nmtAddress,
            creatorSmartPolicyAddress,
            holderSmartPolicyAddress
        )
    {
        participantType = participantTypeValue;
    }

    function setName(
        bytes32 nameValue
    )
        external
        evaluatedBySmartPolicies(msg.sender, msg.data, address(this))
    {
        _setName(nameValue);
    }

    function setProfile(
        bytes32 profileValue
    )
        external
        evaluatedBySmartPolicies(msg.sender, msg.data, address(this))
    {
        _setProfile(profileValue);
    }

    function setMessages(
        bytes32[] calldata messageValues
    )
        external
        evaluatedBySmartPolicies(msg.sender, msg.data, address(this))
    {
        _evaluateMessagesUpdate(messageValues);
        _setMessages(messageValues);
    }

    // A sale clears the seller's organization data; the messages stay with their writer.
    function transferFrom(
        address from,
        address to
    ) public override returns (bool) {
        bool approved = super.transferFrom(from, to);
        _setName(bytes32(0));
        _setProfile(bytes32(0));
        return approved;
    }

    function getName() external view returns (bytes32) {
        return name;
    }

    function getProfile() external view returns (bytes32) {
        return profile;
    }

    function getMessages() external view returns (bytes32[] memory) {
        return messages;
    }

    function getMessagesWriter() external view returns (address) {
        return messagesWriter;
    }

    function tokenURI() external view returns (string memory) {
        return NMT(nmt).tokenURI(uint160(address(this)));
    }

    function _setName(bytes32 nameValue) private {
        name = nameValue;
        emit NameChanged(nameValue);
    }

    function _setProfile(bytes32 profileValue) private {
        profile = profileValue;
        emit ProfileChanged(profileValue);
    }

    function _setMessages(bytes32[] calldata messageValues) private {
        messages = messageValues;
        messagesWriter = msg.sender;
        emit MessagesChanged(messageValues, msg.sender);
    }

    function _evaluateMessagesUpdate(bytes32[] calldata messageValues) private view {
        if (!IParticipantPolicy(creatorSmartPolicy).evaluateMessagesUpdate(address(this), messageValues)) {
            revert OperationDenied(CREATOR);
        }
        if (!IParticipantPolicy(holderSmartPolicy).evaluateMessagesUpdate(address(this), messageValues)) {
            revert OperationDenied(HOLDER);
        }
    }
}
