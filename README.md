# ChorNMT

ChorNMT imports a BPMN choreography into a local NMT asset, allows its nodes to be changed on-chain, and regenerates BPMN from the configuration stored in that asset.

The main path uses `paper-example`: a logistics choreography involving a buyer, manufacturer, intermediary, supplier, and special carrier. The repository also includes `parallel-gateway-example`, a small model used for technical demonstrations of parallel splits and joins.

## Prerequisites

- Node.js 20 or later
- npm

Install both sets of dependencies:

```bash
npm install
(cd bpmn-builder-js && npm install)
```

## Main path: import, render, modify, and render the paper example

### 1. Import

Convert the source BPMN into its NMT dataset:

```bash
npm run import:bpmn -- references/paper-example.bpmn
```

### 2. Render the baseline

Render the imported NMT dataset locally, before it is stored on-chain:

```bash
npm run render:nmt -- bpmn-builder-js/example/input/paper-example.nmt.json
```

This creates `bpmn-builder-js/example/output/paper-example.generated.bpmn.xml`.

### 3. Store the baseline in an asset

Open two terminals in the repository root. In the first one, compile the contracts and start the local blockchain:

```bash
npm run compile
npm run node
```

In the second terminal, deploy a new asset and copy the printed address:

```bash
npm run deploy:local
```

The deployment prints the `ChoreographyMutableAsset` address. Use that exact value in every subsequent `<asset-address>` placeholder; all three commands below must target the same asset.

Store the NMT dataset produced during step 1 in that asset:

```bash
npm run populate:nmt -- <asset-address> bpmn-builder-js/example/input/paper-example.nmt.json
```

### 4. Modify

Apply the reusable delta without rendering yet. It inserts a parallel split after `Order Special Transport`: transport-detail collection and transport-document preparation proceed in parallel, then join before the waybill.

```bash
npm run apply:asset-delta -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json --no-render
```

### 5. Render the updated asset

Export the changed on-chain asset and render the final BPMN:

```bash
npm run render:asset -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

The final BPMN is written to:

```text
bpmn-builder-js/example/output/paper-example-parallel-transport-preparation-from-contract.generated.bpmn.xml
```

## Modify an existing asset

Do not edit the exported BPMN XML directly: it is a view of the asset. Instead, create a JSON delta, apply it to the asset with `apply:asset-delta`, and regenerate BPMN with `render:asset`.

Use [scripts/data/paper-example-parallel-transport-preparation.delta.json](scripts/data/paper-example-parallel-transport-preparation.delta.json) as a template. A delta contains:

- `render`: the generated BPMN name and metadata;
- `nodes`: only nodes that are added or changed, each in its complete final state;
- optional `roles`: a `role name → Ethereum address` map for new roles.

When an edge changes, include both endpoint nodes in the delta with their complete `incoming` and `outgoing` arrays. The asset can add or replace nodes, but it cannot yet permanently remove one.

Node and role names are the contract reference keys. To import another BPMN or start again from a clean asset, run `deploy:local` again and use the new address: the asset does not clear the names already stored in its lists.

## Other examples

The repository also includes `pizza-delivery`, an introductory example, and `parallel-gateway-example`, a small model for checking parallel splits and joins. These technical datasets are separate from `paper-example` and require a new asset when changing model.

Their commands and purpose are documented in [Other examples](docs/other-examples.md). This README intentionally keeps one operational path: `paper-example` and its parallel delta.

## Generated files

Every import, export, or rendering operation writes files to:

```text
bpmn-builder-js/example/input/
bpmn-builder-js/example/output/
bpmn-builder-js/example/contract/
```

Files with a `.generated.*` suffix are local artifacts ignored by Git and can be regenerated with the commands above. Reference BPMNs and JSON deltas are versioned.

## Technical documentation

- [BPMN to NMT workflow](docs/bpmn-to-nmt-workflow.md): NMT format, import, and delta rules.
- [Delta updates and Solidity calls](docs/delta-update-and-solidity-calls.md): `setNodes(...)` and `setRoles(...)` details.
- [Contract hierarchy](docs/contract-hierarchy.md): asset and policy model.
- [bpmn-builder-js](bpmn-builder-js/README.md): BPMN renderer and intermediate JSON format.
- [Other examples](docs/other-examples.md): pizza delivery and parallel gateway examples.
