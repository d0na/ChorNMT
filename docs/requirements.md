# Requirements

What ChorNMT must demonstrate for the paper, how each claim is checked, and what the project deliberately does not do. The design choices behind these requirements are in [Design decisions](decisions.md).

## Claims

Each claim has acceptance criteria that point to evidence already produced by the tests or the evaluation. A claim holds when its evidence is produced and its checks pass; `npm test` (CI) and `npm run evaluate:all` produce all of it.

### C1. A choreography lives on-chain and is rebuilt from the chain

A BPMN choreography is stored in a mutable asset (`ChoreographyMutableAsset`) owned through an NMT (`ChoreographyNMT`). The BPMN XML is always a view: changes go to the asset, and the model is extracted from the chain and drawn again, before and after a change.

Acceptance criteria:

- `paper-example.bpmn` is imported into an asset (`import:asset`) and a delta is applied to it (`modify:asset`).
- The baseline and the modified BPMN XML are regenerated from the on-chain state through `tokenURI`, and drawn with chor-js as SVG/PNG (`evaluate:paper`, paper section of `evaluation/final-report.generated.md`).
- The CI importer step converts the reference BPMN models without errors.

### C2. Every change is decided by policies, at the right level

No state change bypasses the policies. The Master policy decides only NMT-level actions (`mint`, `mintWithInitialModel`, `transferFrom`, its own replacement). A change to the model of an asset (`setNodes`, `setRoles`, `setLinked`) is decided only by the Creator AND the Holder policy, both at the action check and at the domain check. Policies stand for XACML translations: their rules are hardcoded, and a rule change is a new policy.

Acceptance criteria:

- The trust table in [Choreography policies](choreography-policies.md#who-can-do-what), the cases of `scripts/test-policies.js`, and [Policy and test specification](policy-test-specification.md) agree.
- `test:policies` passes: every public mutator has at least one allowed and one denied case, and every denial is a reverted transaction.
- `evaluate:policies` reports the gas of every allowed and denied policy decision.

### C3. The Creator sets constraints the Holder cannot remove

The Creator policy defines the structural boundaries of the BPMN model (task and flow limits, allowed task names, known endpoints, protected nodes and roles, role license requirements). The Holder can only restrict further.

Acceptance criteria:

- `test:policies` denies every update outside the constraints of `CreatorSmartPolicyTestScenario` and the bypass attempts (holder replacing the Creator policy, unlinking a protected node through a neighbour).
- `evaluate:policies` applies the paper delta under `CreatorSmartPolicyPaperScenario` and reports the allowed and denied structural cases.

### C4. Roles are played by transferable participant licenses

A role is linked once to a license (`ParticipantMutableAsset`) of the type the Creator requires. The organization behind the role changes when the license is sold to a qualified organization, not through `setRoles`.

Acceptance criteria:

- `test:policies` covers license minting, linking, message declaration, and sale, with allowed and denied cases (see [Participant license design](participant-license-design.md)).
- `evaluate:policies` reports the Special Carrier license sale and its costs.

### H5. Cost hypothesis

The cost of the whole flow (deploy, mint, import, modify) is measured, and a delta update is expected to cost less than populating a fresh asset with the whole model, depending on the size of the delta. This is a hypothesis, confirmed or refuted by the measurements, not by this document.

Acceptance criteria:

- `evaluate:paper` reports the gas of deploy, import, and delta, the delta versus full population comparison, and the gas by number of changed nodes (`gas-by-changed-nodes`).
- Every contract change reports its gas before and after; an increase needs a stated reason (see [Contract structure](contract-structure.md#gas)).
- Every contract fits the EIP-170 and EIP-3860 limits (`check:size`, CI).

## Supporting features

Present in the code and tested, but not claims of the paper:

- `mintWithInitialModel`: mint and populate an asset in one transaction. It is kept for now; `evaluate:policies` compares its cost with mint + import.

## Non-goals

Out of scope by choice; do not add them:

- **Execution of the choreography.** The asset holds the model, not running instances: no task state, no message exchange at runtime.
- **The XACML to Solidity translator.** The policies are hand-written simulations of its output.
- **BPMN models other than `paper-example`.** `pizza-delivery` and `parallel-gateway-example` are development references only.
- **Deleting nodes.** Nodes are overwritten, never removed; a clean model needs a new asset.
- **A version registry.** The history of a model is the chain itself (see [Design decisions](decisions.md)).
- **Verifying the initial model** of `mintWithInitialModel` against a template hash: the authorized creator is trusted.
- **Production deployment.** No public networks, no security audit; accounts are the default Hardhat ones.
