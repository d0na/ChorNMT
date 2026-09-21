# Commands and scripts

This page is the reference for the root `package.json` commands and the scripts under `scripts/`.

## Public npm commands

These are the only commands intended for the normal `paper-example` workflow.

| Command | Purpose | Input | Result |
| --- | --- | --- | --- |
| `npm run start:operations` | Compiles contracts and starts the local Hardhat node. | None | Local JSON-RPC node on port 8545. |
| `npm run deploy:asset` | Mints a new choreography asset. | None; requires the local node. | Prints the `ChoreographyMutableAsset` address. |
| `npm run import:asset -- <asset-address> <input.bpmn>` | Imports BPMN into NMT and stores NMT in the asset. | Asset address and BPMN file. | An `.nmt.json` file and populated asset. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Exports the asset and generates BPMN XML. | Asset address plus imported NMT or delta file. | Raw JSON, normalized JSON, and BPMN XML. |
| `npm run modify:asset -- <asset-address> <delta.json> [--no-render]` | Applies a delta to existing asset nodes. | Asset address and delta JSON. | Updated asset; also rendered artifacts unless `--no-render` is used. |
| `npm run clean` | Removes generated files and local Hardhat build artifacts. | None. | Clean local workspace artifacts. |

All commands after deployment must receive the same `<asset-address>` printed by `deploy:asset`.

## Public workflow

```text
start:operations → deploy:asset → import:asset → render:asset → modify:asset → render:asset
```

The full command sequence is in the [README](../README.md).

`clean` is a maintenance command and is not part of the operational workflow.

## Implementation scripts

These scripts are used by public commands and are not intended as separate user-facing entry points.

| Script | Used by | Responsibility |
| --- | --- | --- |
| `deploy-local.js` | `deploy:asset` | Deploys NMT, policies, and mints the choreography asset. |
| `import-bpmn-asset.js` | `import:asset` | Combines BPMN-to-NMT conversion with asset population. |
| `populate-local.js` | `import:asset` | Sends roles and nodes to `setRoles(...)` and `setNodes(...)`. |
| `render-asset.js` | `render:asset` | Reads render metadata and triggers contract export plus BPMN generation. |
| `render-local-support.js` | `render:asset`, `modify:asset` | Writes manifest and JSON artifacts, normalizes data, and generates BPMN XML. |
| `apply-asset-delta.js` | `modify:asset` | Validates and applies delta roles and nodes. |

## Development and legacy scripts

The following files are retained as development references or low-level utilities. They are deliberately not exposed as root npm commands and are not part of the supported paper-example workflow.

| Script or data | Purpose |
| --- | --- |
| `data/pizza-delivery.js` | Small built-in dataset used by the original renderer example. |
| `data/parallel-gateway-example.js` | Small dataset for parallel gateway behavior. |
| `augment-parallel-gateway-example-local.js` | Historical incremental-update demonstration. |
| `run-local-flow.js` | Historical registered-dataset flow. |
| `run-imported-bpmn-flow.js` | Earlier combined import-and-render flow. |
| `populate-nmt.js` | Low-level NMT-file population helper. |
| `deploy.js` | Generic deployment helper retained for development. |

They can be removed in a later cleanup once no external experiment or test still depends on them.
