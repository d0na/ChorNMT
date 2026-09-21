# Other examples

This page collects technical examples that are not the project's main workflow. For the complete BPMN flow, including on-chain import and modification, use [paper-example](../README.md).

Every command on this page must use an asset newly created with `npm run deploy:local`. Do not reuse an asset that has been used for a different dataset: the contract retains previously stored node and role names.

## Pizza delivery

`pizza-delivery` is the default dataset, defined in the scripts. It is useful for a quick rendering run and does not originate from an imported BPMN file.

```bash
npm run flow:local -- <asset-address>
```

The command populates the asset, exports contract data, and generates BPMN at `bpmn-builder-js/example/output/pizza-delivery-from-contract.generated.bpmn.xml`.

## Parallel gateway example

`parallel-gateway-example` is a small model with a parallel split and join. It is used to verify gateway support without the complexity of the logistics case.

```bash
npm run flow:local -- <asset-address> parallel-gateway-example
```

To see an incremental update on the same model, run:

```bash
npm run augment:parallel-gateway-example -- <asset-address>
```

The script loads the baseline model, generates an initial BPMN, adds `Activity4` after the parallel join, and generates a second BPMN. See [Delta updates and Solidity calls](delta-update-and-solidity-calls.md) for the `setNodes(...)` details.
