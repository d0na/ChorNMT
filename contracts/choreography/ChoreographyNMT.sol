// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "../base/SmartPolicy.sol";
import "./ChoreographyMutableAsset.sol";

contract ChoreographyNMT is NMT {
    address public immutable masterSmartPolicy;

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

    constructor(address masterSmartPolicyAddress)
        ERC721(
            "Mutable Choreography for a PUB Decentraland UniPi Project",
            "PUBMNTCHOREO"
        )
    {
        require(masterSmartPolicyAddress != address(0), "Invalid master policy");
        masterSmartPolicy = masterSmartPolicyAddress;
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
        return
            ChoreographyMutableAsset(getMutableAssetAddress(tokenId)).tokenURI();
    }
}
