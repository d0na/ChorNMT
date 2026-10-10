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
| `npm run check:gas` | Checks the current gas figures quoted in the docs (the cost benchmark of `docs/choreography-policies.md`, the model contract of D13 in `docs/decisions.md`, the paper mint in `docs/future-improvements.md`) against the versioned evidence: the experiment transactions of `evaluation/evidence/experiment.json`, by key, and the test matrix of `evaluation/evidence/tests.json`, by label (decision D18). The evidence matches the code because `check:evidence` reruns it. The GitHub Actions workflow runs it after `check:evidence`. | The versioned evidence. | Non-zero exit with the doc text and the text it should read. |
| `npm run docs:uml` | Renders the UML diagrams `docs/uml/*.puml` to SVG next to their source, with PlantUML 1.2024.7 (downloaded once into `.cache/plantuml/`, checksum verified) and Graphviz. | Java and Graphviz (`dot`). | `docs/uml/*.svg`, shown in `docs/uml.md`. |
| `npm run check:uml` | Fails if an SVG is missing or was rendered from another version of its source (a source hash is stored in the SVG). The GitHub Actions workflow runs it. | None; no Java needed. | Non-zero exit on a stale diagram. |
| `npm run check:use-cases` | Checks the use case diagrams `docs/uml/use-case-*.puml` both ways against the trust tables of `docs/choreography-policies.md`, the cases of `scripts/test-policies.js`, and `evaluation/evidence/experiment.json` (decision D19): actors are trust-table columns played by experiment accounts; each use case names its row, its evidence transactions, and its tests; every granting row and every policy-decided transaction appears in a use case. The GitHub Actions workflow runs it after `check:uml`. | The annotated `.puml` sources and the versioned evidence. | Non-zero exit with each disagreement. |
| `npm run check:protocol` | Checks `docs/experiment.md` against the evidence (decision D21): every generated block and outcome placeholder matches what `scripts/experiment/protocol.js` writes from `evaluation/evidence/`, the narrative has no number or outcome word outside the placeholders, the phases follow the specification, and every parity entry of `scripts/experiment/parity.js` has an existing destination. The GitHub Actions workflow runs it after `check:use-cases`. | The versioned evidence and the protocol. | Non-zero exit with each violation. |
| `npm run test:policies` (alias `npm test`) | Runs policy allow/deny integration tests, fails on any unexpected outcome, and prints receipt-derived gas costs. With `POLICY_TESTS_OUT=<file>` it also writes the matrix as JSON (`{summary, cases}`); `evidence:update` sets it to `evaluation/evidence/tests.json`. The GitHub Actions workflow runs it on every push. | None. | Policy matrix and per-type mint checks on an ephemeral Hardhat network. |
| `npm run evidence:update [-- --out <dir>]` | Runs the experiment of `scripts/experiment/phases.js` (phases F1–F8, decision D17) on one ephemeral Hardhat network, through the same functions as `deploy:asset`, `modify:asset`, and `render:asset`, and fails if a transaction differs from the specification (order, sender, function, outcome, revert reason). Also runs `test:policies` for the test matrix and, unless `--out` is given, `scripts/experiment/protocol.js`, which rewrites the generated blocks of `docs/experiment.md`. It is the only command that writes the evidence (the `experiment` skill). | Reads the BPMN, the delta, and the trust tables of `docs/choreography-policies.md` (each transaction must name an existing row); `ETH_USD_PRICE` defaults to 3000; `EXPERIMENT_REPETITIONS` (default 10) measured runs after a warm-up, all required to produce the same evidence. Needs `gnuplot`, Chromium (`setup:evaluation`), Java, and Graphviz. | `evaluation/evidence/` (or `<dir>`): `experiment.json`, `transactions.csv`, every call trace, of each transaction and render read, in `traces.json`, baseline and final BPMN XML in `bpmn/`, one sequence diagram per phase in `uml/` (filtered and complete, PlantUML and SVG), `timings.json`, `tests.json` (the `test:policies` matrix), four charts in `charts/` (`.dat`, SVG), the BPMN drawings in `bpmn/` (SVG, `images.json`); identical across runs, timings and the duration chart excepted. |
| `npm run check:evidence` | Reruns `evidence:update -- --out` into a temporary directory and compares it with `evaluation/evidence/` (decision D18): every data file byte for byte, `timings.json` and `charts/phase-duration.dat` excepted; the SVG images are not compared byte for byte (their bytes depend on the gnuplot, PlantUML, Chromium, and font versions), but each BPMN drawing and chart must carry the SHA-256 of its versioned XML or data file (the UML ones are checked by `check:uml`). The GitHub Actions workflow runs it after `npm test`. | Same as `evidence:update`. | Non-zero exit with the missing, extra, or differing files, the transactions and test cases whose outcome or gas changed, and the path of the regenerated evidence. |
| `npm run setup:evaluation` | Installs the local headless Chromium used to draw the BPMN models with chor-js. | Internet access; run once after `npm install`. | Browser cache used by `evidence:update` and `check:evidence`. |
| `npm run clean` | Removes local Hardhat artifacts/cache, `*.generated.*` files and imported `*.nmt.json` files under `bpmn-builder-js/example/` and `metrics/`, and the BPMN viewer page in `/tmp`. The versioned evidence is not touched. | None. | Reset only reproducible local outputs. |

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
| `ETH_USD_PRICE` | 3000 | `evidence:update` and `check:evidence`: the USD columns of the evidence (see the [evaluation toolkit](../evaluation/README.md#usd-price-for-gas-scenarios)); another price is another run |
| `EXPERIMENT_REPETITIONS` | 10 | `evidence:update`, `check:evidence`: measured runs after the warm-up run |
| `POLICY_TESTS_OUT` | unset | `test:policies`: also write the test matrix as JSON to this file |
| `EVIDENCE_OUT` | `evaluation/evidence/` | the scripts of `scripts/experiment/` run alone; `evidence:update` sets it from `--out` |

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

The measurements of the paper are the experiment evidence, `evaluation/evidence/`, read in [the experiment protocol](experiment.md): gas, costs, and outcomes of every transaction, the timings over the repetitions with median, mean, and standard deviation, and the charts. Outside the experiment, `deploy:asset`, `modify:asset`, `render:asset`, and `test:policies` still write local JSON reports under `metrics/` (`*.generated.json`, git-ignored) with timing and model size, for a quick look at a single command.

## Claude Code hooks

`.claude/settings.json` runs the scripts in `.claude/hooks/` during Claude Code sessions (see `CLAUDE.md`, section "Hooks, skills, and agents"): `session-start.sh` checks Node 22, `guard-generated.sh` blocks edits to generated files and build outputs, `confirm-sources.sh` asks the user before an edit to `docs/requirements.md`, `docs/decisions.md`, `references/`, or `scripts/data/`, `post-edit.sh` runs `docs:uml` after a UML source edit and `compile`, `check:size`, and `check:invariants` after a contract edit, `guard-generated.sh` also blocks edits to `evaluation/evidence/` and to the generated blocks and outcomes of `docs/experiment.md` (its helper `protocol-blocks.mjs` compares the placeholders before and after the edit), and `pre-commit.sh` runs `check:uml`, `check:use-cases`, `check:protocol`, and `check:invariants` before `git commit`, plus the compile and size checks when `contracts/` changed, `check:evidence` when anything the experiment runs or reads changed (`contracts/`, `scripts/`, the importer, `references/`, the gnuplot templates, the evidence, the packages), and `check:gas` when the contracts, scripts, evidence, or a doc quoting gas changed. They do not apply outside Claude Code; CI runs the same checks for every push.

The subagents in `.claude/agents/` split the work of a session: `test-runner` (Haiku) runs these commands and returns only failures, changed outcomes, gas deltas, and evidence differences; `docs-reviewer` (Sonnet, read-only) checks a change against the docs and lists the mismatches; `evidence-reviewer` (Sonnet, read-only) checks the narrative of `docs/experiment.md` against the evidence and the contracts. The `experiment` skill is the runbook for running, checking, and updating the experiment.

## Implementation scripts

These scripts are used by public commands and are not intended as separate user-facing entry points.

| Script | Used by | Responsibility |
| --- | --- | --- |
| `deploy-local.js` | `deploy:asset`, `evidence:update` | Imports the BPMN, deploys the policies, the renderer, the model contract, and the NMT of the type (`deployChoreographyType`), mints an instance, and links its roles (`mintAsset`); every function takes an optional signer, so the experiment runs it on an in-process network. |
| `choreography-model.js` | `deploy:asset`, `test:policies`, `evidence:update` | Builds the `InitialModel` of a type from an NMT dataset (roles without accounts), ABI-encodes it, and deploys it as the code of a data-only contract (SSTORE2). |
| `render-asset.js` | `render:asset`, `evidence:update` | Reads render metadata and triggers contract export plus BPMN generation; an optional `readTokenURI` reads the asset through another provider than `RPC_URL`. |
| `render-local-support.js` | `render:asset`, `modify:asset` | Writes manifest and JSON artifacts, normalizes data, and generates BPMN XML. |
| `apply-asset-delta.js` | `modify:asset`, `evidence:update` | Validates and applies delta roles and nodes; an optional signer replaces the `RPC_URL` wallet. |
| `check-contract-size.js` | `check:size` | Reads `artifacts/contracts/` and enforces the contract size limits. |
| `check-invariants.js` | `check:invariants` | Greps `contracts/` for violations of the design decisions in `docs/decisions.md`; each rule names its decision. |
| `check-gas.js` | `check:gas` | Compares the gas figures listed in its `FIGURES` table with the versioned evidence; a current figure added to a doc gets an entry there. |
| `render-uml.js` | `docs:uml`, `check:uml`, `evidence:update` | Renders `docs/uml/*.puml` and `evaluation/evidence/uml/*.puml` (or `--dir <dir>`) to SVG with a pinned PlantUML and stamps each SVG with the hash of its source; `--check` compares the hashes. |
| `test-policies.js` | `test:policies`, `evidence:update` | Exercises policy allow/deny paths on one choreography type per fixture model; with `POLICY_TESTS_OUT` it writes the matrix as JSON (`evaluation/evidence/tests.json` during `evidence:update`). |
| `experiment/phases.js` | `evidence:update` | The experiment specification: accounts, role accounts, inputs, phases, and every transaction with its sender, function, expected outcome, revert reason, and trust-table row. |
| `experiment/charts.js` | `evidence:update` | Writes the data of the four charts from the evidence, recomputes every point from its primary source, draws them with the templates in `evaluation/gnuplot/experiment/`, and stamps each SVG with the SHA-256 of its data. |
| `experiment/bpmn.js` | `evidence:update` | Checks the baseline and final BPMN XML against the source, the delta, and the chain, draws them with chor-js, and checks that each drawing shows exactly the names of its XML. |
| `experiment/protocol.js`, `experiment/parity.js` | `evidence:update`, `check:protocol` | Fill the generated blocks of `docs/experiment.md` from the evidence and check its rules; the parity checklist of the former reports. |
| `experiment/sequence.js` | `evidence:update` | Generates the filtered and complete sequence diagram of each phase from the traces, parses them back, and fails unless they match the evidence. |
| `experiment/contracts.js`, `experiment/trust-tables.js` | `evidence:update`, `check:use-cases` | The contract names and ABIs of the experiment; the trust tables of `docs/choreography-policies.md` read as data. |
| `check-use-cases.js` | `check:use-cases` | Checks the annotated use case diagrams against the trust tables, the tests, and the evidence. |
| `experiment/run.js`, `experiment/update.js` | `evidence:update` | Executes the specification, checks each receipt and call trace against it, and writes the evidence; `update.js` passes `--out` to the Hardhat run. |
| `experiment/check.js` | `check:evidence` | Runs `update.js --out` into a temporary directory, compares it with the versioned evidence, checks the image stamps, and lists the outcome and gas changes. |

## Evaluation scripts

The evaluation helpers are isolated under `scripts/evaluation/`:

- `metrics.js` writes the per-command JSON reports under `metrics/` and summarizes a model (`summarizeNodes`, also used by the experiment);
- `transaction-cost.js` formats receipt-derived gas and ETH costs for the command output;
- `render-bpmn-images.js` draws a BPMN XML with chor-js in headless Chromium (`experiment/bpmn.js`).

## Other models

The legacy scripts that populated an existing asset with another dataset were removed when `ChoreographyNMT` became a choreography type: an asset is born with the model of its type. Another BPMN model is another type: `npm run deploy:asset -- references/parallel-gateway-example.bpmn` (development reference; only `paper-example` is supported).
