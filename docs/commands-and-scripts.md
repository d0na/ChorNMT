# Commands and scripts

This page is the reference for the root `package.json` commands and the scripts under `scripts/`.

## Public npm commands

These are the only commands intended for the normal `paper-example` workflow.

| Command | Purpose | Input | Result |
| --- | --- | --- | --- |
| `npm run start:operations` | Compiles contracts and starts the local Hardhat node. | None | Local JSON-RPC node on port 8545. |
| `npm run deploy:asset` | Mints a new choreography asset. | None; requires the local node. | Prints the `ChoreographyMutableAsset` address. |
| `npm run import:asset -- <asset-address> <input.bpmn> [output.nmt.json]` | Imports BPMN into NMT and stores NMT in the asset. | Asset address and BPMN file; optional NMT output path. | `bpmn-builder-js/example/input/<name>.nmt.json` (default) and populated asset. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Exports the asset from the chain and generates BPMN XML. The JSON file only supplies render metadata (see below). | Asset address plus imported NMT or delta file. | Manifest, raw JSON, normalized JSON, and BPMN XML. |
| `npm run modify:asset -- <asset-address> <delta.json> [--no-render]` | Applies a delta to existing asset nodes. | Asset address and delta JSON. | Updated asset; also rendered artifacts unless `--no-render` is used. |
| `npm run deploy:participants` | Deploys a `ParticipantNMT` and its participant Creator/Holder policies. | None; requires the local node. | `bpmn-builder-js/example/contract/participant-deployment.generated.json`. |
| `npm run mint:participant -- <category>` | Mints a `ParticipantMutableAsset` owned by the signer and sets its `descriptor` to the category. | Category label (at most 31 bytes); requires `deploy:participants`. | Prints the participant asset address. |
| `npm run set:role-category -- <asset-address> <role> <category>` | Creator operation: the role accepts only participant assets of this category. | Asset address, role name, category label. | `setRoleCategory` on the asset's Creator policy. |
| `npm run assign:participant -- <asset-address> <role> <participant-address\|0x0>` | Holder operation: allowlists the participant in the asset's Holder policy, then binds it to the role; `0x0` clears the role. | Asset address, role name, participant asset address or `0x0`. | `setAllowedParticipant` (only when not yet listed) and `setRoles`. A rejected binding sends no `setRoles` and removes the new allowlist entry. |
| `npm run test:policies` (alias `npm test`) | Runs policy allow/deny integration tests, fails on any unexpected outcome, and prints receipt-derived gas costs. The GitHub Actions workflow runs it on every push. | None. | Policy matrix and atomic-mint benchmark on an ephemeral Hardhat network. |
| `npm run evaluate:paper` | Runs the paper workflow experiment on its own fresh asset: import, baseline render, delta, final render, full-population benchmark. | Local operations node; Chromium; `gnuplot`. | Metrics, CSV, charts, BPMN SVG/PNG images, and `evaluation/experiment-summary.generated.md`. |
| `npm run evaluate:policies` | Runs the lifecycle cost evaluation for a new BPMN model. | None. | JSON and Markdown reports with mint-strategy and policy-operation totals. |
| `npm run evaluate:summary` | Collects generated experiment reports in one overview. | Existing evaluation reports. | `evaluation/final-report.generated.md` (plus the compatibility copy `evaluation/summary.generated.md`). |
| `npm run evaluate:all` | Cleans then executes paper, policy, and integration evaluations in the correct order. | Local operations node; Chromium; `gnuplot`. | Complete reports, graphs, BPMN SVG/PNG images, and unified overview. |
| `npm run setup:evaluation` | Installs the local headless Chromium used to render BPMN SVG/PNG images. | Internet access; run once after `npm install`. | Browser cache used by `evaluate:paper`. |
| `npm run clean` | Removes local Hardhat artifacts/cache, `*.generated.*` files and imported `*.nmt.json` files under `bpmn-builder-js/example/`, `metrics/`, and `evaluation/`, the `evaluation/figures/` folder, and the evaluation temporary files in `/tmp`. | None. | Reset only reproducible local outputs. |

All commands after deployment must receive the same `<asset-address>` printed by `deploy:asset`.

### Participants

An imported choreography has no participants. To bind one locally:

```bash
npm run deploy:participants
npm run mint:participant -- BUYER                                   # prints <participant-address>
npm run set:role-category -- <asset-address> "Bulk Buyer" BUYER     # creator
npm run assign:participant -- <asset-address> "Bulk Buyer" <participant-address>   # holder
npm run render:asset -- <asset-address> bpmn-builder-js/example/input/paper-example.nmt.json
```

All four commands sign with `DEPLOYER_PRIVATE_KEY`, which on the local setup is both the Creator policy administrator and the holder. The exported raw JSON lists the participant address next to the role; the BPMN XML keeps role names only.

