# Commands and scripts

This page is the reference for the root `package.json` commands and the scripts under `scripts/`.

## Public npm commands

These are the only commands intended for the normal `paper-example` workflow.

| Command | Purpose | Input | Result |
| --- | --- | --- | --- |
| `npm run start:operations` | Compiles contracts and starts the local Hardhat node. | None | Local JSON-RPC node on port 8545. |
| `npm run deploy:asset -- [input.bpmn]` | Imports a BPMN into NMT, deploys a choreography type (policies, renderer, the model contract, `ChoreographyNMT`), mints an instance born with the model, and links its roles to local accounts. | BPMN file (default `references/paper-example.bpmn`); requires the local node. | An `.nmt.json` file; prints the `ChoreographyMutableAsset` address. |
| `npm run render:asset -- <asset-address> <nmt-or-delta.json>` | Exports the asset and generates BPMN XML. | Asset address plus imported NMT or delta file. | Raw JSON, normalized JSON, and BPMN XML. |
| `npm run modify:asset -- <asset-address> <delta.json> [--no-render]` | Applies a delta to existing asset nodes. | Asset address and delta JSON. | Updated asset; also rendered artifacts unless `--no-render` is used. |
| `npm run check:size` | Checks every compiled contract against the EIP-170 runtime limit (24,576 bytes) and the EIP-3860 init-code limit (49,152 bytes); warns within `CONTRACT_SIZE_WARNING_MARGIN` bytes (default 1,024) and fails above the limit. The GitHub Actions workflow runs it after `compile`. | Compiled artifacts (`npm run compile`). | Size table; non-zero exit if a contract is too large. |
| `npm run check:invariants` | Checks the contract sources against the design decisions a grep can verify (comments and strings ignored): no `_safeMint` (D12), no version registry (D4), no model passed after deploy and an immutable `ChoreographyNMT` state (D13), no node or name-list removal in `ChoreographyMutableAsset` (D2), no setters and only `constant`/`immutable` state in policies and attribute managers (D5). The GitHub Actions workflow runs it after `check:size`. | None; no compile needed. | Non-zero exit with file, line, and decision of each violation. |
| `npm run check:gas` | Checks the current gas figures quoted in the docs (the cost benchmark of `docs/choreography-policies.md`, the model contract of D13 in `docs/decisions.md`, the paper mint in `docs/future-improvements.md`) against the newest `test:policies` and `evaluate:policies` metrics; gas is deterministic on the ephemeral network. The GitHub Actions workflow runs it after `evaluate:policies`. | Metrics under `metrics/` newer than the contracts (`npm test`, `npm run evaluate:policies`). | Non-zero exit with the doc text and the text it should read. |
| `npm run docs:uml` | Renders the UML diagrams `docs/uml/*.puml` to SVG next to their source, with PlantUML 1.2024.7 (downloaded once into `.cache/plantuml/`, checksum verified) and Graphviz. | Java and Graphviz (`dot`). | `docs/uml/*.svg`, shown in `docs/uml.md`. |
| `npm run check:uml` | Fails if an SVG is missing or was rendered from another version of its source (a source hash is stored in the SVG). The GitHub Actions workflow runs it. | None; no Java needed. | Non-zero exit on a stale diagram. |
| `npm run test:policies` (alias `npm test`) | Runs policy allow/deny integration tests, fails on any unexpected outcome, and prints receipt-derived gas costs. The GitHub Actions workflow runs it on every push. | None. | Policy matrix and per-type mint checks on an ephemeral Hardhat network. |
| `npm run evaluate:policies` | Runs the lifecycle cost evaluation for a new BPMN model. The GitHub Actions workflow runs it after `npm test`. | None. | JSON and Markdown reports with model-contract, mint, and policy-operation costs. |
| `npm run evaluate:summary` | Collects generated experiment reports in one overview. | Existing evaluation reports. | `evaluation/summary.generated.md`. |
| `npm run evaluate:all` | Cleans then executes paper, policy, and integration evaluations in the correct order. | Local operations node; Chromium installed. | Complete reports, graphs, BPMN SVG/PNG images, and unified overview. |
| `npm run evaluate:paper` | Runs the paper workflow experiment on its own choreography type: import, deploy, mint, baseline render, delta, final render, and the delta versus new instance benchmark. | Local operations node; Chromium; `gnuplot`. | Metrics, CSV, charts, BPMN SVG/PNG images, and `evaluation/experiment-summary.generated.md`. |
| `npm run setup:evaluation` | Installs the local headless Chromium used to render BPMN SVG/PNG images. | Internet access; run once after `npm install`. | Browser cache used by `evaluate:paper`. |
| `npm run clean` | Removes local Hardhat artifacts/cache, `*.generated.*` files and imported `*.nmt.json` files under `bpmn-builder-js/example/`, `metrics/`, and `evaluation/`, the `evaluation/figures/` folder, and the evaluation temporary files in `/tmp`. | None. | Reset only reproducible local outputs. |

