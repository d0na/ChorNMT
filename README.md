# ChorNMT

ChorNMT imports a BPMN choreography into a local NMT asset, allows its nodes to be changed on-chain, and regenerates BPMN from the configuration stored in that asset.

The main path uses `paper-example`: a logistics choreography involving a buyer, manufacturer, intermediary, supplier, and special carrier. The repository also includes `parallel-gateway-example`, a small model used for technical demonstrations of parallel splits and joins.

## Prerequisites

- Node.js 22 (see `.nvmrc`; run `nvm use`)
- npm

Install both sets of dependencies:

```bash
npm install
(cd bpmn-builder-js && npm install)
```

## Main path: import, render, modify, and render the paper example

Before importing, open two terminals in the repository root. In the first, start the local operations environment (it compiles contracts and starts the blockchain):

```bash
npm run start:operations
```

In the second terminal, deploy a new asset and copy the printed `ChoreographyMutableAsset` address:

```bash
npm run deploy:asset
```

Use that exact value in every `<asset-address>` placeholder below; all commands must target the same asset.

### 1. Import

Convert the source BPMN into NMT and store that dataset in the asset:

```bash
npm run import:asset -- <asset-address> references/paper-example.bpmn
```

### 2. Render the baseline

Render BPMN from the imported data stored on-chain:

```bash
npm run render:asset -- <asset-address> bpmn-builder-js/example/input/paper-example.nmt.json
```

This creates `bpmn-builder-js/example/output/paper-example-from-contract.generated.bpmn.xml`.

### 3. Modify

Apply the reusable delta without rendering yet. It inserts a parallel split after `Order Special Transport`: transport-detail collection and transport-document preparation proceed in parallel, then join before the waybill.

```bash
npm run modify:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json --no-render
```

### 4. Render the updated asset

Export the changed on-chain asset and render the final BPMN:

```bash
npm run render:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

The final BPMN is written to:

```text
bpmn-builder-js/example/output/paper-example-parallel-transport-preparation-from-contract.generated.bpmn.xml
```

## Modify an existing asset

Do not edit the exported BPMN XML directly: it is a view of the asset. Instead, create a JSON delta, apply it to the asset with `modify:asset`, and regenerate BPMN with `render:asset`.

Use [scripts/data/paper-example-parallel-transport-preparation.delta.json](scripts/data/paper-example-parallel-transport-preparation.delta.json) as a template. A delta contains:

- `render`: the generated BPMN name and metadata;
- `nodes`: only nodes that are added or changed, each in its complete final state;
- optional `roles`: a `role name → Ethereum address` map for new roles.

When an edge changes, include both endpoint nodes in the delta with their complete `incoming` and `outgoing` arrays. The asset can add or replace nodes, but it cannot yet permanently remove one.

Node and role names are the contract reference keys. To import another BPMN or start again from a clean asset, run `deploy:asset` again and use the new address: the asset does not clear the names already stored in its lists.

For a trusted fixed template, `ChoreographyNMT.mintWithInitialModel(...)` creates and populates an instance atomically. It avoids the two post-mint import transactions; the policy test compares its gas cost with the empty-asset workflow.

The default `CreatorSmartPolicy` has no BPMN constraint. Constraints (task and sequence-flow limits, permitted task names, known flow targets, protected nodes and roles, role licenses) are hardcoded in scenario policies such as `CreatorSmartPolicyPaperScenario`, installed with `setCreatorSmartPolicy` or passed at mint.

Run `npm run evaluate:policies` to measure a fresh model's empty-versus-populated mint cost and the allow/deny cost of Master, Creator, and Holder policy calls. It writes local JSON and Markdown evaluation reports.

## Other examples

The repository also includes `pizza-delivery`, an introductory example, and `parallel-gateway-example`, a small model for checking parallel splits and joins. They are retained as development references; the supported operational path is only `paper-example` and its parallel delta.

## Generated files

Every import, export, or rendering operation writes files to:

```text
bpmn-builder-js/example/input/
bpmn-builder-js/example/output/
bpmn-builder-js/example/contract/
```

Files with a `.generated.*` suffix are local artifacts ignored by Git and can be regenerated with the commands above. Reference BPMNs and JSON deltas are versioned.

## Technical documentation

- [Requirements](docs/requirements.md): what the prototype demonstrates, acceptance criteria, and non-goals.
- [Design decisions](docs/decisions.md): why the main choices were made, and the open questions.
- [Evaluation quick start](evaluation/README.md#complete-evaluation-run): commands for the complete paper and policy evaluation suite.
- [BPMN to NMT workflow](docs/bpmn-to-nmt-workflow.md): NMT format, import, and delta rules.
- [Contract structure](docs/contract-structure.md): the standard internal structure of Token, Asset, Policy, and Renderer contracts, gas rules, and known deviations.
- [Architecture](docs/architettura.md): components, responsibilities, and internal structure of the NMT, asset, policy, and renderer contracts and of the JavaScript tooling.
- [Rendering](docs/rendering.md): on-chain `tokenURI` metadata and the off-chain pipeline that regenerates BPMN from it, with costs and limits.
- [Delta updates and Solidity calls](docs/delta-update-and-solidity-calls.md): `setNodes(...)` and `setRoles(...)` details.
- [Contract hierarchy](docs/contract-hierarchy.md): asset and policy model.
- [Choreography policies](docs/choreography-policies.md): minting, ownership, and policy-controlled updates.
- [Commands and scripts](docs/commands-and-scripts.md): public npm commands, implementation scripts, and legacy references.
- [Evaluation toolkit](evaluation/README.md): measurement reports, CSV aggregation, and Gnuplot figure templates.
- [bpmn-builder-js](bpmn-builder-js/README.md): BPMN renderer and intermediate JSON format.

## Claude Code

The repository ships project instructions (`CLAUDE.md`), hooks (`.claude/settings.json`, `.claude/hooks/`), and skills (`.claude/skills/`). The `grill-me` and `grilling` skills come from skills.sh and are tracked in `skills-lock.json`:

```bash
npx skills add https://github.com/mattpocock/skills --skill grill-me --skill grilling -a claude-code --copy
npx skills update -p   # update them
```
