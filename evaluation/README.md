# Evaluation toolkit

The evaluation of ChorNMT is one experiment: eight phases (F1–F8) run on ephemeral Hardhat networks from the specification [`scripts/experiment/phases.js`](../scripts/experiment/phases.js), with their evidence versioned in [`evidence/`](evidence/) and read in [the experiment protocol](../docs/experiment.md). Every number, outcome, table, chart, BPMN drawing, and sequence diagram there comes from the run; the decisions behind it are D16–D22 in [`docs/decisions.md`](../docs/decisions.md#experiment-and-evidence). This page holds the instructions.

## Setup (once)

Run once after cloning the repository:

```bash
nvm use
npm install
(cd bpmn-builder-js && npm install)
npm run setup:evaluation
```

`setup:evaluation` downloads the local Chromium that draws the BPMN models with chor-js. The run also needs `gnuplot` for the charts, and Java and Graphviz for the PlantUML sequence diagrams:

```bash
# macOS (Homebrew)
brew install gnuplot graphviz openjdk

# Debian/Ubuntu
sudo apt install gnuplot graphviz default-jre
```

No local node is needed: the experiment and the policy tests use their own in-process networks.

## Complete evaluation run

```bash
npm run evidence:update
```

It runs, in order:

1. runs the experiment once as warm-up and `EXPERIMENT_REPETITIONS` more times (default 10), each on a fresh network, and fails if a transaction differs from the specification (order, sender, function, outcome, revert reason) or if two runs produce different evidence;
2. runs `test:policies` for the allow/deny matrix (`evidence/tests.json`);
3. generates the sequence diagram of each phase from the call traces, the four gnuplot charts, and the chor-js drawings of the two models, checking each one against its source;
4. rewrites the generated blocks of [`docs/experiment.md`](../docs/experiment.md).

Commit `evaluation/evidence/` and `docs/experiment.md` with the change that moved them. Then check that the versioned evidence is the evidence of the code:

```bash
npm run check:evidence   # reruns into a temporary directory and compares
npm run check:protocol   # docs/experiment.md against the evidence
npm run check:gas        # the gas figures quoted in the docs against the evidence
```

CI and the pre-commit hook run all three. Files in `evidence/` and the generated blocks of the protocol are never edited by hand; the `experiment` skill in `.claude/skills/` explains how to read a difference.

## USD price for gas scenarios

The `USD @10 gwei`, `USD @30 gwei`, and `USD @100 gwei` columns use a fixed ETH/USD price, `ETH_USD_PRICE`, 3000 by default; the protocol states the price it used. A run with another price is another run, so `check:evidence` fails against the versioned evidence:

```bash
ETH_USD_PRICE=2500 npm run evidence:update -- --out /tmp/chornmt-2500
```

The ETH column is the receipt cost at the local gas price of each block; compare gas and USD across transactions.

## Targeted runs

Use these when a complete run is unnecessary:

```bash
# An exploratory run elsewhere: same evidence, the protocol is not touched
npm run evidence:update -- --out /tmp/chornmt-run

# A faster exploratory run, one measured repetition (timings are then one sample)
EXPERIMENT_REPETITIONS=1 npm run evidence:update -- --out /tmp/chornmt-run

# Only the allow/deny matrix, printed with gas and wei costs
npm run test:policies

# The protocol from the versioned evidence, without rerunning
node scripts/experiment/protocol.js
```

The experiment does not use `start:operations`. The operational flow on a local node (`deploy:asset`, `modify:asset`, `render:asset`) prints receipt-derived gas and ETH cost and writes a JSON report under `metrics/` (`*.generated.json`, git-ignored) with duration and model size; it is the `local-flow` skill, not part of the evidence.

## Cleanup

```bash
npm run clean
```

It deletes the local outputs only: Hardhat artifacts and cache, `metrics/*.generated.*`, the imported and rendered files under `bpmn-builder-js/example/`, and the BPMN viewer page in `/tmp`. It never touches `evaluation/evidence/` or `docs/experiment.md`, which only `evidence:update` rewrites.

## Evidence layout

| Path | Content | Compared by `check:evidence` |
| --- | --- | --- |
| `evidence/experiment.json` | provenance; accounts; inputs with SHA-256; per phase the actors, the policies in force (address, source, bytecode hash), the instance state, and the transactions (caller, function, outcome, revert reason, trust-table row, gas, cost) | yes |
| `evidence/transactions.csv` | the transactions as a flat table, for spreadsheets | yes |
| `evidence/traces.json` | the call trace of every transaction and of the `tokenURI` read of each render | yes |
| `evidence/tests.json` | the `test:policies` matrix | yes |
| `evidence/timings.json` | median, min, max, mean, standard deviation, and samples of every phase and sub-step, and the machine | no, a measurement |
| `evidence/uml/F<n>.puml`, `F<n>-full.puml` | the filtered and the complete sequence diagram of each phase | yes |
| `evidence/uml/*.svg` | their drawings, stamped with the hash of their source | by `check:uml` |
| `evidence/bpmn/baseline.bpmn.xml`, `final.bpmn.xml`, `images.json` | the models the chain returned to the two renders, and the hash of each drawing's XML | yes |
| `evidence/bpmn/*.svg` | the chor-js drawings, stamped with the hash of their XML | the stamp |
| `evidence/charts/*.dat` | the data of the four charts | yes, `phase-duration.dat` excepted |
| `evidence/charts/*.svg` | the gnuplot charts (templates in [`gnuplot/experiment/`](gnuplot/experiment/)), stamped with the hash of their data | the stamp |

An image is not compared byte for byte: gnuplot, PlantUML, Chromium, and the installed fonts change its bytes from one machine to another. Its stamp ties it to a data file that is compared.

## Unified overview

[`docs/experiment.md`](../docs/experiment.md) is the single entry point: purpose, case study, policies, and, for each phase, the actors, the transactions with their outcome and costs, the trust-table rows, the policies in force, the state of the instance, the timings, and the sequence diagram; then the delta versus a new instance, the public-network cost scenarios, the charts, the BPMN models, the reading guide of the UML diagrams, the test matrix, and the index of the evidence files. Every part is always present: the experiment has no optional section.
