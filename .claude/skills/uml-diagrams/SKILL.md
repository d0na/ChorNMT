---
name: uml-diagrams
description: Update, add, and render the ChorNMT UML use case and sequence diagrams (PlantUML in docs/uml/, SVG shown in docs/uml.md). Use whenever a change touches a flow, actor, policy decision, or function the diagrams show, or when asked for a new UML diagram.
---

# UML diagrams

Use case and sequence diagrams are documentation: they follow the code in the same commit, like the other docs. Sources are PlantUML (`docs/uml/*.puml`, shared style `docs/uml/style.iuml`); the SVG next to each source is generated, versioned, and embedded in `docs/uml.md`.

| Diagram | Shows | Update when |
| --- | --- | --- |
| `use-case-choreography` | Actors and use cases of the choreography NMT and asset | A choreography action, actor, or trust rule changes (`docs/choreography-policies.md` table). |
| `use-case-participant-license` | Actors and use cases of the role licenses | A participant action or rule changes. |
| `sequence-deploy-and-mint` | `deploy:asset`, `mintWithInitialModel` | Deploy order, constructor arguments, mint checks. |
| `sequence-apply-delta` | `modify:asset`, `setNodes` with action and domain checks | Asset mutators, policy evaluation order, errors. |
| `sequence-import-and-render` | `import:asset`, `render:asset`, the off-chain pipeline | Importer, `tokenURI`, renderer, `bpmn-builder-js` stages. |
| `sequence-role-license-sale` | Role linked to a license, license sale | `ChoreographyParticipantAM`, constrained Creator, participant policies. |
| `sequence-policy-replacement` | `setMasterSmartPolicy`, `setCreatorSmartPolicy` | Policy variants, administrators, replacement rules. |

## Steps

1. Find the diagrams the change touches: grep `docs/uml/*.puml` for every contract, function, error, script, or actor you renamed, removed, or changed.
2. Edit the `.puml` sources. Rules:
   - `!include style.iuml` first; one diagram per file, `@startuml <file-name>`.
   - Use the real names: contract, function, and error names exactly as in the code (`OperationDenied(0)`, `evaluateNodeUpdate`), npm commands as in `package.json`.
   - Sequence diagrams show who calls whom and the decision each policy returns; group the Creator AND Holder checks; show the denial branch with its error.
   - Use case diagrams use actors with their Hardhat account when the policies hardcode it; `<<include>>` for a mandatory step, `<<extend>>` for an optional variant.
   - A new flow worth explaining gets a new file `use-case-<topic>.puml` or `sequence-<topic>.puml`, a section in `docs/uml.md`, and a row in the table above.
3. Render and check:

```bash
npm run docs:uml     # needs Java and Graphviz (dot); downloads PlantUML 1.2024.7 once into .cache/
npm run check:uml    # what CI runs: every SVG matches its source hash
```

4. Look at the result before committing: render a PNG into the scratchpad (`java -jar .cache/plantuml/plantuml-1.2024.7.jar -tpng -o <scratchpad> docs/uml/<file>.puml`) and read it; fix overlaps or unreadable labels.
5. Commit the `.puml` and `.svg` together with the code change. Never edit an `.svg` by hand: it carries the source hash `check:uml` verifies.
