# BPMN to NMT workflow

The supported workflow has four operations after the local environment and asset have been started:

```text
import BPMN into asset → render asset → modify asset → render asset
```

The commands are deliberately limited to:

| Command | Purpose |
| --- | --- |
| `npm run start:operations` | Compile contracts and start the local blockchain. |
| `npm run deploy:asset` | Create a `ChoreographyMutableAsset`. |
| `npm run import:asset -- <asset-address> <input.bpmn> [output.nmt.json]` | Convert BPMN to NMT and store it in the asset. The NMT file defaults to `bpmn-builder-js/example/input/<name>.nmt.json`. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Export the asset from the chain and generate BPMN XML. The JSON file only supplies render metadata. |
| `npm run modify:asset -- <asset-address> <delta.json> [--no-render]` | Apply a node delta; it also renders the result unless `--no-render` is given. |

`<asset-address>` is the `ChoreographyMutableAsset` address printed by `deploy:asset`. Use the same address in every later command. Output paths are listed in [Commands and scripts](commands-and-scripts.md#public-npm-commands).

## Paper example

```bash
# Terminal 1
npm run start:operations

# Terminal 2
npm run deploy:asset
npm run import:asset -- <asset-address> references/paper-example.bpmn
npm run render:asset -- <asset-address> bpmn-builder-js/example/input/paper-example.nmt.json
npm run modify:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json --no-render
npm run render:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

## NMT mapping

Only the first `bpmn:Choreography` of the file is imported; collaborations, processes, and further choreographies are ignored.

| BPMN element | NMT representation |
| --- | --- |
| Participant | Role named after the participant `name` (or `id` when unnamed), stored without a participant (zero address). Names must be unique. |
| Start/end event | Node type `0` / `1`. Event definitions are not kept. |
| Choreography task | Node type `2`. |
| Task initiator and other participant | `initiatorRole` = `initiatingParticipantRef`; `participantRole` = the first other `participantRef`. Further participants are ignored. |
| Messages | `initiatingMessage` (initiator → participant) and `returnMessage` (participant → initiator). The message name is the message `name`, else the message flow `name`, else the message or flow `id`. |
| Sequence flow | `outgoing` of its `sourceRef` and `incoming` of its `targetRef`, as node names. |
| Exclusive / parallel gateway | Split `3` / `5` or join `4` / `6` (see below). |
| Event-based gateway | Node type `7`. |
| Outgoing flow names | `conditions`, one entry per outgoing flow, `""` when the flow has no name. `conditionExpression` is not imported. |

Every node name is the element `name` (or `id` when unnamed) and must be unique across the choreography, because names are the contract reference keys.

An exclusive or parallel gateway becomes a join when its `gatewayDirection` is `Converging`, or when no direction other than `Diverging` is set and it has more than one incoming and at most one outgoing flow. Otherwise it is a split, including mixed gateways with several incoming and several outgoing flows.

Any other flow element (intermediate events, sub-choreographies, call choreographies, inclusive or complex gateways) stops the import with an `Unsupported BPMN flow element` error. A choreography task without an initiator and a second participant is also rejected.

## Delta rules

A delta lists only changed or added nodes, but each listed node is a complete replacement. If an edge changes, include both endpoints with their full `incoming` and `outgoing` arrays. Role and node names are the current contract reference keys.

`modify:asset` validates the delta before sending it:

- `nodes` is a non-empty array; every node has `name` (non-empty string), `nodeType` (integer `0`–`7`), `incoming`, `outgoing`, `conditions` (string arrays), and `initiatorRole`, `participantRole`, `initiatingMessage`, `returnMessage` (strings, empty when unused);
- `render` contains `choreographyId`, `choreographyName`, `definitionsId`, `targetNamespace`, and `outputBaseName`;
- optional `roles` maps role names to the zero address (role not assigned) or to a `ParticipantMutableAsset` address. Each entry is sent with `setRoles`, adding new roles and binding, rebinding, or clearing the participant of existing ones; the Creator policy rejects any other address.

The contract supports adding and replacing nodes. It does not currently remove a node name from the stored list, so use a fresh asset when a clean model replacement is required.
