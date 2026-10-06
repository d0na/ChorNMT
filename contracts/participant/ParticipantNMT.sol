// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../base/NMT.sol";
import "./ParticipantMutableAsset.sol";
import "./ParticipantTokenURIRenderer.sol";

contract ParticipantNMT is NMT {
    address public immutable tokenURIRenderer;

    // A license is always minted with its type: use mintWithParticipantType.
    error ParticipantTypeRequired();

    constructor(address masterSmartPolicyAddress, address tokenURIRendererAddress)
        ERC721(
            "Mutable Participant for a PUB Decentraland UniPi Project",
            "PUBMNTPARTICIPANT"
        )
        NMT(masterSmartPolicyAddress)
    {
        if (tokenURIRendererAddress == address(0)) revert InvalidAddress();
        tokenURIRenderer = tokenURIRendererAddress;
    }

    function mintWithParticipantType(
        address to,
        address creatorSmartPolicy,
        address holderSmartPolicy,
        bytes32 participantType
    )
        external
        evaluatedByMaster(msg.data, address(this))
        returns (address, uint256)
    {
        if (to == address(0)) revert InvalidAddress();
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

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        return
            ParticipantTokenURIRenderer(tokenURIRenderer).tokenURI(
                getMutableAssetAddress(tokenId)
            );
    }

    function _mint(
        address,
        address,
        address
    ) internal pure override returns (address, uint256) {
        revert ParticipantTypeRequired();
    }
}
