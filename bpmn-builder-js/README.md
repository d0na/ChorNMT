# bpmn-builder-js

A minimal JavaScript library that transforms structured JSON into BPMN 2.0 XML for a dedicated renderer.

## Goal

This initial baseline is meant to:

- define an initial JSON input contract;
- generate a structurally valid BPMN XML file;
- leave a clear extension point for richer business mappings once the input model is finalized.

## Structure

```text
bpmn-builder-js/
  src/
    index.js
  example/
    input/
      basic-process.json
    output/
      basic-process.bpmn
      reference-output.bpmn.xml
  README.md
```

## Initial JSON Contract

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
const { generateBpmnXml } = require("./src");
```

### `generateBpmnXml(input)`

Receives a JSON object and returns a BPMN XML string.

## Usage Example

```js
const fs = require("fs");
const path = require("path");
const { generateBpmnXml } = require("./src");

const inputPath = path.join(__dirname, "example", "input", "basic-process.json");
const outputPath = path.join(__dirname, "example", "output", "basic-process.generated.bpmn");

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const xml = generateBpmnXml(input);

fs.writeFileSync(outputPath, xml);
```

## Current Rules

- basic support for `startEvent`, `task`, `endEvent`, and in general any BPMN tag passed through `type`;
- minimal validation for `process.id`, `nodes`, and `sequenceFlows`;
- XML escaping for text values;
- generation of `definitions`, `process`, `sequenceFlow`, `collaboration`, and `participant`.

## Current Limits

- it does not generate the `bpmndi:BPMNDiagram` graphical block;
- it does not validate whether `type` is a semantically correct BPMN element;
- it does not yet handle gateways, lanes, messages, conditions, properties, or custom extensions;
- the reference BPMN output is stored in `example/output/reference-output.bpmn.xml` and will be used to converge on the final format.

## Recommended Next Steps

1. Formally define the JSON input schema.
2. Add automated tests.
3. Extend the mapping for gateways, user tasks, service tasks, and diagram coordinates.
