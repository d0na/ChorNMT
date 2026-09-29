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
    string public tokenURI;
    // Set by the Creator policy administrator (the certifier): the role this license grants.
    bytes32 public participantType;
    bytes32[] private capabilities;

    event StateChanged(ParticipantDescriptor participantDescriptorValue);
    event ParticipantTypeChanged(bytes32 participantType);
    event CapabilitiesChanged(bytes32[] capabilities);

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
        tokenURI = uri;
    }

    function setParticipantType(
        bytes32 participantTypeValue
    )
        public
        evaluatedByCreator(
            msg.sender,
            abi.encodeWithSignature("setParticipantType(bytes32)", participantTypeValue),
            address(this)
        )
    {
        participantType = participantTypeValue;
        emit ParticipantTypeChanged(participantTypeValue);
    }

    function setCapabilities(
        bytes32[] memory capabilityValues
    )
        public
        evaluatedByCreator(
            msg.sender,
            abi.encodeWithSignature("setCapabilities(bytes32[])", capabilityValues),
            address(this)
        )
    {
        capabilities = capabilityValues;
        emit CapabilitiesChanged(capabilityValues);
    }

    function getCapabilities() public view returns (bytes32[] memory) {
        return capabilities;
    }

    function hasCapability(bytes32 capability) public view returns (bool) {
        for (uint256 i = 0; i < capabilities.length; i++) {
            if (capabilities[i] == capability) {
                return true;
            }
        }
        return false;
    }

    function getMessages() public view returns (bytes32[] memory) {
        return participantDescriptor.messages;
    }
}
