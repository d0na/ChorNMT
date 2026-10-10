# BPMN to NMT workflow

The supported workflow has four operations after the local environment has been started:

```text
deploy a choreography type from BPMN and mint an instance → render asset → modify asset → render asset
```

A `ChoreographyNMT` is one choreography type: `deploy:asset` imports the BPMN into an NMT dataset, stores it as the model of the type (the ABI-encoded `InitialModel`, as the code of a data-only contract), deploys the NMT that fixes that model, mints an instance born with it, and links the roles of the instance to local accounts. The model keeps only the role names; each instance assigns its own accounts or licenses.

The commands are deliberately limited to:

| Command | Purpose |
| --- | --- |
| `npm run start:operations` | Compile contracts and start the local blockchain. |
| `npm run deploy:asset -- [input.bpmn]` | Convert BPMN to NMT, deploy the choreography type (`references/paper-example.bpmn` by default), and mint a `ChoreographyMutableAsset` born with its model. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Export an asset and generate BPMN XML. |
| `npm run modify:asset -- <asset-address> <delta.json> --no-render` | Apply a node delta without rendering it. |

`<asset-address>` is the `ChoreographyMutableAsset` address printed by `deploy:asset`. Use the same address in every later command.

## Paper example

```bash
# Terminal 1
npm run start:operations

# Terminal 2
npm run deploy:asset -- references/paper-example.bpmn
npm run render:asset -- <asset-address> bpmn-builder-js/example/input/paper-example.nmt.json
npm run modify:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json --no-render
npm run render:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

## NMT mapping

Only the first `bpmn:Choreography` of the file is imported; collaborations, processes, and further choreographies are ignored.

| BPMN element | NMT representation |
| --- | --- |
| Participant | Role named after the participant `name` (or `id` when unnamed). Names must be unique. |
| Start/end event | Node type `0` / `1`. Event definitions are not kept. |
| Choreography task | Node type `2`. |
| Task initiator and other participant | `initiatorRole` = `initiatingParticipantRef`; `participantRole` = the first other `participantRef`. Further participants are ignored. |
| Messages | `initiatingMessage` (initiator → participant) and `returnMessage` (participant → initiator). The message name is the message `name`, else the message flow `name`, else the message or flow `id`. |
| Sequence flow | `outgoing` of its `sourceRef` and `incoming` of its `targetRef`, as node names. The sequence flows are the source of truth: the `<incoming>`/`<outgoing>` children of a node are optional in BPMN. |
| Exclusive / parallel gateway | Split `3` / `5` or join `4` / `6` (see below). |
| Event-based gateway | Node type `7`. |
| Outgoing flow names | `conditions`, one entry per outgoing flow, `""` when the flow has no name. `conditionExpression` is not imported. |

Every node name is the element `name` (or `id` when unnamed) and must be unique across the choreography, because names are the contract reference keys.

An exclusive or parallel gateway becomes a join when its `gatewayDirection` is `Converging`, or when no direction other than `Diverging` is set and it has more than one incoming and at most one outgoing flow. Otherwise it is a split, including mixed gateways with several incoming and several outgoing flows.

Any other flow element (intermediate events, sub-choreographies, call choreographies, inclusive or complex gateways) stops the import with an `Unsupported BPMN flow element` error. A choreography task without an initiator and a second participant is also rejected.

## Delta rules

`modify:asset` validates the delta before sending it:

- `nodes` is a non-empty array; every node has `name` (non-empty string), `nodeType` (integer `0`–`7`), `incoming`, `outgoing`, `conditions` (string arrays), and `initiatorRole`, `participantRole`, `initiatingMessage`, `returnMessage` (strings, empty when unused);
- `render` contains `choreographyId`, `choreographyName`, `definitionsId`, `targetNamespace`, and `outputBaseName`;
- optional `roles` maps role names to Ethereum addresses. Each entry is sent with `setRoles`, adding new roles and overwriting the address of existing ones.

A delta lists only changed or added nodes, but each listed node is a complete replacement. If an edge changes, include both endpoints with their full `incoming` and `outgoing` arrays. Role and node names are the current contract reference keys.

The contract supports adding and replacing nodes. It does not remove a node name from the stored list: a clean model is a new instance (mint), and a different starting model is a new choreography type (`deploy:asset` with another BPMN).
