---
name: local-flow
description: Run the ChorNMT end-to-end paper-example flow on a local Hardhat node (start node, deploy the choreography type from the BPMN and mint an instance, render, modify, render). Use to see a change working against a real chain, or when asked to run/demo the project.
---

# Local end-to-end flow

1. Make sure dependencies are installed in both packages (`node_modules/` in the root and in `bpmn-builder-js/`); if not, run `npm install` and `(cd bpmn-builder-js && npm install)`.
2. Check whether a node already answers on `http://127.0.0.1:8545`:
   `curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:8545`
   If not, start `npm run start:operations` **in the background** and wait until the RPC answers. Do not start a second node.
3. `npm run deploy:asset -- references/paper-example.bpmn` and take the printed `ChoreographyMutableAsset` address: an instance of the paper choreography type, born with its model. Use this same address for every later step; a fresh deploy (or a new mint) is needed for a clean asset.
4. Run the flow:

```bash
npm run render:asset -- <asset> bpmn-builder-js/example/input/paper-example.nmt.json
npm run modify:asset -- <asset> scripts/data/paper-example-parallel-transport-preparation.delta.json --no-render
npm run render:asset -- <asset> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

5. Verify outputs in `bpmn-builder-js/example/output/` (`*-from-contract.generated.bpmn.xml`) and report the gas lines each command printed.
6. Stop the background node when done unless the user wants it kept.

If a command fails with missing artifacts, run `npm run compile` first. If the node was restarted, all earlier asset addresses are gone.
