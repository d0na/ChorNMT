// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./IParticipantNMT.sol";
import "./ParticipantMutableAsset.sol";
import "./ParticipantTokenURIRenderer.sol";

// One license type: the type is fixed at deploy time and every license minted here gets it.
// Another type is another ParticipantNMT, as another choreography model is another ChoreographyNMT.
contract ParticipantNMT is NMT, IParticipantNMT {
    bytes32 public immutable participantType;
    address public immutable tokenURIRenderer;

    error ParticipantTypeRequired();

    constructor(
        address masterSmartPolicyAddress,
        address tokenURIRendererAddress,
        bytes32 participantTypeValue
    )
        ERC721(
            "Mutable Participant for a PUB Decentraland UniPi Project",
            "PUBMNTPARTICIPANT"
        )
        NMT(masterSmartPolicyAddress)
    {
        if (tokenURIRendererAddress == address(0)) revert InvalidAddress();
        if (participantTypeValue == bytes32(0)) revert ParticipantTypeRequired();
        tokenURIRenderer = tokenURIRendererAddress;
        participantType = participantTypeValue;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        return
            ParticipantTokenURIRenderer(tokenURIRenderer).tokenURI(
                getMutableAssetAddress(tokenId)
            );
    }

    // Called by the public mint of NMT, after the Master check: the license gets the type of this NMT.
    function _mint(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy
    ) internal override returns (address, uint256) {
        ParticipantMutableAsset participant = new ParticipantMutableAsset(
            address(this),
            creatorSmartPolicy,
            holderSmartPolicy,
            participantType
        );

        uint256 tokenId = uint160(address(participant));
        _mint(to, tokenId);

        return (address(participant), tokenId);
    }
}
