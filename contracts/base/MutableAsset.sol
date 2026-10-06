// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IMutableAsset.sol";
import "./NMT.sol";
import "./SmartPolicy.sol";

abstract contract MutableAsset is IMutableAsset {
    // Policy layers reported by OperationDenied.
    uint8 internal constant CREATOR = 0;
    uint8 internal constant HOLDER = 1;

    address public immutable nmt;
    address public linked;
    address public holderSmartPolicy;
    address public creatorSmartPolicy;

    error OperationDenied(uint8 layer);
    error HolderPolicyDisabled();
    error CallerNotHolder();
    error CallerNotNMT();
    error InvalidAddress();
    error ArraySizeMismatch();
    error NameRequired();

    modifier evaluatedByHolder(
        address subject,
        bytes memory action,
        address resource
    ) {
        if (!SmartPolicy(holderSmartPolicy).evaluate(subject, action, resource)) {
            revert OperationDenied(HOLDER);
        }
        _;
    }

    modifier evaluatedByCreator(
        address subject,
        bytes memory action,
        address resource
    ) {
        if (!SmartPolicy(creatorSmartPolicy).evaluate(subject, action, resource)) {
            revert OperationDenied(CREATOR);
        }
        _;
    }

    modifier evaluatedBySmartPolicies(
        address subject,
        bytes memory action,
        address resource
    ) {
        if (!SmartPolicy(creatorSmartPolicy).evaluate(subject, action, resource)) {
            revert OperationDenied(CREATOR);
        }
        if (holderSmartPolicy == address(0)) revert HolderPolicyDisabled();
        if (!SmartPolicy(holderSmartPolicy).evaluate(subject, action, resource)) {
            revert OperationDenied(HOLDER);
        }
        _;
    }

    modifier onlyHolder() {
        if (msg.sender != getHolder()) revert CallerNotHolder();
        _;
    }

    modifier onlyNMT() {
        if (msg.sender != nmt) revert CallerNotNMT();
        _;
    }

    constructor(
        address nmtAddress,
        address creatorSmartPolicyAddress,
        address holderSmartPolicyAddress
    ) {
        if (
            nmtAddress == address(0) ||
            creatorSmartPolicyAddress == address(0) ||
            holderSmartPolicyAddress == address(0)
        ) {
            revert InvalidAddress();
        }

        nmt = nmtAddress;
        creatorSmartPolicy = creatorSmartPolicyAddress;
        holderSmartPolicy = holderSmartPolicyAddress;
    }

    function getHolder() public view returns (address) {
        return NMT(nmt).ownerOf(uint160(address(this)));
    }

    function setLinked(
        address linkedNmt
    )
        public
        virtual
        evaluatedBySmartPolicies(
            msg.sender,
            abi.encodeWithSignature("setLinked(address)", linkedNmt),
            address(this)
        )
    {
        linked = linkedNmt;
    }

    function setHolderSmartPolicy(
        address holderSmartPolicyAddress
    ) public virtual onlyHolder {
        holderSmartPolicy = holderSmartPolicyAddress;
    }

    function setCreatorSmartPolicy(
        address creatorSmartPolicyAddress
    )
        public
        virtual
        evaluatedByCreator(
            msg.sender,
            abi.encodeWithSignature(
                "setCreatorSmartPolicy(address)",
                creatorSmartPolicyAddress
            ),
            address(this)
        )
    {
        creatorSmartPolicy = creatorSmartPolicyAddress;
    }

    function transferFrom(
        address from,
        address to
    )
        public
        virtual
        onlyNMT
        evaluatedByCreator(
            from,
            abi.encodeWithSignature("transferFrom(address,address)", from, to),
            address(this)
        )
        returns (bool)
    {
        holderSmartPolicy = address(0);
        return true;
    }
}
