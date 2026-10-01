# ChoreographyMutableAsset

[contracts/choreography/ChoreographyMutableAsset.sol](../contracts/choreography/ChoreographyMutableAsset.sol) stores one BPMN choreography on-chain. Each instance is minted by `ChoreographyNMT`, which owns its ERC-721 token (token ID = `uint160(asset address)`). It extends [`MutableAsset`](../contracts/base/MutableAsset.sol). See [Architettura](architettura.md) for the overall design and [Choreography policies](choreography-policies.md) for who may call each method.

Examples use the `paper-example` ([references/paper-example.bpmn](../references/paper-example.bpmn)).

## Fields

### Inherited from `MutableAsset`

| Field | Type | Description |
| --- | --- | --- |
| `nmt` | `address` (immutable, public) | The `ChoreographyNMT` that minted the asset. |
| `linked` | `address` (public) | Optional link to another NMT or asset; set with `setLinked`. |
| `tokenURI` | `string` (public) | Token metadata URI, returned by `ChoreographyNMT.tokenURI`. |
| `creatorSmartPolicy` | `address` (public) | Creator policy; must also implement `IChoreographyCreatorPolicy`. |
| `holderSmartPolicy` | `address` (public) | Holder policy; reset to zero by a transfer. |

### Choreography descriptor

The model is kept in a private `Descriptor`, read through the view methods below.

| Field | Type | Description |
| --- | --- | --- |
| `nodesByName` | `mapping(string => Node)` | Nodes keyed by name. |
| `hasNode` | `mapping(string => bool)` | Whether a node name was ever written. |
| `nodeNames` | `string[]` | Node names in first-insertion order. |
| `roles` | `mapping(string => address)` | Role name → participant asset, or the zero address when no participant is assigned. |
| `hasRole` | `mapping(string => bool)` | Whether a role name was ever written. |
| `roleNames` | `string[]` | Role names in first-insertion order. |

Names are the reference keys: nodes refer to each other and to roles by name. Neither nodes nor roles can be removed; writing an existing name overwrites it.

### `Node`

| Field | Type | Description | `Order Special Transport` |
| --- | --- | --- | --- |
| `name` | `string` | Node key. | `"Order Special Transport"` |
| `nodeType` | `NodeType` | Element kind (see below). | `TASK` |
| `incoming` | `string[]` | Names of the source nodes of incoming sequence flows. | `["FWD Oder Intermediate"]` |
| `outgoing` | `string[]` | Names of the target nodes of outgoing sequence flows. | `["Parallel Transport Preparation Split"]` (after the delta) |
| `conditions` | `string[]` | One label per outgoing flow, `""` when none. | `[""]` |
| `initiatorRole` | `string` | Initiating role of a task; `""` otherwise. | `"Middleman"` |
| `participantRole` | `string` | Other role of a task; `""` otherwise. | `"Special Carrier"` |
| `initiatingMessage` | `string` | Message from initiator to participant. | `"Message_0dai5by"` |
| `returnMessage` | `string` | Message from participant to initiator. | `""` |

### `NodeType`

| Value | Name | BPMN element |
| ---: | --- | --- |
| 0 | `START_EVENT` | Start event |
| 1 | `END_EVENT` | End event |
| 2 | `TASK` | Choreography task |
| 3 | `EXCLUSIVE_SPLIT` | Diverging exclusive gateway |
| 4 | `EXCLUSIVE_JOIN` | Converging exclusive gateway |
| 5 | `PARALLEL_SPLIT` | Diverging parallel gateway |
| 6 | `PARALLEL_JOIN` | Converging parallel gateway |
| 7 | `EVENT_BASED_GATEWAY` | Event-based gateway |

### `InitialModel`

Argument of `ChoreographyNMT.mintWithInitialModel`. It holds `roleNames` and, as parallel arrays, the same node fields as `setNodes` (`names`, `nodeTypes`, `incoming`, `outgoing`, `conditions`, `initiatorRoles`, `participantRoles`, `initiatingMessages`, `returnMessages`). It has no role addresses: roles start without participants.

## Events

| Event | Emitted by | Content |
| --- | --- | --- |
| `RolesChanged(string[] roleNames)` | `setRoles`, `initializeChoreography` | Names of the roles written. |
| `NodesChanged(string[] nodeNames)` | `setNodes`, `initializeChoreography` | Names of the nodes written. |
| `ChoreographyInitialized(string[] roleNames, string[] nodeNames)` | `initializeChoreography` | Initial role and node names. |

