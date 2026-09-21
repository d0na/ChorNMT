# Delta Update And Solidity Calls

This document describes:

- what `npm run augment:parallel-gateway-example -- <asset-address>` does
- which delta payload it sends
- which Solidity methods must be called to reproduce the same update

## Script Purpose

The script [scripts/augment-parallel-gateway-example-local.js](../scripts/augment-parallel-gateway-example-local.js) is a local example of an external update applied to an already populated choreography asset.

It performs these steps:

1. populate the target asset with the baseline `parallel-gateway-example` dataset
2. render the baseline BPMN export
3. apply an external `setNodes(...)` update with a delta only
4. render the updated BPMN export

The update is delta-only in the sense that the `setNodes(...)` call does not resend the full `parallel-gateway-example` dataset.

## Delta Scope

The script updates only these nodes:

- `Parallel Join`
- `Activity4`
- `End`

It also introduces these messages on the new task:

- `msg5`
- `msg6`

## Delta Payload Used By The Script

The script builds this logical payload before calling `setNodes(...)`:

```js
{
  names: ["Parallel Join", "Activity4", "End"],
  nodeTypes: [6, 2, 1],
  incoming: [
    ["Activity2", "Activity3"],
    ["Parallel Join"],
    ["Activity4"]
  ],
  outgoing: [
    ["Activity4"],
    ["End"],
    []
  ],
  conditions: [
    [],
    [],
    []
  ],
  initiatorRoles: [
    "",
    "Ale",
    ""
  ],
  participantRoles: [
    "",
    "Fra",
    ""
  ],
  initiatingMessages: [
    "",
    "msg5",
    ""
  ],
  returnMessages: [
    "",
    "msg6",
    ""
  ]
}
```

## Contract Methods

Reference: [contracts/choreography/ChoreographyMutableAsset.sol](../contracts/choreography/ChoreographyMutableAsset.sol)

The relevant write methods are:

- `setRoles(string[] roleNames, address[] addresses)`
- `setNodes(string[] names, uint8[] nodeTypes, string[][] incoming, string[][] outgoing, string[][] conditions, string[] initiatorRoles, string[] participantRoles, string[] initiatingMessages, string[] returnMessages)`

### NodeType Mapping

- `0` = `START_EVENT`
- `1` = `END_EVENT`
- `2` = `TASK`
- `3` = `EXCLUSIVE_SPLIT`
- `4` = `EXCLUSIVE_JOIN`
- `5` = `PARALLEL_SPLIT`
- `6` = `PARALLEL_JOIN`
- `7` = `EVENT_BASED_GATEWAY`

## Solidity Call Shape

`setNodes(...)` accepts parallel arrays, not an array of structs.

For each index `i`, the node is described by:

- `names[i]`
- `nodeTypes[i]`
- `incoming[i]`
- `outgoing[i]`
- `conditions[i]`
- `initiatorRoles[i]`
- `participantRoles[i]`
- `initiatingMessages[i]`
- `returnMessages[i]`

Because of this, every touched node must be sent in its final state.

`setNodes(...)` does not patch a single field in place. For every node in the payload it overwrites:

- node type
- initiator role
- participant role
- initiating message
- return message
- full `incoming`
- full `outgoing`
- full `conditions`

## Solidity Example: Roles First If Needed

If the roles used by the new task do not already exist on-chain, call `setRoles(...)` first:

```solidity
IChoreographyMutableAsset(assetAddress).setRoles(
    toStringArray2("Ale", "Fra"),
    toAddressArray2(
        0x1111111111111111111111111111111111111111,
        0x2222222222222222222222222222222222222222
    )
);
```

If `Ale` and `Fra` already exist, this call is not needed.

## Solidity Example: Delta Update

To reproduce the same delta as the script, the Solidity-side call is conceptually:

```solidity
IChoreographyMutableAsset(assetAddress).setNodes(
    toStringArray3("Parallel Join", "Activity4", "End"),
    toUint8Array3(6, 2, 1),
    toStringMatrix3(
        toStringArray2("Activity2", "Activity3"),
        toStringArray1("Parallel Join"),
        toStringArray1("Activity4")
    ),
    toStringMatrix3(
        toStringArray1("Activity4"),
        toStringArray1("End"),
        toEmptyStringArray()
    ),
    toStringMatrix3(
        toEmptyStringArray(),
        toEmptyStringArray(),
        toEmptyStringArray()
    ),
    toStringArray3("", "Ale", ""),
    toStringArray3("", "Fra", ""),
    toStringArray3("", "msg5", ""),
    toStringArray3("", "msg6", "")
);
```

This example is schematic. Solidity does not provide helpers like `toStringArray3(...)` natively. In practice those arrays must be allocated manually in memory before the call.

## Solidity Example: Manual Memory Allocation

Below is a more realistic Solidity example showing how the arrays would be created before calling `setNodes(...)`.

```solidity
function applyDelta(address assetAddress) external {
    IChoreographyMutableAsset target = IChoreographyMutableAsset(assetAddress);

    string[] memory names = new string[](3);
    names[0] = "Parallel Join";
    names[1] = "Activity4";
    names[2] = "End";

    uint8[] memory nodeTypes = new uint8[](3);
    nodeTypes[0] = 6;
    nodeTypes[1] = 2;
    nodeTypes[2] = 1;

    string[][] memory incoming = new string[][](3);
    incoming[0] = new string[](2);
    incoming[0][0] = "Activity2";
    incoming[0][1] = "Activity3";
    incoming[1] = new string[](1);
    incoming[1][0] = "Parallel Join";
    incoming[2] = new string[](1);
    incoming[2][0] = "Activity4";

    string[][] memory outgoing = new string[][](3);
    outgoing[0] = new string[](1);
    outgoing[0][0] = "Activity4";
    outgoing[1] = new string[](1);
    outgoing[1][0] = "End";
    outgoing[2] = new string[](0);

    string[][] memory conditions = new string[][](3);
    conditions[0] = new string[](0);
    conditions[1] = new string[](0);
    conditions[2] = new string[](0);

    string[] memory initiatorRoles = new string[](3);
    initiatorRoles[0] = "";
    initiatorRoles[1] = "Ale";
    initiatorRoles[2] = "";

    string[] memory participantRoles = new string[](3);
    participantRoles[0] = "";
    participantRoles[1] = "Fra";
    participantRoles[2] = "";

    string[] memory initiatingMessages = new string[](3);
    initiatingMessages[0] = "";
    initiatingMessages[1] = "msg5";
    initiatingMessages[2] = "";

    string[] memory returnMessages = new string[](3);
    returnMessages[0] = "";
    returnMessages[1] = "msg6";
    returnMessages[2] = "";

    target.setNodes(
        names,
        nodeTypes,
        incoming,
        outgoing,
        conditions,
        initiatorRoles,
        participantRoles,
        initiatingMessages,
        returnMessages
    );
}
```

## Important Constraint

The current contract supports additive or replacement updates for the nodes explicitly sent in `setNodes(...)`, but it does not remove names from the stored node-name list.

That means:

- adding a node is supported
- updating a node is supported
- changing graph edges is supported by resending the touched nodes
- true deletion is not currently modeled as a dedicated operation

## Related Files

- [scripts/augment-parallel-gateway-example-local.js](../scripts/augment-parallel-gateway-example-local.js)
- [scripts/populate-local.js](../scripts/populate-local.js)
- [scripts/run-local-flow.js](../scripts/run-local-flow.js)
- [docs/contract-hierarchy.md](contract-hierarchy.md)
