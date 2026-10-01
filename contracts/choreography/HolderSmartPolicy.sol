// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";

contract HolderSmartPolicy is SmartPolicy {
    bytes4 private constant SET_ROLES = bytes4(keccak256("setRoles(string[],address[])"));
    bytes4 private constant SET_NODES = bytes4(keccak256("setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"));
    bytes4 private constant SET_TOKEN_URI = bytes4(keccak256("setTokenURI(string)"));
    bytes4 private constant SET_LINKED = bytes4(keccak256("setLinked(address)"));

    // asset => holder => participant asset => allowed. Keyed by holder so that a
    // new holder does not inherit the previous holder's choices after a transfer.
    mapping(address => mapping(address => mapping(address => bool))) public allowedParticipants;

    function setAllowedParticipant(address asset, address participant, bool allowed) external {
        require(MutableAsset(asset).getHolder() == msg.sender, "Caller is not the holder");
        allowedParticipants[asset][msg.sender][participant] = allowed;
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        if (MutableAsset(resource).getHolder() != subject) {
            return false;
        }

        bytes4 signature = decodeSignature(action);
        if (signature == SET_ROLES) {
            return _allowedParticipants(subject, action, resource);
        }
        return
            signature == SET_NODES ||
            signature == SET_TOKEN_URI ||
            signature == SET_LINKED;
    }

    // Every non-empty role address must be in the holder's allowlist for this asset.
    function _allowedParticipants(
        address holder,
        bytes memory action,
        address asset
    ) private view returns (bool) {
        bytes memory arguments = new bytes(action.length - 4);
        assembly {
            mcopy(add(arguments, 32), add(action, 36), mload(arguments))
        }
        (, address[] memory participants) = abi.decode(arguments, (string[], address[]));
        for (uint256 i = 0; i < participants.length; i++) {
            if (participants[i] != address(0) && !allowedParticipants[asset][holder][participants[i]]) {
                return false;
            }
        }
        return true;
    }
}