All commands after deployment must receive the same `<asset-address>` printed by `deploy:asset`.

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
| `RPC_URL` | `http://127.0.0.1:8545` | `deploy:asset`, `modify:asset`, `render:asset` |
| `DEPLOYER_PRIVATE_KEY` | Hardhat account #0 | `deploy:asset`, `modify:asset` (signer and initial holder) |
| `ETH_USD_PRICE` | fetched from Coinbase | evaluation reports (see the [evaluation toolkit](../evaluation/README.md#usd-price-for-gas-scenarios)) |

`deploy:asset` links the roles of the minted instance to the node's unlocked accounts (`eth_accounts`, starting from index 1). It therefore works only against a local development node and supports at most as many roles as available accounts minus one (19 on a default Hardhat node).

## Public workflow

```text
start:operations → deploy:asset → render:asset → modify:asset → render:asset
```

The full command sequence is in the [README](../README.md).

`clean` is a maintenance command and is not part of the operational workflow.

## Blockchain costs

The commands print measured transaction costs after every on-chain write. Each line reports `gas used × effective gas price = ETH cost`, followed by a total for the command.

| Operation | On-chain transaction | Cost behavior |
| --- | --- | --- |
| `deploy:asset` | Deploys Master, Creator, and Holder policies, `ChoreographyTokenURIRenderer`, the model contract of the type (SSTORE2), and `ChoreographyNMT`; mints an instance, born with the model; calls `setRoles(...)` to link its roles. | Eight transactions; the model contract and the mint grow with roles, nodes, messages, and graph edges. |
| `modify:asset` | Calls `setNodes(...)`; calls `setRoles(...)` for every role in the delta `roles` map, adding new roles and overwriting the address of existing ones. | One or two transactions; a constrained Creator policy (e.g. `CreatorSmartPolicyPaperScenario`) also evaluates BPMN structural constraints. |
| `render:asset` | Reads the asset with one `tokenURI()` call and writes local files. | No blockchain transaction and no gas cost; the call executes about 1.7M gas for the evolved paper example, within the `eth_call` limits of common RPC providers. |
| `start:operations` and `clean` | Local operations only. | No gas cost. |

Costs are exact for the RPC network used by the command. On Hardhat's local node they use test ETH and have no real monetary value. On a public network, the displayed ETH value depends on the network's actual gas price; convert it to fiat currency separately using the current ETH price.

## Evaluation measurements

Deployment (import, type, and mint), modification, and rendering write JSON reports under `metrics/` with timing and model size. The [evaluation toolkit](../evaluation/README.md) aggregates them to CSV and provides Gnuplot figures for operation duration against nodes and sequence edges. Repeat scenarios and report median, mean, and standard deviation.

## Claude Code hooks

`.claude/settings.json` runs the scripts in `.claude/hooks/` during Claude Code sessions (see `CLAUDE.md`, section "Hooks, skills, and agents"): `session-start.sh` checks Node 22, `guard-generated.sh` blocks edits to generated files and build outputs, `confirm-sources.sh` asks the user before an edit to `docs/requirements.md`, `docs/decisions.md`, `references/`, or `scripts/data/`, `post-edit.sh` runs `docs:uml` after a UML source edit and `compile`, `check:size`, and `check:invariants` after a contract edit, `pre-commit.sh` runs `check:uml` and `check:invariants` before `git commit`, plus the compile and size checks when `contracts/` changed, and `test:policies`, `evaluate:policies`, and `check:gas` when `contracts/`, `scripts/`, `bpmn-builder-js/scripts/`, or a doc quoting gas changed. They do not apply outside Claude Code; CI runs the same checks for every push.

The subagents in `.claude/agents/` split the work of a session: `test-runner` (Haiku) runs these commands and returns only failures, changed outcomes, and gas deltas; `docs-reviewer` (Sonnet, read-only) checks a change against the docs and lists the mismatches.

## Implementation scripts

These scripts are used by public commands and are not intended as separate user-facing entry points.

| Script | Used by | Responsibility |
| --- | --- | --- |
| `deploy-local.js` | `deploy:asset`, `evaluate:paper` | Imports the BPMN, deploys the policies, the renderer, the model contract, and the NMT of the type, mints an instance, and links its roles (`mintAsset`). |
| `choreography-model.js` | `deploy:asset`, tests, evaluations | Builds the `InitialModel` of a type from an NMT dataset (roles without accounts), ABI-encodes it, and deploys it as the code of a data-only contract (SSTORE2). |
| `render-asset.js` | `render:asset` | Reads render metadata and triggers contract export plus BPMN generation. |
| `render-local-support.js` | `render:asset`, `modify:asset` | Writes manifest and JSON artifacts, normalizes data, and generates BPMN XML. |
| `apply-asset-delta.js` | `modify:asset` | Validates and applies delta roles and nodes. |
| `check-contract-size.js` | `check:size` | Reads `artifacts/contracts/` and enforces the contract size limits. |
| `check-invariants.js` | `check:invariants` | Greps `contracts/` for violations of the design decisions in `docs/decisions.md`; each rule names its decision. |
| `check-gas.js` | `check:gas` | Compares the gas figures listed in its `FIGURES` table with the newest metrics; a current figure added to a doc gets an entry there. |
| `render-uml.js` | `docs:uml`, `check:uml` | Renders `docs/uml/*.puml` to SVG with a pinned PlantUML and stamps each SVG with the hash of its source; `--check` compares the hashes. |
| `test-policies.js` | `test:policies` | Exercises policy allow/deny paths on one choreography type per fixture model. |
| `evaluation/run-policy-lifecycle-evaluation.js` | `evaluate:policies` | Measures deployment (model contract included), the mint of an instance, and Master/Creator/Holder allow-deny operations. |

## Evaluation scripts

The evaluation helpers are isolated under `scripts/evaluation/`:

- `metrics.js` writes per-operation JSON reports;
- `transaction-cost.js` formats receipt-derived gas and ETH costs;
- `export-metrics-csv.js` aggregates reports into a CSV file for Gnuplot.

## Other models

The legacy scripts that populated an existing asset with another dataset were removed when `ChoreographyNMT` became a choreography type: an asset is born with the model of its type. Another BPMN model is another type: `npm run deploy:asset -- references/parallel-gateway-example.bpmn` (development reference; only `paper-example` is supported).
