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

| BPMN element | NMT representation |
| --- | --- |
| Participant | Role |
| Start/end event | Start/end node |
| Choreography task | Task node |
| Task initiator and other participant | `initiatorRole` and `participantRole` |
| Messages | `initiatingMessage` and `returnMessage` |
| Sequence flow | `incoming` and `outgoing` references |
| Gateway | Gateway node and `conditions` |

## Delta rules

A delta lists only changed or added nodes, but each listed node is a complete replacement. If an edge changes, include both endpoints with their full `incoming` and `outgoing` arrays. Role and node names are the current contract reference keys.

The contract supports adding and replacing nodes. It does not remove a node name from the stored list: a clean model is a new instance (mint), and a different starting model is a new choreography type (`deploy:asset` with another BPMN).
