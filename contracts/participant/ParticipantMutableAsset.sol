// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";

contract ParticipantMutableAsset is MutableAsset {
    struct ParticipantDescriptor {
        bytes32 name;
        string bpmn;
        bytes32 descriptor;
        bytes32[] messages;
    }

    ParticipantDescriptor public participantDescriptor;

    event StateChanged(ParticipantDescriptor participantDescriptorValue);

    constructor(
        address nmtAddress,
        address creatorSmartPolicyAddress,
        address holderSmartPolicyAddress
    )
        MutableAsset(
            nmtAddress,
            creatorSmartPolicyAddress,
            holderSmartPolicyAddress
        )
    {}

    function getParticipantDescriptor()
        public
        view
        returns (ParticipantDescriptor memory)
    {
        return participantDescriptor;
    }

    function setName(
        bytes32 nameValue
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setName(bytes32)", nameValue),
            address(this)
        )
    {
        participantDescriptor.name = nameValue;
        emit StateChanged(participantDescriptor);
    }

    function setDescriptor(
        bytes32 descriptorValue
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setDescriptor(bytes32)", descriptorValue),
            address(this)
        )
    {
        participantDescriptor.descriptor = descriptorValue;
        emit StateChanged(participantDescriptor);
    }

    function setBpmn(
        string memory bpmn
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setBpmn(string)", bpmn),
            address(this)
        )
    {
        participantDescriptor.bpmn = bpmn;
        emit StateChanged(participantDescriptor);
    }

    function setMessages(
        bytes32[] memory messages
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setMessages(bytes32[])", messages),
            address(this)
        )
    {
        participantDescriptor.messages = messages;
        emit StateChanged(participantDescriptor);
    }

    function setTokenURI(
        string memory uri
    )
        public
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setTokenURI(string)", uri),
            address(this)
        )
    {
        _setTokenURI(uri);
    }

    function getMessages() public view returns (bytes32[] memory) {
        return participantDescriptor.messages;
    }
}