`render:asset` always reads the model from the chain. Its JSON argument only provides the render metadata: the `render` object of a delta, or, for an imported `.nmt.json`, metadata derived from the file (`<name>-from-contract` as output base name). It writes:

```text
bpmn-builder-js/example/contract/<base>-contract-manifest.generated.json
bpmn-builder-js/example/input/<base>.raw.generated.json
bpmn-builder-js/example/input/<base>.normalized.generated.json
bpmn-builder-js/example/output/<base>.generated.bpmn.xml
```

### Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| `RPC_URL` | `http://127.0.0.1:8545` | `deploy:asset`, `import:asset`, `modify:asset`, `render:asset`, participant commands |
| `DEPLOYER_PRIVATE_KEY` | Hardhat account #0 | `deploy:asset`, `import:asset`, `modify:asset`, participant commands (signer, initial holder, and Creator policy administrator) |
| `ETH_USD_PRICE` | fetched from Coinbase | evaluation reports (see the [evaluation toolkit](../evaluation/README.md#usd-price-for-gas-scenarios)) |

`import:asset` creates every role with the zero address: an imported choreography has no participants yet. Bind `ParticipantMutableAsset` addresses later with `assign:participant` (see [Participants](#participants)), or with a delta `roles` map once the participant is allowlisted.

## Public workflow

```text
start:operations → deploy:asset → import:asset → render:asset → modify:asset → render:asset
```

The full command sequence is in the [README](../README.md).

`clean` is a maintenance command and is not part of the operational workflow.

## Blockchain costs

The commands print measured transaction costs after every on-chain write. Each line reports `gas used × effective gas price = ETH cost`, followed by a total for the command.

| Operation | On-chain transaction | Cost behavior |
| --- | --- | --- |
| `deploy:asset` | Deploys Master, Creator, and Holder policies, deploys `ChoreographyNMT`, and mints the asset. | Five transactions; typically the highest setup cost. |
| `import:asset` | Calls `setRoles(...)` and `setNodes(...)`. | Two transactions; grows with roles, nodes, messages, and graph edges. |
| `mintWithInitialModel(...)` | Mints and initializes a trusted model with its Creator/Holder policies and an `InitialModel` struct in one NMT transaction. | One transaction; replaces the mint plus two import transactions for fixed templates. |
| `modify:asset` | Calls `setNodes(...)`; calls `setRoles(...)` for every role in the delta `roles` map, adding new roles and binding, rebinding, or clearing their `ParticipantMutableAsset`. | One or two transactions; a configured Creator policy also evaluates BPMN structural constraints. |
| `deploy:participants` | Deploys `ParticipantNMT` and the two participant policies. | Three transactions. |
| `mint:participant` | Mints a participant asset and calls `setDescriptor`. | Two transactions. |
| `set:role-category` | Calls `setRoleCategory` on the Creator policy. | One transaction. |
| `assign:participant` | Calls `setAllowedParticipant` (if needed) and `setRoles`. | One or two transactions. |
| `render:asset` | Reads contract state and writes local files. | No blockchain transaction and no gas cost. |
| `start:operations` and `clean` | Local operations only. | No gas cost. |

Costs are exact for the RPC network used by the command. On Hardhat's local node they use test ETH and have no real monetary value. On a public network, the displayed ETH value depends on the network's actual gas price; convert it to fiat currency separately using the current ETH price.

## Evaluation measurements

Import, modification, and rendering write JSON reports under `metrics/` with timing and model size. The [evaluation toolkit](../evaluation/README.md) aggregates them to CSV and provides Gnuplot figures for operation duration against nodes and sequence edges. Repeat scenarios and report median, mean, and standard deviation.

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
| `participants.js` | `deploy:participants`, `mint:participant`, `set:role-category`, `assign:participant` | Participant deployment, minting, role categories, and holder assignments. |
| `test-policies.js` | `test:policies` | Exercises policy allow/deny paths and compares initial-population gas. |
| `evaluation/run-paper-example-experiment.js` | `evaluate:paper` | Runs the paper workflow, exports CSV, renders charts and BPMN images. |
| `evaluation/run-policy-lifecycle-evaluation.js` | `evaluate:policies` | Measures deployment, empty versus populated mint, and Master/Creator/Holder allow-deny operations. |
| `evaluation/generate-evaluation-summary.js` | `evaluate:summary` | Builds the final report from the available evaluation reports. |

## Evaluation scripts

The evaluation helpers are isolated under `scripts/evaluation/`:

- `metrics.js` writes per-operation JSON reports;
- `transaction-cost.js` formats receipt-derived gas and ETH costs;
- `export-metrics-csv.js` aggregates reports into a CSV file for Gnuplot;
- `render-bpmn-images.js` renders BPMN XML to SVG/PNG with `chor-js` and headless Chromium.

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
