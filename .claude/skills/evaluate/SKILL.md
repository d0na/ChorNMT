---
name: evaluate
description: Regenerate the ChorNMT paper evaluation (gas, timing, BPMN images, gnuplot charts, final report). Use when asked to run the evaluation, refresh paper numbers, or produce the final report.
---

# Run the evaluation

Full instructions: `evaluation/README.md`.

## Prerequisites (check, don't assume)

- Dependencies installed in root and `bpmn-builder-js/`.
- Chromium for Playwright: `npm run setup:evaluation` (once).
- `gnuplot` on PATH (`brew install gnuplot` on macOS) — ask before installing system packages.
- A local node on `:8545` (`npm run start:operations` in the background; see the `local-flow` skill).

## Run

```bash
ETH_USD_PRICE=3000 npm run evaluate:all
```

Use a fixed `ETH_USD_PRICE` for reproducible numbers; omit it only when the user wants the live price. `evaluate:all` does `clean → compile → evaluate:paper → evaluate:policies → test:policies → evaluate:summary`, so it deletes earlier generated outputs.

## Report

Point the user to `evaluation/final-report.generated.md` and summarize the headline figures (model contract and mint, delta vs a new instance, allow/deny costs). All outputs are `.generated.*` and git-ignored; nothing to commit unless gnuplot templates or scripts changed.
