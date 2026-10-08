# ChorNMT

Research prototype: a BPMN **choreography** is stored in an on-chain mutable asset (`ChoreographyMutableAsset`), owned through an ERC-721 NMT (`ChoreographyNMT`), guarded by smart policies, and **regenerated as BPMN** from the on-chain state. The BPMN XML is always a view: changes go through the asset (JSON delta → `setNodes`/`setRoles`), never through the XML.

What the prototype must demonstrate, and what it deliberately does not do, is in `docs/requirements.md`; why the design is what it is, and the questions still open, in `docs/decisions.md`. Read both before changing behavior, and do not implement a non-goal or settle an open question without the user.

The docs are the source of truth and must stay in sync with the code:

| Topic | Doc |
| --- | --- |
| Claims, acceptance criteria, non-goals | `docs/requirements.md` |
| Design decisions and open questions | `docs/decisions.md` |
| **Contract structure standard: kinds, layout, state, functions, gas rules, known deviations** | `docs/contract-structure.md` |
| Components and internals (Italian) | `docs/architettura.md` |
| tokenURI renderer + off-chain BPMN pipeline (Italian) | `docs/rendering.md` |
| Trust model: who can do what | `docs/choreography-policies.md` |
| Policy semantics ↔ test cases | `docs/policy-test-specification.md` |
| NMT format, import, delta rules | `docs/bpmn-to-nmt-workflow.md` |
| `setNodes`/`setRoles` call shape for a delta | `docs/delta-update-and-solidity-calls.md` |
| npm commands and scripts | `docs/commands-and-scripts.md` |
| Contract hierarchy and participant target design | `docs/contract-hierarchy.md` |
| Participant license: fields, hardcoded policies, gas | `docs/participant-license-design.md` |
| Evaluation | `evaluation/README.md` |
| UML use case and sequence diagrams | `docs/uml.md`, `docs/uml/` |

## Layout

- `contracts/base/` — generic `NMT`, `MutableAsset`, `SmartPolicy`.
- `contracts/choreography/` — `ChoreographyNMT`, `ChoreographyMutableAsset`, `ChoreographyTokenURIRenderer`, Master/Creator/Holder policies and their variants, `ChoreographyParticipantAM`, `DenyAllSmartPolicy`.
- `contracts/participant/` — participant licenses (`ParticipantNMT`, `ParticipantMutableAsset`, `ParticipantTokenURIRenderer`) that choreography roles can be linked to.
- `scripts/` — npm-command implementations (ESM, ethers v6); `scripts/evaluation/` metrics and reports; `scripts/data/` versioned deltas and legacy datasets.
- `bpmn-builder-js/` — separate npm package: BPMN→NMT importer, tokenURI reader (`scripts/web3.js`), `normalize` → `validation` → `process-mapper` → `moddle-generator`.
- `references/` — source BPMN models (`paper-example.bpmn` is the supported one) and the original `BPMNChoreography.sol`.

## Commands

```bash
nvm use && npm install && (cd bpmn-builder-js && npm install)   # Node 22 (.nvmrc), both packages
npm run compile                                      # hardhat compile (Solidity 0.8.28, optimizer 200)
npm run check:size                                   # fail if a contract exceeds EIP-170/3860 size limits
npm run docs:uml                                     # render docs/uml/*.puml to SVG (Java + Graphviz)
npm run check:uml                                    # fail if a UML SVG is missing or stale
npm test                                             # = test:policies, ephemeral network, no node needed
npm run start:operations                             # compile + hardhat node on :8545 (long-running)
npm run deploy:asset                                 # needs the node; prints the asset address
npm run import:asset -- <asset> references/paper-example.bpmn
npm run render:asset -- <asset> <nmt-or-delta.json>
npm run modify:asset -- <asset> <delta.json> [--no-render]
npm run clean
```

CI (`.github/workflows/test.yml`) runs `compile`, `check:size`, `check:uml`, `npm test`, and the BPMN importer on both reference models. Run the same before declaring work done. Set `ETH_USD_PRICE=3000` to avoid the live Coinbase price fetch in tests/evaluation.

## Invariants and gotchas

- **Docs at every level.** Every change is reflected, in the same commit, in every doc it touches: `CLAUDE.md`, the docs above (including `decisions.md` for a design change), `evaluation/README.md`, the report text in `scripts/evaluation/`, code comments, `.claude/skills/`, and the UML diagrams (`uml-diagrams` skill; CI fails on a stale SVG).
- **Contract structure.** Every contract follows `docs/contract-structure.md`; a change that has to break a rule records it in its "Known deviations" table.
- **Policies are hardcoded** (XACML translations): rules are literals, no runtime setters; a rule change is a new policy. Choreography policies use Hardhat accounts 0–1, participant ones 5–9.
- **Trust table ↔ tests ↔ spec.** A policy change keeps `docs/choreography-policies.md`, `scripts/test-policies.js` (`expectAllowed`/`expectDenied`), and `docs/policy-test-specification.md` in agreement (`policy-change` skill).
- **Gas.** Report before/after gas for every contract change (`gas-optimization` skill). Never change an allow/deny outcome to save gas.
- **Bytecode limit.** `ChoreographyNMT` embeds the asset bytecode (`new`) and is close to the 24,576-byte limit. Put new logic in the renderer or a policy, not in `ChoreographyMutableAsset` or `ChoreographyNMT`, and run `npm run check:size`.
- **Identity by name.** Nodes and roles are keyed by name; BPMN IDs are not stored on-chain. Nodes are never deleted, only overwritten; an asset never clears its name lists — redeploy for a clean asset.
- **Whole-node writes.** A delta contains only changed nodes, each in its complete final state; when an edge changes, both endpoints go in the delta.
- **NodeType enum** (`ChoreographyMutableAsset.sol`): 0 START_EVENT, 1 END_EVENT, 2 TASK, 3 EXCLUSIVE_SPLIT, 4 EXCLUSIVE_JOIN, 5 PARALLEL_SPLIT, 6 PARALLEL_JOIN, 7 EVENT_BASED_GATEWAY.
- **tokenURI is computed**, never stored; render reads the whole model in one `tokenURI` call.
- NMT mints with `_mint`, not `_safeMint` — keep it that way.
- Generated files end in `.generated.*` and are git-ignored; reference BPMNs and deltas are versioned. `artifacts/`, `cache/` are build outputs.
- Only the `paper-example` path is supported; `pizza-delivery`, `parallel-gateway-example` and the legacy scripts in `docs/commands-and-scripts.md` are development references.

## Conventions

- JavaScript is ESM (`"type": "module"`), Node 22 (pinned in `.nvmrc`; Hardhat 3/EDR needs ≥ 22), no TypeScript, no lint config — match the surrounding style.
- Contracts: OpenZeppelin v5, custom policies extend `SmartPolicy`.
- Commits: Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `chore:`, `ci:`), imperative, lowercase.
- Docs: `architettura.md` and `rendering.md` are in Italian, everything else in English; keep each file's language.

## Hooks and skills

Hooks (`.claude/settings.json`, `.claude/hooks/`) block edits to generated files and SVGs, rerun `docs:uml` after a `.puml` edit and `compile` + `check:size` after a `.sol` edit, and check UML, compile, and size before `git commit`. Tests and evaluations are not hooks: run them through the skills and CI. Project skills are in `.claude/skills/`; `grill-me` comes from skills.sh (see `README.md`).
