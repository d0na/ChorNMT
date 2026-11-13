// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ConstrainedCreatorSmartPolicy.sol";

// Creator constraints of the synthetic models of the extended evaluation
// (scripts/experiment/extended.js, docs/extended-evaluation.md): the rules of a constrained
// Creator policy with limits no synthetic model reaches, so that an update pays for the checks
// (the count of the tasks and flows of the whole model, the known endpoints) and is never
// denied for its size. It names no task, no protected node, and no license type.
contract CreatorSmartPolicyScaleScenario is ConstrainedCreatorSmartPolicy {
    function _maxTaskCount() internal pure override returns (uint256) {
        return 1000;
    }

    function _maxSequenceFlowCount() internal pure override returns (uint256) {
        return 2000;
    }

    function _isAllowedTaskName(bytes32) internal pure override returns (bool) {
        return true;
    }

    function _isProtectedNode(bytes32) internal pure override returns (bool) {
        return false;
    }

    function _isProtectedRole(bytes32) internal pure override returns (bool) {
        return false;
    }

    function _requiredParticipantType(bytes32) internal pure override returns (bytes32) {
        return bytes32(0);
    }

    // Never called: no role requires a license type.
    function _participantAttributeManager(bytes32) internal pure override returns (IChoreographyParticipantAM) {
        return IChoreographyParticipantAM(address(0));
    }

    function _distinctRoleAccountsRequired() internal pure override returns (bool) {
        return false;
    }
}
