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
| `npm run import:asset -- <asset-address> <input.bpmn>` | Convert BPMN to NMT and store it in the asset. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Export an asset and generate BPMN XML. |
| `npm run modify:asset -- <asset-address> <delta.json> --no-render` | Apply a node delta without rendering it. |

`<asset-address>` is the `ChoreographyMutableAsset` address printed by `deploy:asset`. Use the same address in every later command.

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

The contract supports adding and replacing nodes. It does not currently remove a node name from the stored list, so use a fresh asset when a clean model replacement is required.
