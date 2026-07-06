// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./ChoreographyMutableAsset.sol";

contract ChoreographyNMT is NMT {
    constructor()
        ERC721(
            "Mutable Choreography for a PUB Decentraland UniPi Project",
            "PUBMNTCHOREO"
        )
    {}

    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal override returns (address, uint256) {
        ChoreographyMutableAsset choreography = new ChoreographyMutableAsset(
            address(this),
            creatorSmartPolicy,
            holderSmartPolicy
        );

        uint256 tokenId = uint160(address(choreography));
        _safeMint(to, tokenId);

        return (address(choreography), tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        return
            ChoreographyMutableAsset(getMutableAssetAddress(tokenId)).tokenURI();
    }
}
