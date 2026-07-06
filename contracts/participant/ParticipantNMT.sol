// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./ParticipantMutableAsset.sol";

contract ParticipantNMT is NMT {
    constructor()
        ERC721(
            "Mutable Participant for a PUB Decentraland UniPi Project",
            "PUBMNTPARTICIPANT"
        )
    {}

    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal override returns (address, uint256) {
        ParticipantMutableAsset participant = new ParticipantMutableAsset(
            address(this),
            creatorSmartPolicy,
            holderSmartPolicy
        );

        uint256 tokenId = uint160(address(participant));
        _safeMint(to, tokenId);

        return (address(participant), tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        return
            ParticipantMutableAsset(getMutableAssetAddress(tokenId)).tokenURI();
    }
}
