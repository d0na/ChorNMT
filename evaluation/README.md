# Evaluation toolkit

Each `deploy:asset` (import, choreography type, and mint), `modify:asset`, and `render:asset` execution writes a JSON report under `metrics/`. The report records wall-clock duration and model/delta size: roles, nodes, tasks, gateways, sequence edges, and messages. On-chain commands also print receipt-derived gas and ETH cost in their console output.

## Experiment evidence (being implemented)

The experiment and its evidence are described in [the experiment protocol](../docs/experiment.md), whose tables, figures, and outcomes are generated from `evaluation/evidence/` (`npm run check:protocol` keeps them in sync).

The evaluation is being replaced by one experiment whose evidence is versioned (decisions D16–D22 in [`docs/decisions.md`](../docs/decisions.md#experiment-and-evidence)). Its first step is in place:

```bash
npm run evidence:update                 # writes evaluation/evidence/
npm run evidence:update -- --out <dir>  # exploratory run, elsewhere
```

It runs the phases of [`scripts/experiment/phases.js`](../scripts/experiment/phases.js) on one ephemeral Hardhat network, needs no node, and fails if a transaction differs from the specification. It needs `gnuplot`, the Chromium of `npm run setup:evaluation`, Java, and Graphviz. It runs the experiment once as warm-up and `EXPERIMENT_REPETITIONS` more times (default 10), each on a fresh network, and fails unless every run produces the same evidence. `evaluation/evidence/` holds `experiment.json` (provenance, accounts, inputs with SHA-256 — the BPMN, the delta, and `docs/choreography-policies.md`, whose trust-table rows every transaction must name — and per phase the actors, the policies in force with their bytecode hash, the instance state, and the transactions with outcome, revert reason, trust-table row, and gas), `transactions.csv`, every call trace, of each transaction and render read, in `traces.json`, the baseline and final BPMN XML in `bpmn/`, one sequence diagram per phase in `uml/` (`F<n>` filtered, `F<n>-full` complete, PlantUML and SVG), `tests.json` (the `test:policies` matrix), `timings.json` (median, min, max, mean, standard deviation, and samples of every phase and sub-step, without the time spent tracing and checking, and the machine), four gnuplot charts in `charts/` (gas by phase, duration by phase, model structure, `setNodes` gas by nodes written: data in `.dat`, image in SVG), and the chor-js drawings of the two models in `bpmn/` (SVG, with the hash of their XML in `images.json`). Before drawing, every chart point is recomputed from its primary source (gas from the call traces, statistics from their samples, counts from the XML), and the BPMN models are checked: the baseline is equivalent to the source BPMN, the final one is the baseline with the delta written over it, both equal the model the chain returned, and each drawing shows exactly the names of its XML. Two runs produce identical files, timings and the duration chart excepted. Until the last step lands (`check:evidence`, the `experiment` skill, and the removal of the commands below), the commands below stay the source of the reports.

## Setup (once)

Run once after cloning the repository:

```bash
npm install
(cd bpmn-builder-js && npm install)
npm run setup:evaluation
```

`setup:evaluation` downloads the local Chromium used to produce the BPMN SVG/PNG images.
Install `gnuplot` as well: it generates the PNG charts included in the paper workflow.

```bash
# macOS (Homebrew)
brew install gnuplot

# Debian/Ubuntu
sudo apt install gnuplot
```

## Complete evaluation run

This is the recommended and complete workflow.

In terminal 1, start the local node and leave it running:

```bash
npm run start:operations
```

In terminal 2, regenerate all experimental data:

```bash
npm run evaluate:all
```

Open `evaluation/final-report.generated.md`. It is the final report and contains:

- paper workflow: BPMN import, choreography type deployment and mint, baseline/final chor-js images, delta update versus a new instance, and gnuplot charts;
- policy lifecycle: model contract and mint costs, and Master/Creator/Holder outcomes;
- policy integration tests: complete allow/deny matrix with gas and wei costs;
- direct links to generated BPMN XML, SVG/PNG, CSV, JSON metrics, and contract exports.

`evaluate:all` performs `clean → compile → evaluate:paper → evaluate:policies → test:policies → evaluate:summary`. It is safe to use for every fresh evaluation run.

## USD price for gas scenarios

By default, the evaluation fetches the current ETH/USD spot price automatically from Coinbase and uses it to calculate the `USD @10 gwei`, `USD @30 gwei`, and `USD @100 gwei` columns. No configuration is needed for an exploratory run.

Without a fixed value, each report fetches its own spot price, so the paper, policy lifecycle, and policy test reports may use slightly different prices. For a reproducible experiment, provide a fixed positive value; the same value is then used by all three reports (an invalid or zero value is ignored and the price is fetched):

```bash
ETH_USD_PRICE=3000 npm run evaluate:all
```

If the automatic price lookup is unavailable and `ETH_USD_PRICE` is not set, USD scenario cells are reported as `N/A` while gas and wei measurements remain available.

## Targeted runs

Use these only when a complete run is unnecessary:

```bash
# Requires terminal 1 node
npm run evaluate:paper

# No persistent node required
npm run evaluate:policies
npm run test:policies

# Rebuilds only the final report from existing reports
npm run evaluate:summary
```

`evaluate:policies` and `test:policies` use their own ephemeral Hardhat network. Only `evaluate:paper` needs `start:operations`.

## Cleanup

```bash
npm run clean
```

This intentionally deletes generated reports and CSV files, BPMN images, graphs, metrics, imported `*.nmt.json` files, the evaluation temporary files in `/tmp`, and local Hardhat artifacts. Use it only to discard outputs; normally `evaluate:all` already performs it as its first step.

## Paper workflow details

The command deploys its own choreography type from `references/paper-example.bpmn` and mints an instance (import → deploy → mint), executes baseline render → delta modification → final render, clears only previous `metrics/*.generated.*` artifacts, creates the CSV and figures, and writes `evaluation/experiment-summary.generated.md`. It renders the `phase-duration`, `phase-gas`, and `model-comparison` charts automatically; the other templates in `evaluation/gnuplot/` are run manually (see below).

Because every run clears `metrics/*.generated.*` first, including policy lifecycle and policy test reports, metrics from separate runs do not accumulate.

The paper report links the baseline and final BPMN 2.0 XML generated from the on-chain asset and automatically produces SVG and PNG images using `chor-js` and local headless Chromium. `chor-js` renders BPMN choreography task bands, gateways, and sequence flows. SVG preserves vector quality for publication; PNG is embedded directly in the report.

## Policy lifecycle evaluation

Run the policy-focused evaluation without starting a persistent local node:

```bash
npm run evaluate:policies
```

It imports `references/paper-example.bpmn` into the model of a choreography type, mints an instance born with that model, links its roles, and applies the real parallel-transport-preparation delta. The smaller `Start → Delivery → End` fixture remains only in the policy integration test. The evaluation reports:

- deployment gas for Master, Creator, Holder, `ChoreographyTokenURIRenderer`, the model contract of the type (SSTORE2), and `ChoreographyNMT`;
- the mint of an instance, born with the model, and the assignment of its role accounts;
- Master allow/deny cases for authorized Creators and eligible Holders;
- the cost of changing the Creator rules: deploying `ChoreographyParticipantAM` and `CreatorSmartPolicyPaperScenario` and installing it with `setCreatorSmartPolicy`;
- Creator allow/deny cases for compliant updates, task limits, sequence-flow limits, task-name allowlist, known flow targets, and protected nodes;
- Holder installation of a restrictive policy and a denied model update.

The command writes a timestamped JSON report under `metrics/` and `evaluation/policy-lifecycle.generated.md`. Both include individual gas and wei costs, plus aggregate gas totals for allowed and denied policy operations.

## UML diagrams in the reports

The generated reports embed the UML use case diagrams and the sequence diagrams generated per experiment phase (`evaluation/evidence/uml/F<n>.svg`, see [`docs/uml.md`](../docs/uml.md)) next to the rows they explain, so a reader can follow each measured transaction through the contracts and policies that execute it:

| Report | Diagrams | Explain |
| --- | --- | --- |
| `experiment-summary.generated.md` (paper workflow) | F1 deploy, F2 mint, F4 render, F5 delta | the import, deployment, mint, modification, and render phases |
| `policy-lifecycle.generated.md` | choreography use cases, F1 deploy, F2 mint, participant license use cases, F3 role link, F6 role sale, F5 delta, F7 transfer and Holder restriction | the model contract and mint rows, the Special Carrier handover, and every allowed and denied policy row |
| `policy-tests.generated.md` | choreography and participant license use cases | the actor and use case behind each test case |
| `final-report.generated.md` | reading guide: every diagram with the rows it explains | the whole report |

The diagrams are versioned SVGs (`npm run docs:uml`, `npm run evidence:update` for the phases), so the reports show them without rendering anything; the mapping between diagrams and report rows is in `scripts/evaluation/uml.js`. These reports come from their own runs, not from the experiment: until they are replaced, the phase diagrams illustrate their rows without being their traces.

## Unified overview

After running either or both evaluations, generate one local entry point with:

```bash
npm run evaluate:summary
```

It writes `evaluation/final-report.generated.md`, linking and embedding the available paper-workflow, policy-lifecycle, and policy-test reports. `evaluation/summary.generated.md` is retained as a compatibility copy. Missing evaluations are explicitly marked, so it is safe to run after any command.

## Delta versus a new instance benchmark

A choreography type fixes its model, so the alternative to a delta is a new instance of the type, born with the whole model. The experiment mints a second instance of the same type (mint and role accounts) and compares its cost with the delta update on the first one.

This is a benchmark only: it does **not** change the operational workflow or force a strategy. In normal usage you can still choose either:

- `modify:asset` to update only the changed nodes of an existing instance;
- a new instance when a clean model is needed.

The comparison excludes deployment cost, so it measures only per-instance transactions. Its result appears in the `Delta update versus a new instance` table of the generated experiment summary.

It fetches an ETH/USD spot price for the report. For a reproducible study, provide a fixed historical value instead: `ETH_USD_PRICE=<price> npm run evaluate:paper`.

To produce the remaining per-operation figures from the current `metrics/` reports, create the CSV file and run the manual templates. For repeated runs, copy the CSV of each run elsewhere before starting the next one, since each `evaluate:paper` resets `metrics/`:

```bash
node scripts/evaluation/export-metrics-csv.js
mkdir -p evaluation/figures
gnuplot evaluation/gnuplot/duration-by-nodes.gp
gnuplot evaluation/gnuplot/duration-by-edges.gp
```

The CSV also contains total gas used and ETH cost for each deploy or delta operation, so the gas template uses the same generated CSV:

```bash
gnuplot evaluation/gnuplot/gas-by-changed-nodes.gp
```

The generated CSV, metric reports, and PNG figures are intentionally local artifacts. For publication, repeat each scenario, aggregate median/mean/standard deviation, and report the network, gas price, compiler optimizer settings, Node.js version, and hardware.
