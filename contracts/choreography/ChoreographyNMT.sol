// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./ChoreographyMutableAsset.sol";
import "./ChoreographyTokenURIRenderer.sol";

contract ChoreographyNMT is NMT {
    address public immutable tokenURIRenderer;
    // The choreography type: every token is minted with this model (see ChoreographyMutableAsset).
    address public immutable model;

    constructor(
        address masterSmartPolicyAddress,
        address tokenURIRendererAddress,
        address modelAddress
    )
        ERC721(
            "Mutable Choreography for a PUB Decentraland UniPi Project",
            "PUBMNTCHOREO"
        )
        NMT(masterSmartPolicyAddress)
    {
        if (tokenURIRendererAddress == address(0)) revert InvalidAddress();
        tokenURIRenderer = tokenURIRendererAddress;
        if (modelAddress.code.length == 0) revert InvalidAddress();
        model = modelAddress;
    }

    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal override returns (address, uint256) {
        ChoreographyMutableAsset choreography = new ChoreographyMutableAsset(
            address(this),
            creatorSmartPolicy,
            holderSmartPolicy,
            model
        );

        uint256 tokenId = uint160(address(choreography));
        _mint(to, tokenId);

        return (address(choreography), tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        return
            ChoreographyTokenURIRenderer(tokenURIRenderer).tokenURI(
                getMutableAssetAddress(tokenId)
            );
    }
}