There is no versioning field: the model history is the sequence of these events and of the transactions that emitted them (their calldata holds the full node values).

## Write methods

All write methods except `initializeChoreography` and `setHolderSmartPolicy` pass through `evaluatedBySmartPolicies`: the Creator policy must allow the action, the Holder policy must be set, and the Holder policy must allow it. With the default policies only the current holder passes.

| Method | Additional checks | Effect |
| --- | --- | --- |
| `setRoles(string[] roleNames, address[] addresses)` | Creator `evaluateRoleUpdate`: no empty, duplicate, or protected names; every address is zero or a participant asset of the role category. The Holder policy also requires non-zero addresses to be in the holder allowlist. | Adds new roles and binds, rebinds, or clears the participant of existing ones. Mismatched array lengths and empty names are rejected by `evaluateRoleUpdate`. |
| `setNodes(string[] names, NodeType[] nodeTypes, string[][] incoming, string[][] outgoing, string[][] conditions, string[] initiatorRoles, string[] participantRoles, string[] initiatingMessages, string[] returnMessages)` | Creator `evaluateNodeUpdate`: task and flow limits, task-name allowlist, known endpoints, consistent flows, protected nodes (each when configured). | Writes every listed node in full, replacing `incoming`, `outgoing`, and `conditions`. Adds unknown names to `nodeNames`. `evaluateNodeUpdate` rejects empty or duplicate names and mismatched `names`/`nodeTypes`/`incoming`/`outgoing` lengths; other mismatched arrays revert with `Array size mismatch`. |
| `initializeChoreography(InitialModel model)` | `onlyNMT`; no policy evaluation (the initial model is trusted). | Writes roles with the zero address and all nodes, then emits `ChoreographyInitialized`. Called once by `mintWithInitialModel`. Reverts with `Array size mismatch`, `Role name required`, or `Node name required` on malformed input. |
| `setTokenURI(string uri)` | — | Sets `tokenURI`. |
| `setLinked(address linkedNmt)` | — (inherited) | Sets `linked`. |
| `setHolderSmartPolicy(address)` | `onlyHolder`, no policy evaluation (inherited). | Replaces the Holder policy. |
| `setCreatorSmartPolicy(address)` | Evaluated by the current Creator policy only (inherited); the choreography Creator policy allows only its administrator. | Replaces the Creator policy. |
| `transferFrom(address from, address to)` | `onlyNMT`; Creator policy must allow `from` (inherited). | Called by `ChoreographyNMT.transferFrom`; resets `holderSmartPolicy` to zero. |

Policy denials revert with `Operation DENIED by CREATOR policy`, `Operation DENIED by HOLDER policy`, `Holder policy disabled`, `Operation DENIED by CREATOR BPMN policy` (`setNodes`), or `Operation DENIED by CREATOR role policy` (`setRoles`).

### Delta example

The `paper-example` delta inserts a parallel split after `Order Special Transport`. Because `setNodes` replaces edges in full, the delta resends `Order Special Transport` with its new `outgoing` and every other touched node in its final state; see [BPMN to NMT workflow](bpmn-to-nmt-workflow.md#delta-rules).

## Read methods

| Method | Returns |
| --- | --- |
| `getNode(string name)` | All `Node` fields, in struct order. An unknown name returns empty values (`nodeType` = `START_EVENT`); check `hasNode` first. |
| `getNodeNames()` | `nodeNames`. |
| `hasNode(string name)` | Whether the node exists. |
| `getNodeTypeAndOutgoing(string name)` | `(uint8 nodeType, string[] outgoing)`; used by the Creator policy to count tasks and flows. |
| `getNodeTypeAndEdges(string name)` | `(uint8 nodeType, string[] incoming, string[] outgoing)`; used by the Creator policy for endpoint and consistency checks. |
| `getRole(string role)` | The participant asset bound to the role, or the zero address. An unknown role also returns zero; use `getRoleNames` to tell them apart. |
| `getRoleNames()` | `roleNames`. |
| `getHolder()` | Current owner of the asset token (inherited). |

Right after importing the `paper-example`:

```text
getRoleNames()             = ["Bulk Buyer", "Manufacturer", "Middleman", "Supplier", "Special Carrier"]
getRole("Special Carrier") = 0x0000…0000
getNodeNames().length      = 11
```
