---
name: uml-diagrams
description: Update, add, and render the ChorNMT UML use case and sequence diagrams (PlantUML in docs/uml/, SVG shown in docs/uml.md). Use whenever a change touches a flow, actor, policy decision, or function the diagrams show, or when asked for a new UML diagram.
---

# UML diagrams

Two kinds of diagram, with two rules:

- **Use case diagrams** (`docs/uml/use-case-*.puml`) are written by hand and checked by `npm run check:use-cases` against the trust tables of `docs/choreography-policies.md`, the cases of `scripts/test-policies.js`, and the experiment evidence, both ways.
- **Sequence diagrams** are generated, one per experiment phase, from the call traces (`scripts/experiment/sequence.js`, into `evaluation/evidence/uml/F<n>.puml` filtered and `F<n>-full.puml` complete). Never write or edit one by hand: change the experiment (`scripts/experiment/phases.js`, `run.js`) or the code it runs, then `npm run evidence:update`.

| Diagram | Shows | Update when |
| --- | --- | --- |
| `use-case-choreography` | Actors (trust-table columns) and use cases of the choreography NMT and asset | A choreography action, actor, or trust rule changes, or the experiment adds or drops a transaction. |
| `use-case-participant-license` | Actors and use cases of the role licenses | A participant action or rule changes. |
| `evaluation/evidence/uml/F1`–`F8` | The calls of each phase, with the policy answers | Generated: rerun `npm run evidence:update`. |

## Steps for a use case diagram

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
