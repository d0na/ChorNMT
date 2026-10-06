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

    modifier evaluatedByHolder(
        address subject,
        bytes memory action,
        address resource
    ) {
        require(
            SmartPolicy(holderSmartPolicy).evaluate(subject, action, resource),
            "Operation DENIED by HOLDER policy"
        );
        _;
    }

    modifier evaluatedByCreator(
        address subject,
        bytes memory action,
        address resource
    ) {
        require(
            SmartPolicy(creatorSmartPolicy).evaluate(subject, action, resource),
            "Operation DENIED by CREATOR policy"
        );
        _;
    }

    modifier evaluatedBySmartPolicies(
        address subject,
        bytes memory action,
        address resource
    ) {
        require(
            SmartPolicy(creatorSmartPolicy).evaluate(subject, action, resource),
            "Operation DENIED by CREATOR policy"
        );
        require(holderSmartPolicy != address(0), "Holder policy disabled");
        require(
            SmartPolicy(holderSmartPolicy).evaluate(subject, action, resource),
            "Operation DENIED by HOLDER policy"
        );
        _;
    }

    modifier onlyHolder() {
        require(msg.sender == getHolder(), "Caller is not the holder");
        _;
    }

    modifier onlyNMT() {
        require(msg.sender == nmt, "Caller should be NMT");
        _;
    }

    constructor(
        address nmtAddress,
        address creatorSmartPolicyAddress,
        address holderSmartPolicyAddress
    ) {
        require(nmtAddress != address(0), "Invalid NMT address");
        require(
            creatorSmartPolicyAddress != address(0),
            "Invalid creatorSmartPolicy address"
        );
        require(
            holderSmartPolicyAddress != address(0),
            "Invalid holderSmartPolicy address"
        );

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
