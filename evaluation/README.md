# Evaluation toolkit

The evaluation of ChorNMT is one experiment and an extended evaluation around it. The experiment is eight phases (F1–F8) run on ephemeral Hardhat networks from the specification [`scripts/experiment/phases.js`](../scripts/experiment/phases.js), with their evidence versioned in [`evidence/`](evidence/) and read in [the experiment protocol](../docs/experiment.md). Every number, outcome, table, chart, BPMN drawing, and sequence diagram there comes from the run; the decisions behind it are D16–D22 in [`docs/decisions.md`](../docs/decisions.md#experiment-and-evidence). This page holds the instructions.

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
4. runs the [extended evaluation](#extended-evaluation) and draws its three charts;
5. rewrites the generated blocks of [`docs/experiment.md`](../docs/experiment.md) and of [`docs/extended-evaluation.md`](../docs/extended-evaluation.md).

Commit `evaluation/evidence/`, `docs/experiment.md`, and `docs/extended-evaluation.md` with the change that moved them. Then check that the versioned evidence is the evidence of the code:

```bash
npm run check:evidence   # reruns into a temporary directory and compares
npm run check:protocol   # docs/experiment.md and docs/extended-evaluation.md against the evidence
npm run check:gas        # the gas figures quoted in the docs against the evidence
```

CI and the pre-commit hook run all three. Files in `evidence/` and the generated blocks of the protocol are never edited by hand; the `experiment` skill in `.claude/skills/` explains how to read a difference.

## Extended evaluation

The experiment follows one scenario with one update; its repetitions show that it is reproducible, not that it covers different cases. The extended evaluation (decision D28) adds four studies, specified in [`scripts/experiment/extended-spec.js`](../scripts/experiment/extended-spec.js), run by [`scripts/experiment/extended.js`](../scripts/experiment/extended.js) on a network of their own each, and read in [`docs/extended-evaluation.md`](../docs/extended-evaluation.md):

| Study | What varies | What it measures |
| --- | --- | --- |
| Variety of updates | the kind of update on the paper example | gas and outcome of each kind, the model read back and rendered after each |
| Scalability | the size of a synthetic model, under the default and a constrained Creator policy | gas of deploy, mint, updates, and of the `tokenURI` read; local times of the read and the render |
| Conflicts | which organization acts against which | who prevails and by which rule |
| Concurrency | the transactions that share a block | independence of the assets, policies under a race, lost updates |

It does not change the experiment: no transaction, gas figure, or outcome of F1–F8 depends on it. Its evidence is `evidence/extended/` (`extended.json`, compared by `check:evidence`; `timings.json`, not compared; `charts/`), written by `evidence:update` after the experiment, with `EXTENDED_REPETITIONS` (default 3) measured runs after a warm-up, all required to give the same evidence. The synthetic models are generated in code and serve only this measurement; the paper example stays the only supported model.

## USD price for gas scenarios

The costs are estimated on Polygon. The `USD @100 gwei`, `USD @300 gwei`, and `USD @1000 gwei` columns are a sensitivity analysis: 300 gwei is the reference, a Polygon Gas Station reading of about 271 gwei rounded up, and 100 and 1000 gwei are an economical and a costly scenario; they are assumptions to compare costs, not historical averages or official congestion thresholds. USD = gas × gas price in gwei × 10⁻⁹ × POL/USD, with a fixed POL/USD price, `POL_USD_PRICE`, 0.09 by default, a calculation assumption; the protocol states the price it used. A run with another price is another run, so `check:evidence` fails against the versioned evidence:

```bash
POL_USD_PRICE=0.12 npm run evidence:update -- --out /tmp/chornmt-pol-012
```

The POL column is the receipt cost at the local gas price of each block; compare gas and USD across transactions.

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

# The extended evaluation alone, elsewhere (EVIDENCE_OUT is the evidence directory; it writes <dir>/extended/)
EVIDENCE_OUT=/tmp/chornmt-run npx hardhat run scripts/experiment/extended.js
```

The experiment does not use `start:operations`. The operational flow on a local node (`deploy:asset`, `modify:asset`, `render:asset`) prints receipt-derived gas and POL cost and writes a JSON report under `metrics/` (`*.generated.json`, git-ignored) with duration and model size; it is the `local-flow` skill, not part of the evidence.

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

[`docs/experiment.md`](../docs/experiment.md) is the single entry point: purpose, case study, policies, and, for each phase, the actors, the transactions with their outcome and costs, the trust-table rows, the policies in force, the state of the instance, the timings, and the sequence diagram; then the public-network cost scenarios, the charts, the BPMN models, the reading guide of the UML diagrams, the test matrix, and the index of the evidence files. Every part is always present: the experiment has no optional section.
