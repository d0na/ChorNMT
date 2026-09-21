# BPMN to NMT workflow

Use this procedure to encode a BPMN choreography in the NMT tool and generate a BPMN diagram from the stored NMT data.

## Commands provided by the tool

| Command | Purpose | Input | Output |
| --- | --- | --- | --- |
| `npm run import:bpmn -- <input.bpmn> [output.nmt.json]` | Imports a BPMN choreography into the NMT dataset format. | BPMN choreography XML | NMT dataset JSON |
| `npm run render:nmt -- <input.nmt.json> [output.bpmn]` | Renders an NMT dataset locally, without deploying a contract. | NMT dataset JSON | BPMN XML |
| `npm run flow:import-bpmn -- <asset-address> <input.bpmn>` | Imports BPMN, stores its NMT dataset in a fresh local contract, re-exports it, and renders it. | Fresh asset address and BPMN choreography XML | NMT JSON, contract export JSON, and BPMN XML |
| `npm run flow:local -- <contract-address> <dataset-name>` | Persists a registered dataset in the local NMT contract, exports it, and renders it. | Registered dataset | Contract export JSON and BPMN XML |

Use the first two commands for a local round-trip. Use `flow:import-bpmn` for the complete import, NMT persistence, export, and rendering flow.

## Before you start

- Use a BPMN choreography as the source model. It must identify participants, choreography tasks, message exchanges and control-flow transitions.
- Install Node.js 20 or later and npm.
- From the repository root, install the project dependencies. Also install the renderer dependencies.

```bash
npm install
cd bpmn-builder-js && npm install && cd ..
```

## 1. Inspect the source BPMN

Create a mapping table before creating NMT data.

| BPMN element | NMT representation |
| --- | --- |
| Participant | Role |
| Start event | Start node |
| End event | End node |
| Choreography task | Task node |
| Task initiator | `initiatorRole` |
| Other task participant | `participantRole` |
| Outbound message | `initiatingMessage` |
| Response message, if present | `returnMessage` |
| Sequence flow | `incoming` and `outgoing` node references |
| Gateway | Gateway node and its outgoing conditions |

For each task, record its name, initiating role, other participant, messages, predecessor, successor, and any gateway condition. Resolve ambiguous labels before continuing.

## 2. Import and review the NMT dataset

Normally this step is performed by the importer:

```bash
npm run import:bpmn -- <input.bpmn> [output.nmt.json]
```

If no output path is provided, the dataset is written to `bpmn-builder-js/example/input/<input-name>.nmt.json`. Review and edit that JSON when the source BPMN has incomplete labels or needs modelling decisions.

Verify that the imported dataset contains:

1. one unique entry in `roles` for each BPMN participant;
2. one node for every BPMN start event, end event, task and gateway;
3. `initiatorRole`, `participantRole`, `initiatingMessage`, and `returnMessage` for each task, where applicable;
4. the original control flow in `incoming`, `outgoing`, and gateway `conditions`;
5. stable, unique node and message names, because the contract uses names as references.

## 3. Register the dataset and rendering manifest (only for reusable named datasets)

1. Copy the reviewed JSON data to a dataset module in `scripts/data/` and export it.
2. Import and register the dataset in `scripts/populate-local.js`.
3. Add a matching manifest in `scripts/run-local-flow.js` with a choreography id, name, definitions id, namespace, and output base name.
4. If the source BPMN uses notation that the renderer does not yet support, implement the mapping in `bpmn-builder-js` before running the flow.

## 4. Run the local flow

### Direct import and rendering

To import a BPMN and immediately render the NMT representation, run:

```bash
npm run import:bpmn -- references/chornmt-use-case.bpmn
npm run render:nmt -- bpmn-builder-js/example/input/chornmt-use-case.nmt.json
```

The second command creates `bpmn-builder-js/example/output/chornmt-use-case.generated.bpmn.xml` unless an output path is supplied. This sequence does not start a blockchain or modify a contract.

### Contract-backed flow

Compile the contracts:

```bash
npm run compile
```

Start the local blockchain in one terminal:

```bash
npm run node
```

In another terminal, deploy a fresh contract and copy its address:

```bash
npm run deploy:local
```

For an imported BPMN, run the complete contract-backed flow with the minted `ChoreographyMutableAsset` address printed by deployment:

```bash
npm run flow:import-bpmn -- <asset-address> references/chornmt-use-case.bpmn
```

This command imports the BPMN, stores the imported NMT dataset in the asset, exports the asset data, normalizes it, and renders the final BPMN. The generated BPMN is written to `bpmn-builder-js/example/output/<input-name>-from-contract.generated.bpmn.xml`.

For a pre-registered dataset, use the existing command instead:

```bash
npm run flow:local -- <contract-address> <dataset-name>
```

Use a fresh contract whenever you switch datasets. Existing contract state retains node and role names from earlier population runs.

## 5. Validate the generated artifacts

Review these generated files:

- `bpmn-builder-js/example/input/<output-base-name>.raw.generated.json`
- `bpmn-builder-js/example/input/<output-base-name>.normalized.generated.json`
- `bpmn-builder-js/example/output/<output-base-name>.generated.bpmn.xml`

Check that the generated BPMN has the same participants, task order, message direction, gateway behavior and start/end transitions as the source BPMN. Open the XML in a BPMN-compatible modeler to verify layout, participant bands and message envelopes.

## 6. Document and present the final result

After each implementation iteration:

1. Document every dataset, contract, exporter, or renderer change in the relevant Markdown documentation.
2. State which source BPMN elements were added, changed, unsupported, or intentionally omitted.
3. Link the generated BPMN artifact and the source BPMN used for comparison.
4. Visualize the final generated BPMN in a BPMN modeler and include the final diagram or an exported image in the user-facing documentation.
5. Record the validation result and any remaining differences from the source model.
