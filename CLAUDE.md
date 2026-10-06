# ChorNMT

Research prototype: a BPMN **choreography** is stored in an on-chain mutable asset (`ChoreographyMutableAsset`), owned through an ERC-721 NMT (`ChoreographyNMT`), guarded by smart policies, and **regenerated as BPMN** from the on-chain state. The BPMN XML is always a view: changes go through the asset (JSON delta → `setNodes`/`setRoles`), never through the XML.

Two goals constrain every contract change: no state change bypasses the Master/Creator/Holder policies, and the **total gas cost of the whole flow** (deploy, mint, import, modify) stays as low as possible. Optimize contracts whenever it is safe, and prove it with measured gas.

Read the human docs before non-trivial work; they are the source of truth and must stay in sync with the code:

| Topic | Doc |
| --- | --- |
| **Contract structure standard: kinds, layout, state, public/private functions, gas rules** | `docs/contract-structure.md` |
| Components and internals (Italian) | `docs/architettura.md` |
| tokenURI renderer + off-chain BPMN pipeline (Italian) | `docs/rendering.md` |
| Trust model: who can do what | `docs/choreography-policies.md` |
| Policy semantics ↔ test cases | `docs/policy-test-specification.md` |
| NMT format, import, delta rules | `docs/bpmn-to-nmt-workflow.md` |
| npm commands and scripts | `docs/commands-and-scripts.md` |
| Contract hierarchy and participant target design | `docs/contract-hierarchy.md` |
| Participant license: fields, hardcoded policies, gas | `docs/participant-license-design.md` |
| Evaluation | `evaluation/README.md` |

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
npm test                                             # = test:policies, ephemeral network, no node needed
npm run start:operations                             # compile + hardhat node on :8545 (long-running)
npm run deploy:asset                                 # needs the node; prints the asset address
npm run import:asset -- <asset> references/paper-example.bpmn
npm run render:asset -- <asset> <nmt-or-delta.json>
npm run modify:asset -- <asset> <delta.json> [--no-render]
npm run clean
```

CI (`.github/workflows/test.yml`) runs `compile`, `check:size`, `npm test`, and the BPMN importer on both reference models. Run the same before declaring work done. Set `ETH_USD_PRICE=3000` to avoid the live Coinbase price fetch in tests/evaluation.

## Invariants and gotchas

- **Contract structure.** Every Token, Asset, Policy, and Renderer follows `docs/contract-structure.md` (layout order, naming, private domain state, mutator shape, Creator AND Holder at both the action and the domain check, default-deny policies, custom errors). There are no known deviations; a change that has to break a rule records it in the "Known deviations" table of that document.
- **Policies are hardcoded.** Policies stand for XACML translations: rules and configuration are literals in the policy source, tuned to the current test/evaluation scenarios (participant ones use default Hardhat accounts 5–9). No runtime configuration setters; a rule change is a new policy installed with `setMasterSmartPolicy` / `setCreatorSmartPolicy`. The choreography policies use Hardhat accounts 0–1: `MasterSmartPolicyFrozen` is the Master variant without transfers and versions; `CreatorSmartPolicy` has no BPMN constraint, and the constraints are scenario policies (`CreatorSmartPolicyTestScenario`, `CreatorSmartPolicyPaperScenario`) extending `ConstrainedCreatorSmartPolicy`, which read license types from the `ChoreographyParticipantAM` attribute manager.
- **Docs at every level.** Every change is reflected in the documentation at every level it touches, in the same commit: `CLAUDE.md`, the docs in the table above (contract structure and deviations, architecture, rendering, trust table, test specification, hierarchy, commands), `evaluation/README.md`, the generated-report text in `scripts/evaluation/`, code comments, and the project skills in `.claude/skills/`. Grep for every renamed or removed name before committing.
- **Gas.** Report before/after gas for every contract change (see the `gas-optimization` skill). Never change an allow/deny outcome to save gas.

- **Trust table ↔ tests ↔ code.** Any policy change must keep the table in `docs/choreography-policies.md`, the cases in `scripts/test-policies.js` (`expectAllowed`/`expectDenied`), and `docs/policy-test-specification.md` in agreement.
- **Identity by name.** Nodes and roles are keyed by name; BPMN IDs are not stored on-chain. Nodes are never deleted, only overwritten; an asset never clears its name lists — redeploy for a clean asset.
- **Whole-node writes.** A delta contains only changed nodes, each in its complete final state; when an edge changes, both endpoints go in the delta.
- **NodeType enum** (`ChoreographyMutableAsset.sol`): 0 START_EVENT, 1 END_EVENT, 2 TASK, 3 EXCLUSIVE_SPLIT, 4 EXCLUSIVE_JOIN, 5 PARALLEL_SPLIT, 6 PARALLEL_JOIN, 7 EVENT_BASED_GATEWAY.
- **Bytecode limit.** `ChoreographyNMT` embeds the asset bytecode (`new`) and sits near the 24,576-byte limit. Adding code to `ChoreographyMutableAsset` or `ChoreographyNMT` can break deployment — put logic in the renderer or a policy instead, and run `npm run check:size` after compiling.
- **tokenURI is computed**, never stored; render reads the whole model in one `tokenURI` call.
- NMT mints with `_mint`, not `_safeMint` (no receiver callback before initialization) — keep it that way.
- Generated files end in `.generated.*` and are git-ignored; reference BPMNs and deltas are versioned. `artifacts/`, `cache/` are build outputs.
- Only the `paper-example` path is supported; `pizza-delivery`, `parallel-gateway-example` and the scripts listed as legacy in `docs/commands-and-scripts.md` are development references.

## Conventions

- JavaScript is ESM (`"type": "module"`), Node 22 (pinned in `.nvmrc`; Hardhat 3/EDR needs ≥ 22), no TypeScript, no lint config — match the surrounding style.
- Contracts: OpenZeppelin v5, custom policies extend `SmartPolicy`.
- Commits: Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `chore:`, `ci:`), imperative, lowercase.
- Docs: `architettura.md` and `rendering.md` are in Italian, everything else in English; keep each file's language.

## Skills

Project skills in `.claude/skills/`: `local-flow` (run the end-to-end paper flow on a local node), `write-delta` (author and apply a BPMN delta), `policy-change` (change a policy contract safely), `evaluate` (regenerate the paper evaluation), `gas-optimization` (apply and measure a contract optimization), `grill-me` (`/grill-me`: relentless interview to stress-test a plan or design before implementing it; installed from skills.sh with `npx skills add https://github.com/mattpocock/skills --skill grill-me --skill grilling -a claude-code --copy`, tracked in `skills-lock.json`; update with `npx skills update -p`).
