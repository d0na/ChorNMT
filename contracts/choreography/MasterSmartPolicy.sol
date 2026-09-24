// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/MutableAsset.sol";
import "../base/SmartPolicy.sol";

contract MasterSmartPolicy is SmartPolicy {
    bytes4 private constant MINT = bytes4(keccak256("mint(address,address,address)"));
    bytes4 private constant MINT_WITH_INITIAL_MODEL = bytes4(keccak256("mintWithInitialModel(address,address,address,(string[],address[],string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[]))"));
    bytes4 private constant TRANSFER = bytes4(keccak256("transferFrom(address,address)"));
    bytes4 private constant MINT_VERSION = bytes4(keccak256("mintVersion(address,address,address,uint256)"));

    address public immutable administrator;
    bool public transfersEnabled = true;
    bool public versioningEnabled = true;
    mapping(address => bool) public authorizedCreators;
    mapping(address => bool) public eligibleHolders;

    modifier onlyAdministrator() {
        require(msg.sender == administrator, "Caller is not the policy administrator");
        _;
    }

    constructor(address administratorAddress) {
        require(administratorAddress != address(0), "Invalid administrator");
        administrator = administratorAddress;
        authorizedCreators[administratorAddress] = true;
        eligibleHolders[administratorAddress] = true;
    }

    function setAuthorizedCreator(address account, bool allowed) external onlyAdministrator {
        authorizedCreators[account] = allowed;
    }

    function setEligibleHolder(address account, bool allowed) external onlyAdministrator {
        eligibleHolders[account] = allowed;
    }

    function setTransfersEnabled(bool enabled) external onlyAdministrator {
        transfersEnabled = enabled;
    }

    function setVersioningEnabled(bool enabled) external onlyAdministrator {
        versioningEnabled = enabled;
    }

    function _word(bytes memory action, uint256 offset) private pure returns (bytes32 value) {
        require(action.length >= offset + 32, "Malformed policy action");
        assembly {
            value := mload(add(add(action, 32), offset))
        }
    }

    function _addressAt(bytes memory action, uint256 offset) private pure returns (address) {
        return address(uint160(uint256(_word(action, offset))));
    }

    function evaluate(
        address subject,
        bytes memory action,
        address resource
    ) public view override returns (bool) {
        bytes4 signature = decodeSignature(action);

        if (signature == MINT || signature == MINT_WITH_INITIAL_MODEL) {
            address holder = _addressAt(action, 4);
            return authorizedCreators[subject] && eligibleHolders[holder];
        }

        if (signature == TRANSFER) {
            address from = _addressAt(action, 4);
            address to = _addressAt(action, 36);
            return
                transfersEnabled &&
                subject == from &&
                eligibleHolders[to] &&
                MutableAsset(resource).getHolder() == from;
        }

        if (signature == MINT_VERSION) {
            address holder = _addressAt(action, 4);
            address creatorPolicy = _addressAt(action, 36);
            MutableAsset predecessor = MutableAsset(resource);
            bool holderKeepsCreatorPolicy =
                predecessor.getHolder() == subject &&
                predecessor.creatorSmartPolicy() == creatorPolicy;
            return
                versioningEnabled &&
                eligibleHolders[holder] &&
                (authorizedCreators[subject] || holderKeepsCreatorPolicy);
        }

        return false;
    }
}
