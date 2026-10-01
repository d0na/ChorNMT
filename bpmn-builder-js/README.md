# bpmn-builder-js

A minimal JavaScript library that transforms structured JSON into BPMN 2.0 XML for a dedicated renderer.

## Quick Start

Install dependencies:

```bash
npm install
```

Generate the default example:

```bash
npm run generate:example
```

This writes a generated file under `example/output/`, but generated outputs are not tracked in git.

Generate the choreography example:

```bash
npm run generate:example -- pizza-delivery-choreography
```

Export choreography data from a deployed `ChoreographyMutableAsset` through `web3`:

```bash
npm run export:contract -- <manifest.json> [output.raw.generated.json]
```

In the smart-contract export flow, the contract is name-based and self-contained. BPMN `id` values are generated later by `src/normalize.js`.

Convert a BPMN choreography to NMT, or render an NMT file back to BPMN, without a blockchain:

```bash
npm run import:bpmn -- <input.bpmn> [output.nmt.json]
npm run render:nmt -- <input.nmt.json> [output.bpmn]
```

`import:bpmn` writes `example/input/<name>.nmt.json` by default; `render:nmt` writes `example/output/<name>.generated.bpmn.xml`. The NMT mapping rules are in [BPMN to NMT workflow](../docs/bpmn-to-nmt-workflow.md#nmt-mapping).

Use the library in code:

```js
import { generateBpmnXml } from "./src/index.js";

const input = {
  process: {
    id: "Process_OrderFlow",
    name: "Order Flow",
    nodes: [
      { id: "StartEvent_OrderReceived", type: "startEvent" },
      { id: "Task_ValidateOrder", type: "task", name: "Validate order" },
      { id: "EndEvent_OrderProcessed", type: "endEvent" }
    ],
    sequenceFlows: [
      {
        id: "Flow_Start_To_Validate",
        sourceRef: "StartEvent_OrderReceived",
        targetRef: "Task_ValidateOrder"
      },
      {
        id: "Flow_Validate_To_End",
        sourceRef: "Task_ValidateOrder",
        targetRef: "EndEvent_OrderProcessed"
      }
    ]
  }
};

const xml = await generateBpmnXml(input);
console.log(xml);
```

## Goal

This initial baseline is meant to:

- define an initial JSON input contract;
- generate a structurally valid BPMN XML file through `bpmn-moddle`;
- leave a clear extension point for richer business mappings once the input model is finalized.

## Structure

```text
bpmn-builder-js/
  package.json
  scripts/
    generate-example.js
    import-bpmn.js
    render-nmt.js
    web3.js
  src/
    index.js
    nmt.js
    normalize.js
    validation.js
    mappers/
      process-mapper.js
    generators/
      moddle-generator.js
  example/
    input/
      simple-process.json
      pizza-delivery-choreography.json
    output/
      reference-output.bpmn.xml
      reference-output-2.bpmn.xml
  README.md
```

## Initial JSON Contract

The library accepts two input modes: a `process` object (shown below) or a `choreography` object (see `example/input/pizza-delivery-choreography.json`). Choreography input may reference participants, nodes, and messages either by id (`sourceRef`, `participantRef`, `messageFlowRef`) or by name/key (`sourceName`, `role`, `messageKey`, …), as produced by the contract export; `src/normalize.js` resolves names to ids before generation.

```json
{
  "process": {
    "id": "Process_OrderFlow",
    "name": "Order Flow",
    "isExecutable": false,
    "nodes": [
      { "id": "StartEvent_OrderReceived", "type": "startEvent", "name": "Order received" },
      { "id": "Task_ValidateOrder", "type": "task", "name": "Validate order" },
      { "id": "EndEvent_OrderProcessed", "type": "endEvent", "name": "Order processed" }
    ],
    "sequenceFlows": [
      {
        "id": "Flow_Start_To_Validate",
        "sourceRef": "StartEvent_OrderReceived",
        "targetRef": "Task_ValidateOrder"
      },
      {
        "id": "Flow_Validate_To_End",
        "sourceRef": "Task_ValidateOrder",
        "targetRef": "EndEvent_OrderProcessed"
      }
    ]
  }
}
```

## API

```js
import { generateBpmnXml } from "./src/index.js";
```

### `generateBpmnXml(input)`

Receives a JSON object and returns a Promise that resolves to a BPMN XML string.

## Usage Example

```js
import fs from "node:fs/promises";
import path from "node:path";
import { generateBpmnXml } from "./src/index.js";

const inputPath = path.join(process.cwd(), "example", "input", "simple-process.json");
const outputPath = path.join(process.cwd(), "example", "output", "simple-process.generated.bpmn.xml");

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const xml = await generateBpmnXml(input);

await fs.writeFile(outputPath, xml, "utf8");
```

## Scripts

```bash
npm install
npm run generate:example
npm run generate:example -- pizza-delivery-choreography
npm run export:contract -- <manifest.json>
npm run import:bpmn -- <input.bpmn>
npm run render:nmt -- <input.nmt.json>
```

`example/output/` is reserved for reference BPMN files plus temporary generated outputs created during local runs.

## Export From Smart Contract

The script [scripts/web3.js](scripts/web3.js) reads a `ChoreographyMutableAsset` through `web3` and produces a raw, name-based choreography JSON (`sourceName`, `messageKey`, participants by role name). It is not id-based like `example/input/pizza-delivery-choreography.json`; normalization bridges the two. The legacy `references/BPMNChoreography.sol` exposes compatible getters.

How the contract export works:

- the contract exposes `getNode(name)`, `getNodeNames()`, `getRole(role)`, and `getRoleNames()`;
- node names and role names are stored on-chain, so the export script can discover them automatically;
- the manifest is only used for RPC/configuration and output metadata: `rpcUrl` and `contractAddress` are required; `choreographyId`, `choreographyName`, `definitions.id`, `definitions.targetNamespace`, and `outputPath` are optional;
- `outputPath` is resolved relative to the manifest; without it the export goes to `../input/contract-export.raw.generated.json`. A second CLI argument overrides both.

Manifest example:

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "contractAddress": "0x0000000000000000000000000000000000000000",
  "choreographyId": "PizzaDelivery",
  "outputPath": "../input/pizza-delivery-from-contract.raw.generated.json"
}
```

The export script produces a raw semantic JSON. BPMN ids are generated later by the library normalization step before XML generation.

When the root `scripts/run-local-flow.js` or `render:asset` workflow creates manifests automatically, it writes them as `example/contract/*-contract-manifest.generated.json`. Those files are generated artifacts and are not intended to be committed. For manual export you can either reuse one of those generated manifests or create a local manifest file with the same schema.

## Current Rules

- generation is based on `bpmn-moddle`, not manual XML string concatenation;
- basic support for `startEvent`, `task`, `endEvent`, gateways, choreography tasks, messages, and message flows;
- validation, after normalization, of `process.id` or `choreography.id`, nodes, sequence flows, participants, and message flows (every reference must resolve);
- generation of `definitions`, `process`, `sequenceFlow`, `collaboration` (process input only), `participant`, choreography models, and dynamic `bpmndi:BPMNDiagram` layout (choreography input only).

## Current Limits

- `type` must name a BPMN element known to `bpmn-moddle`, but it is not checked against the context (for example a `choreographyTask` inside a process);
- gateways are emitted without `gatewayDirection`, and a sequence-flow condition is kept only as the flow `name` (no `conditionExpression`);
- it does not yet handle lanes, properties, or custom extensions;
- generated DI layout is deterministic and graph-derived, but it is not a full BPMN auto-layout engine;
- the library currently targets Node.js `>=20.12`, matching the `bpmn-moddle` engine requirement;
- the reference BPMN output is stored in `example/output/reference-output.bpmn.xml` and will be used to converge on the final format.

## Recommended Next Steps

1. Formally define the JSON input schema.
2. Add automated tests.
3. Extend the mapping with gateway direction, condition expressions, user tasks, and service tasks.
