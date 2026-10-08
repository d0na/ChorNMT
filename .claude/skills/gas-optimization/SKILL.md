---
name: gas-optimization
description: Reduce the gas cost of the ChorNMT flow (deploy, mint, import, modify) by optimizing contracts, with measured before/after numbers and unchanged policy outcomes. Use when asked to optimize contracts or gas, or when applying a G-candidate from docs/contract-structure.md.
---

# Gas optimization

Goal: the lowest total cost of the whole flow without weakening any policy check. Rules and the candidate list (G1…G8) are in `docs/contract-structure.md#gas`.

## 1. Baseline (before touching code)

```bash
npm run compile && npm run check:size
ETH_USD_PRICE=3000 npm test 2>&1 | tee <scratchpad>/gas-before.txt
```

For changes to import/modify paths, also run the paper flow (`local-flow` skill) and keep the gas lines printed by `deploy:asset` and `modify:asset`. Save outputs in the scratchpad, not in the repo.

## 2. Change

- One candidate per change, so its effect is measurable on its own.
- Follow the structure standard; an optimization may update a rule in `docs/contract-structure.md`, and then the doc changes in the same commit.
- Do not edit `scripts/test-policies.js` expectations: every allowed/denied outcome must stay the same. Adding cases is fine.
- If an ABI changes (e.g. `public` → `external` keeps the ABI; a new parameter does not), update the JS callers in `scripts/` and `bpmn-builder-js/scripts/web3.js`.

## 3. Measure

Rerun the same commands and compare per operation:

| Operation | Before | After | Δ | Δ % |
| --- | --- | --- | --- | --- |

Include deploy of each contract, the model contract of a type, mint, `setRoles`, `setNodes` (delta), and the denied cases the change touches. Also report `check:size` for `ChoreographyNMT` and `ParticipantNMT`.

## 4. Decide

Keep the change only if the total flow cost decreases (or a stated security reason justifies an increase). Mark the candidate as applied in `docs/contract-structure.md` (move it out of the candidate table, remove the matching deviation) and commit as `perf: <what>` with the headline numbers in the body.
