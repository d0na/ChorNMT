---
name: experiment
description: Run, check, and update the ChorNMT experiment (phases F1-F8, versioned evidence in evaluation/evidence/, protocol docs/experiment.md). Use when asked to run the experiment or the evaluation, refresh the paper numbers, charts, BPMN drawings, or sequence diagrams, when check:evidence or check:protocol fails, or after a change to contracts, scripts, the phase specification, or an input.
---

# Run and update the experiment

The experiment is code: `scripts/experiment/phases.js` specifies it, `npm run evidence:update` runs it and writes `evaluation/evidence/` and the generated blocks of `docs/experiment.md`, and `npm run check:evidence` reruns it into a temporary directory and compares (decisions D16-D22 in `docs/decisions.md`). You orchestrate and read; you never write a number, an outcome, a table, a chart, or a diagram.

## Never

- Edit a file in `evaluation/evidence/` or a generated placeholder of `docs/experiment.md` (`<!-- evidence:… -->`, `<!-- outcome:… -->`): the `guard-generated.sh` hook denies it. Change the code, the specification, or an input, then regenerate.
- Write a digit or an outcome word (allowed, denied, reverted) in the narrative of `docs/experiment.md`: `check:protocol` fails. Name the transaction with an outcome placeholder instead, or declare a structural id in `STRUCTURAL` of `scripts/experiment/protocol.js`.
- Accept an evidence diff in which an allow/deny outcome changed without asking the user first.
- Replace the Master or the Creator policy in the experiment (choreography or license, certifier included): they are never replaced (open question in `docs/decisions.md`).

## Prerequisites (check, don't assume)

- Dependencies in the root and in `bpmn-builder-js/`.
- Chromium for Playwright: `npm run setup:evaluation` (once).
- `gnuplot`, `java`, and `dot` (Graphviz) on PATH (`brew install gnuplot graphviz openjdk` on macOS); ask before installing system packages.
- No local node is needed: the run uses ephemeral in-process Hardhat networks.

Every command starts with `source ~/.nvm/nvm.sh && nvm use >/dev/null && export ETH_USD_PRICE=3000 &&`; the evidence records that price, and another one is a different run.

## Check

```bash
npm run check:evidence   # about 20 s: the run (1 warm-up + 10 repetitions), the test matrix, and the comparison
npm run check:protocol   # the blocks of docs/experiment.md against the evidence, no number in the narrative
npm run check:use-cases  # the use case diagrams against the trust tables, tests, and evidence
npm run check:gas        # the gas figures quoted in the docs against the evidence
```

The pre-commit hook and CI run all four.

## Read an evidence diff

`check:evidence` prints the differing files and, for `experiment.json` and `tests.json`, the transactions and test cases whose outcome or gas changed, with the path of the regenerated evidence (`diff -r evaluation/evidence <path>` for the rest).

- **An outcome changed** (`OUTCOME allowed -> denied`, or the reverse): stop and ask the user. It is a change of the trust model (`policy-change` skill), never something to accept to make a check pass.
- **Gas changed** with a contract change: expected; report before/after (`gas-optimization` skill), then update.
- **A bytecode hash and a transaction hash changed, gas did not**: a contract source changed without changing behavior (a comment changes the solc metadata).
- **Gas or outcome changed without a contract change**: the change is in the specification, an input (`references/`, `scripts/data/`), the importer, or the run itself; find which before updating.
- **Only `traces.json`, a `.puml`, or `bpmn/*.xml` changed**: the calls, the sequence diagrams, or the model changed; read the diff of the filtered view (`uml/F<n>.puml`) first.
- **`image not drawn from the versioned …`**: an SVG does not carry the hash of its data; regenerate.
- **`timings.json` and `phase-duration.*`** are never compared: they change at every run.

## Update

When the change is intended and understood:

```bash
npm run evidence:update                    # rewrites evaluation/evidence/ and the blocks of docs/experiment.md
npm run evidence:update -- --out <dir>     # an exploratory run elsewhere; the protocol is not touched
```

Then run the four checks, update the narrative of `docs/experiment.md` only where the phases changed meaning, and commit the code, `evaluation/evidence/`, and `docs/experiment.md` together. A new section of the protocol or a removed one changes `scripts/experiment/parity.js` (a removal is `dropped` with its reason).

## Review

Before committing a change to the narrative or to the phases, run the `evidence-reviewer` agent: it checks that the hand-written text agrees with the evidence and is readable, and reports; you fix. `check:protocol` guarantees the numbers and outcomes, not the meaning of the sentences.

## Report

Point the user to `docs/experiment.md` and summarize: the phases, what changed in the evidence (outcome changes first, then gas as `key: old → new`), and the checks that ran.
