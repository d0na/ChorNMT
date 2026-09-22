// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./MutableAsset.sol";

abstract contract NMT is ERC721Enumerable {
    constructor() {}

    function mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) public virtual returns (address, uint256) {
        require(to != address(0), "Invalid address");
        return _mint(to, creatorSmartPolicy, holderSmartPolicy);
    }

    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal virtual returns (address, uint256);

    function _intToAddress(uint256 index) internal pure returns (address) {
        return address(uint160(index));
    }

    function getMutableAssetAddress(
        uint256 tokenId
    ) public pure returns (address) {
        return _intToAddress(tokenId);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        virtual
        override(ERC721, IERC721)
        transferFromEvaluation(from, to, tokenId)
    {
        super.transferFrom(from, to, tokenId);
    }

    modifier transferFromEvaluation(
        address from,
        address to,
        uint256 tokenId
    ) {
        require(
            MutableAsset(getMutableAssetAddress(tokenId)).transferFrom(
                from,
                to
            ),
            "TransferFrom evaluation failed"
        );
        _;
    }
}
