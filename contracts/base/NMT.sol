// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./MutableAsset.sol";
import "./SmartPolicy.sol";

abstract contract NMT is ERC721Enumerable {
    // Replaceable only with the approval of the current Master policy.
    address public masterSmartPolicy;

    event MasterSmartPolicyChanged(address masterSmartPolicy);

    error InvalidAddress();
    error MasterDenied();
    error TransferDenied();

    modifier evaluatedByMaster(
        bytes memory action,
        address resource
    ) {
        if (!SmartPolicy(masterSmartPolicy).evaluate(msg.sender, action, resource)) {
            revert MasterDenied();
        }
        _;
    }

    modifier transferFromEvaluation(
        address from,
        address to,
        uint256 tokenId
    ) {
        if (!MutableAsset(getMutableAssetAddress(tokenId)).transferFrom(from, to)) {
            revert TransferDenied();
        }
        _;
    }

    constructor(address masterSmartPolicyAddress) {
        if (masterSmartPolicyAddress == address(0)) revert InvalidAddress();
        masterSmartPolicy = masterSmartPolicyAddress;
    }

    function mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    )
        public
        evaluatedByMaster(
            abi.encodeWithSignature(
                "mint(address,address,address)",
                to,
                creatorSmartPolicy,
                holderSmartPolicy
            ),
            address(this)
        )
        returns (address, uint256)
    {
        if (to == address(0)) revert InvalidAddress();
        return _mint(to, creatorSmartPolicy, holderSmartPolicy);
    }

    function setMasterSmartPolicy(
        address masterSmartPolicyValue
    )
        external
        evaluatedByMaster(
            abi.encodeWithSignature("setMasterSmartPolicy(address)", masterSmartPolicyValue),
            address(this)
        )
    {
        if (masterSmartPolicyValue == address(0)) revert InvalidAddress();
        masterSmartPolicy = masterSmartPolicyValue;
        emit MasterSmartPolicyChanged(masterSmartPolicyValue);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        override(ERC721, IERC721)
        evaluatedByMaster(
            abi.encodeWithSignature("transferFrom(address,address)", from, to),
            getMutableAssetAddress(tokenId)
        )
        transferFromEvaluation(from, to, tokenId)
    {
        super.transferFrom(from, to, tokenId);
    }

    function getMutableAssetAddress(
        uint256 tokenId
    ) public pure returns (address) {
        return _intToAddress(tokenId);
    }

    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal virtual returns (address, uint256);

    function _intToAddress(uint256 index) internal pure returns (address) {
        return address(uint160(index));
    }
}
