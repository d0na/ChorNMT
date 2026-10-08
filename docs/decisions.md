# Design decisions

The decisions that shape ChorNMT, why they were taken, and the questions still open. The requirements they serve are in [Requirements](requirements.md); the contract rules that apply them are in [Contract structure](contract-structure.md). A new decision, or a change to one, is recorded here in the same commit as the code.

Each entry: the decision, why, and what it implies.

## Model

**D1. The BPMN XML is a view of the asset.** The on-chain asset is the source of truth; changes go through a JSON delta and `setNodes`/`setRoles`, never through the XML. *Why:* the research question is a choreography governed on-chain; an editable XML would be a second source of truth. *Implies:* the BPMN is always regenerated from `tokenURI`; the exported XML is never edited.

**D2. Identity by name, nodes never deleted.** Nodes and roles are keyed by name; BPMN IDs are not stored. A node is overwritten, never removed, and an asset never clears its name lists. *Why:* names are stable across import, delta, and render, and storage removal adds code to an asset close to the size limit. *Implies:* a delta carries whole nodes in their final state, both endpoints of a changed edge; a clean model needs a new asset.

**D3. `tokenURI` is computed, never stored.** A stateless renderer builds the metadata from the asset state in one call. *Why:* stored metadata would drift from the model and cost storage on every change. *Implies:* render reads the whole model in one `tokenURI` call; the renderer lives outside the asset to keep `ChoreographyNMT` under the size limit.

**D4. No version registry (2026-10-08).** `mintVersion`, `predecessorOf`, and `versionOf` were removed. *Why:* the chain already keeps the history of a model: the `setNodes`/`setRoles` transactions and the `NodesChanged`/`RolesChanged` events of its asset. *Implies:* a past state is read from the events, or by querying the asset at an earlier block.

**D13. A `ChoreographyNMT` is one choreography type (2026-10-08).** Its model is fixed at deploy: the ABI-encoded `InitialModel` stored as the code of a data-only contract (SSTORE2), whose address the NMT keeps as an `immutable`. `mint` takes no model; `_mint` deploys an asset that decodes the model in its constructor, so every instance is born with it. `mintWithInitialModel` and the empty mint were removed. *Why:* an NMT identifies one choreography, not a generic container; keeping the model outside the NMT avoids the bytecode limit (the NMT embeds the asset), and the caller cannot pass a different model. *Implies:* another choreography, or another starting model, is another NMT; the model contract is read only at birth, and every later change is a delta on the asset; the model must fit 24,576 bytes; the model is part of the type, so it is not checked by the policies. Deploying a type costs the model contract once (2,343,146 gas for the paper example), and each paper instance costs about 310,000 gas less than an empty mint plus import.

**D14. Roles are born without accounts (2026-10-08).** The model keeps only the role names; each instance links its accounts or licenses with `setRoles`. *Why:* who plays a role is a decision of the instance and must pass the Creator AND Holder checks, licenses included. *Implies:* a protected role is assigned once: `setRoles` accepts it only while it has no account.

## Policies

**D5. Policies stand for XACML translations (2026-10-06).** Rules and their configuration are literals in the policy source, tuned to the test and evaluation scenarios; there are no runtime setters. *Why:* the contribution is the XACML to smart-policy translation, and XACML policies carry no mutable configuration; literals are also the cheapest form. *Implies:* a rule change is a new policy, installed through the policy it replaces; rule variants are separate policy contracts.

**D6. Creator AND Holder on every asset decision (2026-10-06).** Both policies approve every change to an asset, at the action check (`evaluate`) and at the domain check (`evaluateNodeUpdate`, `evaluateRoleUpdate`). *Why:* the Creator sets the outer bounds and the Holder can only restrict further; neither approval can override a denial by the other. *Implies:* a second external call per mutator, kept cheap by a permissive Holder that reads nothing.

**D7. The Master decides only at the NMT level (2026-10-08).** It governs `mint`, `transferFrom`, and its own replacement, never a change to a model. `MasterSmartPolicyFrozen` was removed. *Why:* a model change is an instance decision (D6). *Implies:* freezing an instance is not a Master feature (see the open questions).

**D8. Default deny (2026-10-06).** Every policy allows an explicit list of actions and returns `false` otherwise. *Why:* a new function must stay blocked until a policy assigns it. *Implies:* `test:policies` checks that every mutator has an explicit decision.

**D9. Roles are played by participant licenses.** A role is linked once to a `ParticipantMutableAsset` of the required type; the organization changes when the license is sold. *Why:* who plays a role is a transferable right with its own policies, not an address the choreography holder rewrites. *Implies:* the license type is an `immutable` set at mint; the Creator policy reads it through `ChoreographyParticipantAM`.

## Contracts and cost

**D10. Minimum total gas (2026-10-06).** The cost of the whole flow (deploy, mint, import, modify) is kept as low as is safe, and every contract change reports gas before and after. *Why:* costs are reported in the paper evaluation. *Implies:* an optimization never changes an allow/deny outcome.

**D11. One shared view interface per asset kind (2026-10-06).** The asset implements it (`is`); policies and renderers call through it. *Why:* the compiler checks that views and interface agree, instead of ad-hoc partial interfaces.

**D12. Mint with `_mint`, not `_safeMint`.** *Why:* no receiver callback may run before the asset is initialized.

## Open questions

Not decided yet; the current behavior stays until they are:

- **Who governs transfers.** Today `transferFrom` is decided by the Master (current holder, eligible receiver) and then by the Creator policy of the asset. It may move to another layer.
- **Whether the Creator policy stays replaceable.** Today its administrator replaces it with `setCreatorSmartPolicy`; Creator rules may become fixed for the life of an instance, and the function may be removed.
- **How an instance is frozen.** Not supported today. A Creator variant that denies model changes and that its administrator can replace was considered; it depends on the two questions above.
