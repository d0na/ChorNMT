# ChorNMT

Local Hardhat environment for the `BPMNChoreography` smart contract, plus the supporting `bpmn-builder-js` library used to export on-chain choreography data into BPMN-oriented JSON.

## Project Layout

```text
ChorNMT/
  contracts/
    BPMNChoreography.sol
  scripts/
    deploy-local.js
    deploy.js
    populate-local.js
    run-local-flow.js
    clean.js
  bpmn-builder-js/
    ...
  hardhat.config.js
  package.json
```

## Requirements

- Node.js `>= 20`
- npm

## Install

From the project root:

```bash
npm install
```

If you also want the BPMN JSON/XML tooling:

```bash
cd bpmn-builder-js
npm install
```

## Compile

```bash
npm run compile
```

## Start The Local Node

```bash
npm run node
```

This starts a local Hardhat JSON-RPC node on:

```text
http://127.0.0.1:8545
```

## Deploy The Contract

In a second terminal, from the project root:

```bash
npm run deploy:local
```

The current local deployment address obtained during setup was:

```text
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

This address is valid for the current local Hardhat chain state. If you restart the node from a clean state and redeploy, you may get the same address again with the default deployer account.

## Populate The Contract

Once the contract is deployed, populate it with the built-in pizza delivery example:

```bash
npm run populate:local -- 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

The populate script also accepts a dataset name as second argument:

```bash
npm run populate:local -- <contract-address> <dataset>
```

Available datasets:

- `pizza-delivery` default
- `paper-example`

To populate the contract from `paper-example.bpmn`:

```bash
npm run populate:local -- 0x5FbDB2315678afecb367f032d93F642f64180aa3 paper-example
```

If the same contract was already populated with another dataset, deploy a fresh contract before populating it again. The contract updates existing nodes but does not clear the stored node-name list.

## Run The Full Local Flow

Assuming the local chain is already running and the contract is already deployed, this command:

- populates the contract
- exports choreography data to BPMN-like JSON
- generates BPMN XML from that JSON

`flow:local` already includes the populate step. If you use `flow:local`, you do not need to run `populate:local` separately first.

```bash
npm run flow:local -- 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Like `populate:local`, the full flow accepts an optional dataset name:

```bash
npm run flow:local -- <contract-address> <dataset>
```

For the paper example:

```bash
npm run flow:local -- 0x5FbDB2315678afecb367f032d93F642f64180aa3 paper-example
```

Generated files:

- `bpmn-builder-js/example/input/pizza-delivery-from-contract.raw.generated.json`
- `bpmn-builder-js/example/input/pizza-delivery-from-contract.normalized.generated.json`
- `bpmn-builder-js/example/output/pizza-delivery-from-contract.generated.bpmn.xml`

With `paper-example`, the generated files use the `paper-example-from-contract` prefix.

If the flow reports unexpected nodes or roles, the contract was already populated with another dataset. Run `npm run deploy:local` again and use the new address before rerunning the flow.

If you change dataset, use this sequence:

1. Keep the local Hardhat node running with `npm run node`.
2. Deploy a fresh contract with `npm run deploy:local`.
3. Run the full flow with the new address and the target dataset, for example `npm run flow:local -- <new-contract-address> paper-example`.

Do not reuse the old contract address when switching dataset. The contract updates node data but does not clear the stored node-name and role-name lists.

The generated BPMN XML includes a dynamic `bpmndi:BPMNDiagram` graphical layout block. The layout is derived from the exported nodes and sequence flows, so viewers can render the diagram without hardcoded coordinates.

The flow also writes a generated manifest under `bpmn-builder-js/example/contract/*.generated.json`. These generated manifests are temporary artifacts, are ignored by git, and are removed by `npm run clean`.

## Contract Files

There are two copies of the contract source:

- [BPMNChoreography.sol](/Users/francesco/workspace/git/research/ChorNMT/BPMNChoreography.sol)
- [contracts/BPMNChoreography.sol](/Users/francesco/workspace/git/research/ChorNMT/contracts/BPMNChoreography.sol)

The root file is preserved as the original working copy. The `contracts/` version is the one used by Hardhat for compilation and deployment.

## Export Contract Data To BPMN JSON

The BPMN export flow lives in [bpmn-builder-js](/Users/francesco/workspace/git/research/ChorNMT/bpmn-builder-js).

From that folder you can export choreography data from the deployed contract:

```bash
cd bpmn-builder-js
npm run export:contract -- ./example/contract/pizza-delivery-contract-manifest.json
```

`pizza-delivery-contract-manifest.json` is a checked-in example for manual export. The manifests created automatically by `flow:local` use the `*.generated.json` suffix and are not meant to be committed.

Important constraint:

- `BPMNChoreography.sol` is name-based, not id-based
- it exposes `getNode(name)`, `getNodeNames()`, `getRole(role)`, and `getRoleNames()`
- the contract stores the full list of node names and role names internally, so the export script can read everything automatically
- BPMN ids are generated later by the export mapper in `bpmn-builder-js`

See:

- [bpmn-builder-js/README.md](/Users/francesco/workspace/git/research/ChorNMT/bpmn-builder-js/README.md)
- [bpmn-builder-js/example/contract/pizza-delivery-contract-manifest.json](/Users/francesco/workspace/git/research/ChorNMT/bpmn-builder-js/example/contract/pizza-delivery-contract-manifest.json)

## Useful Commands

```bash
npm run compile
npm run node
npm run deploy:local
npm run populate:local -- <contract-address>
npm run populate:local -- <contract-address> paper-example
npm run flow:local -- <contract-address>
npm run flow:local -- <contract-address> paper-example
npm run clean
```
