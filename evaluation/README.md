# Evaluation toolkit

Each `import:asset`, `modify:asset`, and `render:asset` execution writes a JSON report under `metrics/`. The report records wall-clock duration and model/delta size: roles, nodes, tasks, gateways, sequence edges, and messages. On-chain commands also print receipt-derived gas and ETH cost in their console output.

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

- paper workflow: BPMN import, baseline/final chor-js images, delta update, full population, and gnuplot charts;
- policy lifecycle: empty versus populated mint and Master/Creator/Holder outcomes;
- policy integration tests: complete allow/deny matrix with gas and wei costs;
- direct links to generated BPMN XML, SVG/PNG, CSV, JSON metrics, and contract exports.

`evaluate:all` performs `clean → compile → evaluate:paper → evaluate:policies → test:policies → evaluate:summary`. It is safe to use for every fresh evaluation run.

## USD price for gas scenarios

By default, the evaluation fetches the current ETH/USD spot price automatically from Coinbase and uses it to calculate the `USD @10 gwei`, `USD @30 gwei`, and `USD @100 gwei` columns. No configuration is needed for an exploratory run.

For a reproducible experiment, provide a fixed value. The same value is then used by the paper, policy lifecycle, and policy test reports:

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

This intentionally deletes generated reports, BPMN images, graphs, metrics, and local Hardhat artifacts. Use it only to discard outputs; normally `evaluate:all` already performs it as its first step.

## Paper workflow details

The command deploys its own asset, executes import → baseline render → delta modification → final render, clears only previous `metrics/*.generated.*` artifacts, creates the CSV and figures, and writes `evaluation/experiment-summary.generated.md`.

The paper report links the baseline and final BPMN 2.0 XML generated from the on-chain asset and automatically produces SVG and PNG images using `chor-js` and local headless Chromium. `chor-js` renders BPMN choreography task bands, gateways, and sequence flows. SVG preserves vector quality for publication; PNG is embedded directly in the report.

## Policy lifecycle evaluation

Run the policy-focused evaluation without starting a persistent local node:

```bash
npm run evaluate:policies
```

It imports `references/paper-example.bpmn` into a fresh instance and applies the real parallel-transport-preparation delta. The smaller `Start → Delivery → End` fixture remains only in the policy integration test. The evaluation reports:

- deployment gas for Master, Creator, Holder, `ChoreographyTokenURIRenderer`, and `ChoreographyNMT`;
- `mint` followed by roles/nodes import versus `mintWithInitialModel`;
- Master allow/deny cases for authorized Creators and eligible Holders;
- Creator allow/deny cases for compliant updates, task limits, task-name allowlist, known flow targets, and protected nodes;
- Holder installation of a restrictive policy and a denied model update.

The command writes a timestamped JSON report under `metrics/` and `evaluation/policy-lifecycle.generated.md`. Both include individual gas and wei costs, plus aggregate gas totals for allowed and denied policy operations.

## Unified overview

After running either or both evaluations, generate one local entry point with:

```bash
npm run evaluate:summary
```

It writes `evaluation/final-report.generated.md`, linking and embedding the available paper-workflow, policy-lifecycle, and policy-test reports. `evaluation/summary.generated.md` is retained as a compatibility copy. Missing evaluations are explicitly marked, so it is safe to run after any command.

## Delta versus full population benchmark

The experiment also creates a second fresh asset and fully populates it with the final, modified model. It compares that write cost with the delta update on the first asset.

This is a benchmark only: it does **not** change the operational workflow or force a strategy. In normal usage you can still choose either:

- `modify:asset` to update only the changed nodes of an existing asset;
- complete population of a fresh asset when a clean full replacement is needed.

The comparison excludes deployment cost, so it measures only model-write transactions. Its result appears in the `Delta update versus full model population` table of the generated experiment summary.

It fetches an ETH/USD spot price for the report. For a reproducible study, provide a fixed historical value instead: `ETH_USD_PRICE=<price> npm run evaluate:paper`.

After collecting repeated runs, create a CSV file and figures:

```bash
node scripts/evaluation/export-metrics-csv.js
mkdir -p evaluation/figures
gnuplot evaluation/gnuplot/duration-by-nodes.gp
gnuplot evaluation/gnuplot/duration-by-edges.gp
```

The CSV also contains total gas used and ETH cost for each import or delta operation, so the gas template uses the same generated CSV:

```bash
gnuplot evaluation/gnuplot/gas-by-changed-nodes.gp
```

The generated CSV, metric reports, and PNG figures are intentionally local artifacts. For publication, repeat each scenario, aggregate median/mean/standard deviation, and report the network, gas price, compiler optimizer settings, Node.js version, and hardware.
