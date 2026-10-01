# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git

- When creating Git commits, do not add Co-Authored-By trailers or any attribution to Claude/Anthropic.
- Keep [docs/NOTES-alignment.md](docs/NOTES-alignment.md) complete (findings, decisions with date, verifications, completed items) and commit it together with the related work. The maintainer switches computers and relies on the repo to carry these notes.

## Project

ChorNMT stores a BPMN choreography in an on-chain mutable asset (`ChoreographyMutableAsset`) owned through an ERC-721 NMT, with Master, Creator, and Holder smart policies. JavaScript scripts import BPMN into the asset, apply JSON deltas, and render BPMN back from the chain. See [README.md](README.md) and [docs/](docs/).

- `contracts/` — Solidity (`base/`, `choreography/`, `participant/`).
- `scripts/` — npm entry points (`deploy-local.js`, `import-bpmn-asset.js`, `apply-asset-delta.js`, `render-asset.js`), tests (`test-policies.js`), and `evaluation/`.
- `bpmn-builder-js/` — BPMN ↔ NMT conversion and BPMN XML generation (separate `package.json`).

## Commands

```bash
npm ci && (cd bpmn-builder-js && npm ci)
npm test                      # policy allow/deny tests on an ephemeral Hardhat network
npm run evaluate:policies     # lifecycle evaluation, ephemeral network
npm run start:operations      # local node, needed by deploy/import/modify/render and evaluate:paper
npm run setup:evaluation      # Chromium for evaluate:paper (also needs gnuplot)
```

## Conventions

- Code and docs must stay aligned: every contract or script change updates the affected docs in the same commit, including the gas figures in `docs/choreography-policies.md` when `npm test` output changes.
- Structural BPMN constraints live in the choreography `CreatorSmartPolicy`.
- Docs are in English except `docs/architettura.md` and the alignment notes, which are in Italian.
