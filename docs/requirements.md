# Requirements

What ChorNMT must demonstrate for the paper, how each claim is checked, and what the project deliberately does not do. The design choices behind these requirements are in [Design decisions](decisions.md).

## Claims

Each claim has acceptance criteria that point to evidence already produced by the tests or the evaluation. A claim holds when its evidence is produced and its checks pass; `npm test` (CI) and `npm run evaluate:all` produce all of it.

### C1. A choreography lives on-chain and is rebuilt from the chain

A BPMN choreography becomes a choreography type: a `ChoreographyNMT` whose model is fixed at deploy, and whose instances are mutable assets (`ChoreographyMutableAsset`) born with that model. The BPMN XML is always a view: changes go to the asset of an instance, and the model is extracted from the chain and drawn again, before and after a change.

Acceptance criteria:

- `paper-example.bpmn` is imported into the model of a choreography type, an instance is minted with that model (`deploy:asset`), and a delta is applied to it (`modify:asset`).
- Every instance is born with the model of its type: `test:policies` decodes a freshly minted asset through `tokenURI` and compares it with the model.
- The baseline and the modified BPMN XML are regenerated from the on-chain state through `tokenURI`, and drawn with chor-js as SVG/PNG (`evaluate:paper`, paper section of `evaluation/final-report.generated.md`).
- The CI importer step converts the reference BPMN models without errors.
- No accepted update can make the model undrawable: every Creator policy rejects a sequence flow declared on one endpoint only, and `test:policies` covers the denial.

### C2. Every change is decided by policies, at the right level

No state change bypasses the policies. The Master policy decides only NMT-level actions (`mint`, `transferFrom`, its own replacement; by rule the Master and the Creator are never replaced, see the open questions in [Design decisions](decisions.md#open-questions)). A change to the model of an asset (`setNodes`, `setRoles`, `setLinked`) is decided only by the Creator AND the Holder policy, both at the action check and at the domain check. Policies stand for XACML translations: their rules are hardcoded, and a rule change is a new policy.

Acceptance criteria:

- The trust table in [Choreography policies](choreography-policies.md#who-can-do-what), the cases of `scripts/test-policies.js`, and [Policy and test specification](policy-test-specification.md) agree.
- `test:policies` passes: every public mutator has at least one allowed and one denied case, and every denial is a reverted transaction.
- `evaluate:policies` reports the gas of every allowed and denied policy decision.

### C3. The Creator sets constraints the Holder cannot remove

The Creator policy defines the structural boundaries of the BPMN model (task and flow limits, allowed task names, known endpoints, protected nodes, roles assigned once, role license requirements). The Holder can only restrict further. The constraints must also be able to express ordering rules such as "task Y may not follow task X", checked on the delta and on the current model of the instance; that rule is planned, not implemented yet.

Acceptance criteria:

- `test:policies` denies every update outside the constraints of `CreatorSmartPolicyTestScenario` and the bypass attempts (holder replacing the Creator policy, unlinking a protected node through a neighbour).
- `evaluate:policies` applies the paper delta under `CreatorSmartPolicyPaperScenario` and reports the allowed and denied structural cases.

### C4. Roles are played by transferable participant licenses

A role is linked once to a license (`ParticipantMutableAsset`) of the type the Creator requires. The organization behind the role changes when the license is sold to a qualified organization, not through `setRoles`.

Acceptance criteria:

- `test:policies` covers license minting, linking, message declaration, and sale, with allowed and denied cases (see [Participant license design](participant-license-design.md)).
- `evaluate:policies` reports the Special Carrier license sale and its costs.

### H5. Cost hypothesis

The cost of the whole flow (deploy of a type, mint, modify) is measured, and a delta update is expected to cost less than a new instance of the type, born with the whole model, depending on the size of the delta. This is a hypothesis, confirmed or refuted by the measurements, not by this document.

Acceptance criteria:

- `evaluate:paper` reports the gas of the type deployment (model contract included), the mint, and the delta, the delta versus new instance comparison, and the gas by number of changed nodes (`gas-by-changed-nodes`).
- Every contract change reports its gas before and after; an increase needs a stated reason (see [Contract structure](contract-structure.md#gas)).
- Every contract fits the EIP-170 and EIP-3860 limits (`check:size`, CI).

### E. The experiment is documented by evidence produced by code

Every number, outcome, chart, BPMN drawing, and sequence diagram that documents the experiment comes from the experiment run, never from hand-written text, and the documentation is at least as exhaustive as the reports it replaces (decisions D16–D22). Being implemented in six steps; until then the claims above keep their current evidence.

Acceptance criteria:

- One run on an ephemeral network executes phases F1–F8 of the versioned phase specification on one instance, through the same functions as the CLI commands, and fails if an outcome differs from the expected one.
- `evaluation/evidence/` holds the last approved run; `check:evidence` regenerates and compares it in the pre-commit hook and in CI, timings excluded, and recomputes every derived value (gas from receipts, phase totals, USD, delta versus new instance, chart points, test matrix versus run) independently.
- The sequence diagrams are generated from the call trace, filtered and complete; their transactions, order, outcomes, and participants match the phase tables. The use case diagrams match the trust table, the test cases, and the evidence both ways.
- The baseline BPMN XML is equivalent to `references/paper-example.bpmn`, the final one equals the baseline plus the delta, both equal the on-chain state, and each SVG contains exactly the element names of its XML.
- `docs/experiment.md` contains no number or outcome word outside generated blocks, except declared structural ones, and the parity checklist maps every section, table, column, and artifact of the former reports to a block of the protocol.

## Supporting features

None at the moment: every tested function serves a claim.

## Non-goals

Out of scope by choice; do not add them:

- **Execution of the choreography.** The asset holds the model, not running instances: no task state, no message exchange at runtime.
- **The XACML to Solidity translator.** The policies are hand-written simulations of its output.
- **BPMN models other than `paper-example`.** `pizza-delivery` and `parallel-gateway-example` are development references only.
- **Deleting nodes.** Nodes are overwritten, never removed; a clean model needs a new asset.
- **A version registry.** The history of a model is the chain itself (see [Design decisions](decisions.md)).
- **Replacing the model of a type.** The model contract of a `ChoreographyNMT` is immutable; another starting model is another type.
- **Models above the contract size limit.** The encoded model is stored as contract code, at most 24,576 bytes (the paper example takes 11,136).
- **Production deployment.** No public networks, no security audit; accounts are the default Hardhat ones.
