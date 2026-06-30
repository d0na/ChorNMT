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

## Run The Full Local Flow

Assuming the local chain is already running and the contract is already deployed, this command:

- populates the contract
- exports choreography data to BPMN-like JSON
- generates BPMN XML from that JSON

```bash
npm run flow:local -- 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Generated files:

- `bpmn-builder-js/example/input/pizza-delivery-from-contract.generated.json`
- `bpmn-builder-js/example/input/pizza-delivery-from-contract.generated.bpmn.xml`

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
npm run flow:local -- <contract-address>
npm run clean
```
