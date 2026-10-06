// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../participant/IParticipantAsset.sol";
import "./IChoreographyParticipantAM.sol";

// Attribute manager of the role licenses, as a policy information point: it answers which
// license type an address holds, and leaves to the Creator policy which type a role requires.
// The registry and the certifier are deployed contracts, so they are bound at deploy time.
contract ChoreographyParticipantAM is IChoreographyParticipantAM {
    error InvalidAddress();

    address public immutable participantNmt;
    address public immutable participantCertifier;

    constructor(address participantNmtAddress, address participantCertifierAddress) {
        if (participantNmtAddress == address(0) || participantCertifierAddress == address(0)) {
            revert InvalidAddress();
        }
        participantNmt = participantNmtAddress;
        participantCertifier = participantCertifierAddress;
    }

    // A license is genuine when participantNmt has minted its token (the token id is the
    // license address, and only the NMT deploys the license) and certified when its Creator
    // policy is participantCertifier.
    function participantTypeOf(address participant) external view returns (bytes32) {
        if (participant == address(0)) {
            return bytes32(0);
        }
        try IERC721(participantNmt).ownerOf(uint256(uint160(participant))) returns (address) {
            IParticipantAsset license = IParticipantAsset(participant);
            if (license.creatorSmartPolicy() != participantCertifier) {
                return bytes32(0);
            }
            return license.participantType();
        } catch {
            return bytes32(0);
        }
    }
}
