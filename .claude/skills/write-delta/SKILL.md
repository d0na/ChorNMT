---
name: write-delta
description: Author a JSON delta that changes a ChorNMT choreography asset (add/replace tasks, gateways, edges, roles) and apply it with modify:asset. Use when the user wants to change the BPMN model of an asset.
---

# Write and apply a delta

Never edit generated BPMN XML: it is a view of the asset. Changes are JSON deltas applied on-chain.

## Start from

- Template: `scripts/data/paper-example-parallel-transport-preparation.delta.json`.
- Current state: the latest `*.nmt.json` in `bpmn-builder-js/example/input/` or the raw export (`*.raw.generated.json`) written by `render:asset`. Base the delta on the real current node state, not on memory.
- Rules: `docs/bpmn-to-nmt-workflow.md` and the "Modify an existing asset" section of `README.md`.

## Format

```json
{
  "schemaVersion": "1.0",
  "description": "...",
  "render": { "choreographyId", "choreographyName", "definitionsId", "targetNamespace", "outputBaseName" },
  "nodes": [ { "name", "nodeType", "incoming", "outgoing", "conditions", "initiatorRole", "participantRole", "initiatingMessage", "returnMessage" } ],
  "roles": { "Role name": "0x..." }
}
```

`nodeType`: 0 START_EVENT, 1 END_EVENT, 2 TASK, 3 EXCLUSIVE_SPLIT, 4 EXCLUSIVE_JOIN, 5 PARALLEL_SPLIT, 6 PARALLEL_JOIN, 7 EVENT_BASED_GATEWAY.

## Rules to check before applying

- Include only changed nodes, each **complete** (every field, final state).
- `incoming`/`outgoing` hold node **names**. When an edge changes, include **both** endpoints with their full arrays, and make them mirror each other.
- `conditions` has one entry per `outgoing` (use `""` when unconditioned).
- Gateways have empty role and message fields; tasks need `initiatorRole`, `participantRole`, and `initiatingMessage`.
- Every role referenced must exist on the asset or be added in `roles`.
- Nodes cannot be removed — disconnect them instead, and say so to the user.
- A configured `CreatorSmartPolicy` may reject the update (task/flow limits, allowlist, protected nodes and roles, role license requirements); see `docs/choreography-policies.md`.

## Apply

Save as `scripts/data/<name>.delta.json`, then (node running, same asset address — see the `local-flow` skill):

```bash
npm run modify:asset -- <asset> scripts/data/<name>.delta.json --no-render
npm run render:asset -- <asset> scripts/data/<name>.delta.json
```

Check the regenerated `bpmn-builder-js/example/output/<outputBaseName>.generated.bpmn.xml`.
