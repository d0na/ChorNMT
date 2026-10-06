// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./ChoreographyMutableAsset.sol";
import "./ChoreographyTokenURIRenderer.sol";

contract ChoreographyNMT is NMT {
    address public immutable tokenURIRenderer;
    mapping(uint256 => uint256) public predecessorOf;
    mapping(uint256 => uint256) public versionOf;

    error UnknownPredecessor();

    constructor(address masterSmartPolicyAddress, address tokenURIRendererAddress)
        ERC721(
            "Mutable Choreography for a PUB Decentraland UniPi Project",
            "PUBMNTCHOREO"
        )
        NMT(masterSmartPolicyAddress)
    {
        if (tokenURIRendererAddress == address(0)) revert InvalidAddress();
        tokenURIRenderer = tokenURIRendererAddress;
    }

    function mintVersion(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy,
        uint256 predecessorTokenId
    )
        public
        evaluatedByMaster(
            abi.encodeWithSignature(
                "mintVersion(address,address,address,uint256)",
                to,
                creatorSmartPolicy,
                holderSmartPolicy,
                predecessorTokenId
            ),
            getMutableAssetAddress(predecessorTokenId)
        )
        returns (address, uint256)
    {
        if (_ownerOf(predecessorTokenId) == address(0)) revert UnknownPredecessor();

        (address assetAddress, uint256 tokenId) = _mint(
            to,
            creatorSmartPolicy,
            holderSmartPolicy
        );
        predecessorOf[tokenId] = predecessorTokenId;
        versionOf[tokenId] = versionOf[predecessorTokenId] + 1;

        return (assetAddress, tokenId);
    }

    function mintWithInitialModel(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy,
        ChoreographyMutableAsset.InitialModel memory model
    )
        public
        evaluatedByMaster(
            abi.encodeWithSelector(
                this.mintWithInitialModel.selector,
                to,
                creatorSmartPolicy,
                holderSmartPolicy,
                model
            ),
            address(this)
        )
        returns (address, uint256)
    {
        (address assetAddress, uint256 tokenId) = _mint(
            to,
            creatorSmartPolicy,
            holderSmartPolicy
        );
        ChoreographyMutableAsset(assetAddress).initializeChoreography(model);

        return (assetAddress, tokenId);
    }

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
