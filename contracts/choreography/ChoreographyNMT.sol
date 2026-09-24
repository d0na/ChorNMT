// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "../base/SmartPolicy.sol";
import "./ChoreographyMutableAsset.sol";
import "./ChoreographyTokenURIRenderer.sol";

contract ChoreographyNMT is NMT {
    address public immutable masterSmartPolicy;
    address public immutable tokenURIRenderer;
    mapping(uint256 => uint256) public predecessorOf;
    mapping(uint256 => uint256) public versionOf;

    modifier evaluatedByMaster(
        bytes memory action,
        address resource
    ) {
        require(
            SmartPolicy(masterSmartPolicy).evaluate(msg.sender, action, resource),
            "Operation DENIED by MASTER policy"
        );
        _;
    }

    constructor(address masterSmartPolicyAddress, address tokenURIRendererAddress)
        ERC721(
            "Mutable Choreography for a PUB Decentraland UniPi Project",
            "PUBMNTCHOREO"
        )
    {
        require(masterSmartPolicyAddress != address(0), "Invalid master policy");
        require(tokenURIRendererAddress != address(0), "Invalid tokenURI renderer");
        masterSmartPolicy = masterSmartPolicyAddress;
        tokenURIRenderer = tokenURIRendererAddress;
    }

    function mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    )
        public
        override
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
        return super.mint(to, creatorSmartPolicy, holderSmartPolicy);
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
        require(_ownerOf(predecessorTokenId) != address(0), "Unknown predecessor");

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

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        override
        evaluatedByMaster(
            abi.encodeWithSignature("transferFrom(address,address)", from, to),
            getMutableAssetAddress(tokenId)
        )
    {
        super.transferFrom(from, to, tokenId);
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
