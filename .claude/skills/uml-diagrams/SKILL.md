---
name: uml-diagrams
description: Update, add, and render the ChorNMT UML class, use case, and sequence diagrams (PlantUML in docs/uml/, SVG shown in docs/uml.md). Use whenever a change touches a flow, actor, policy decision, contract state, or function the diagrams show, or when asked for a new UML diagram.
---

# UML diagrams

The kinds of diagram, with their rules:

- **Architecture overviews** (`docs/uml/architecture-overview.mmd` and `architecture-participants.mmd`, Mermaid, the only diagrams not in PlantUML) is written by hand and not checked; rerender its SVG with mermaid-cli (command in `docs/uml.md`): the off-chain pipeline and the on-chain contracts, the English counterpart of the Mermaid overview in `docs/architettura.md` (keep the two in agreement).
- **Class diagram** (`docs/uml/class-diagram.puml`) is written by hand and not checked against the code: it shows the contract hierarchy and the state, functions, and structs of `ChoreographyMutableAsset` and `ParticipantMutableAsset`, with the real names.
- **Rendering diagram** (`docs/uml/rendering.puml`) is written by hand and not checked against the code: a horizontal component diagram of the render, the on-chain `tokenURI` computation and the off-chain pipeline of `docs/rendering.md`, in numbered steps.
- **Use case diagrams** (`docs/uml/use-case-*.puml`) are written by hand and checked by `npm run check:use-cases` against the trust tables of `docs/choreography-policies.md`, the cases of `scripts/test-policies.js`, and the experiment evidence, both ways.
- **Sequence diagrams** are generated, one per experiment phase, from the call traces (`scripts/experiment/sequence.js`, into `evaluation/evidence/uml/F<n>.puml` filtered and `F<n>-full.puml` complete). Never write or edit one by hand: change the experiment (`scripts/experiment/phases.js`, `run.js`) or the code it runs, then `npm run evidence:update`.

| Diagram | Shows | Update when |
| --- | --- | --- |
| `architecture-overview` | Off-chain scripts, on-chain contracts, and the data flowing between them | A component, a script, or a data flow changes. |
| `architecture-participants` | The overview plus the role license path (mint, link, type check, transfer, reset), numbered ①–⑥ | A participant contract, the attribute manager, or the license path changes. |
| `class-diagram` | Contract hierarchy and the internals of the two mutable assets | A contract gains, loses, or renames a state variable, struct field, function, or inheritance link the diagram shows. |
| `rendering` | The render in numbered steps: the `tokenURI` call across asset, NMT, and renderer, then the JavaScript pipeline and the files it writes | A render step, a script of the pipeline, a read function of the asset, or an output file changes. |
| `use-case-choreography` | Actors (trust-table columns) and use cases of the choreography NMT and asset | A choreography action, actor, or trust rule changes, or the experiment adds or drops a transaction. |
| `use-case-participant-license` | Actors and use cases of the role licenses | A participant action or rule changes. |
| `evaluation/evidence/uml/F1`–`F8` | The calls of each phase, with the policy answers | Generated: rerun `npm run evidence:update`. |

## Steps for a use case diagram

(For the class diagram, the rendering diagram, and the architecture overviews, skip the annotations and `check:use-cases`: edit, render, look, commit.)

1. Edit the `.puml`. Every element carries its annotations as PlantUML comments on the lines before it:
   - before an actor: `' accounts: <experiment account names>`; the actor's first line is a trust-table column (`Holder`, `Authorized creator`, `License holder`, `Buyer`, `Authority`, `Anyone else`);
   - before a use case: `' trust: <table>:<function>` (the row), `' evidence: <transaction or read keys>` or `test-only` (then add `<<test only>>` to the use case), and `' test: <test-policies case labels, separated by ;>`.
   - Use the real names: contract, function, and error names exactly as in the code. `<<include>>` for a mandatory step, `<<extend>>` for an optional variant.
   - The Master and Creator policy setters have no use case: those policies are never replaced (open question in `docs/decisions.md`).
2. `npm run check:use-cases`, then render and check. In a Claude Code session the `post-edit.sh` hook renders after every `.puml` edit and `pre-commit.sh` refuses a commit with a stale SVG or a failing use case check; outside Claude Code:

```bash
npm run docs:uml          # needs Java and Graphviz (dot); downloads PlantUML 1.2024.7 once into .cache/
npm run check:uml         # what CI runs: every SVG matches its source hash
npm run check:use-cases   # what CI runs: use cases against trust tables, tests, and evidence
```

3. Look at the result before committing: render a PNG into the scratchpad (`java -jar .cache/plantuml/plantuml-1.2024.7.jar -tpng -o <scratchpad> docs/uml/<file>.puml`) and read it; fix overlaps or unreadable labels.
4. Commit the `.puml` and `.svg` together with the change. Never edit an `.svg` by hand: it carries the source hash `check:uml` verifies.

## Diagrams in the protocol

`docs/experiment.md` embeds the sequence diagram of each phase in its phase block, and its reading guide (the `uml-guide` block of `scripts/experiment/protocol.js`) lists every diagram with what it shows: a new use case diagram gets a row there, and the phase rows follow the specification. Never edit those blocks by hand; rerun `npm run evidence:update` (the `experiment` skill).
