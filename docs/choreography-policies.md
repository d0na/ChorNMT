# Choreography Policies

`ChoreographyNMT` delegates master-level decisions to `MasterSmartPolicy` and instance-level decisions to the Creator and Holder policies passed at mint time.

For the full English policy model, structural-rule semantics, and automated
test mapping, see [Policy and Test Specification](policy-test-specification.md).

## Who can do what

The table is the intended trust model with the default policies. Every change to a policy contract must keep this table, the tests in `scripts/test-policies.js`, and the code in agreement.

| Action | Master administrator | Authorized creator | Holder | Creator policy administrator | Anyone else |
| --- | --- | --- | --- | --- | --- |
| Replace the Master policy of the NMT (`setMasterSmartPolicy`) | yes | no | no | no | no |
| `mint` an instance of the choreography type to an eligible holder | yes (an authorized creator) | yes | no | no | no |
| `transferFrom` to an eligible holder | no | no | yes | no | no |
| `setNodes` | no | no | yes, within the Creator BPMN constraints | no | no |
| `setRoles` | no | no | yes, a protected role only once, and within the Creator role constraints | no | no |
| `setLinked` | no | no | yes | no | no |
| Read `tokenURI` (metadata generated from the asset state) | yes | yes | yes | yes | yes |
| `setHolderSmartPolicy` | no | no | yes | no | no |
| `setCreatorSmartPolicy` | no | no | **no** | yes | no |
| Install a constrained Creator policy (BPMN limits, task allowlist, known endpoints, protected nodes and roles, role license requirements, known roles, distinct role accounts) with `setCreatorSmartPolicy` | no | no | no | yes | no |

Design decisions behind the table:

- Every policy is replaceable only with the approval of the policy it replaces: the Master by the current Master (its `administrator`), the Creator by the current Creator, the Holder by the holder. A replacement Master governs every later mint and transfer of the NMT; it cannot be the zero address.
- The Creator policy is a constraint the Holder cannot remove. `setCreatorSmartPolicy` is evaluated by the current Creator policy only, and the choreography `CreatorSmartPolicy` allows it only to its `administrator`.
- There is no version registry: the history of a choreography is the chain itself, the `setNodes`/`setRoles` transactions and the `NodesChanged`/`RolesChanged` events of its asset. Who governs transfers, whether the Creator policy stays replaceable, and how an instance is frozen are open questions (see [Design decisions](decisions.md#open-questions)).
- A `ChoreographyNMT` is one choreography type: its model is fixed at deploy, and every instance is born with it. The model is part of the type, so it is not checked by `evaluateNodeUpdate`; the constraints apply to every later `setNodes` and `setRoles`.
- A protected node is frozen together with its sequence flows: an update of another node cannot add or remove a link to it, in either `incoming` or `outgoing`, so a protected node cannot be disconnected through its neighbours.
- A protected role is assigned once: an instance is born with no account for it, and `setRoles` accepts an entry for it only while it has none. A role with a requirement can be linked only to a participant license (`ParticipantMutableAsset`) of the required type. The organization behind the role changes when the license is sold, not through `setRoles`: see [Role licenses](#role-licenses). Roles referenced by a protected task are not protected implicitly; protect them explicitly when their address must not change.
- Nodes are never deleted: a node with the same name is overwritten. Roles are currently name-to-address entries that can be overwritten but not removed; the target design identifies participants by `ParticipantMutableAsset` NFTs, which can be destroyed independently of the choreography.
- A transfer resets the Holder policy to zero. The new Holder must install a Holder policy with `setHolderSmartPolicy` before editing the model.
- NMT tokens are minted with `_mint`, not `_safeMint`, so no receiver callback runs before an asset is initialized.

## Master policy

The Master stands for a policy translated from XACML, so its configuration is hardcoded, not set at runtime: the administrator and only authorized creator is the authority (Hardhat account 0), and the eligible holders are the authority and its partner (accounts 0 and 1). A different rule is a different policy, installed with `setMasterSmartPolicy`.

- `mint(...)` requires an authorized creator and an eligible initial holder.
- `transferFrom(...)` requires the current holder as caller and an eligible receiving holder.

The Master works only at the NMT level: it never decides a change to the model of an asset, which is a Creator AND Holder decision.

## Choreography type

A `ChoreographyNMT` stands for one choreography, not for a generic container: another choreography is another NMT. Its model is the ABI-encoded `InitialModel` tuple (roles, then node names, types, edges, conditions, roles, and messages for every node) stored as the code of a data-only contract (SSTORE2), whose address the NMT fixes as an `immutable` at deploy. `mint(...)` deploys a `ChoreographyMutableAsset` that decodes the model in its constructor, so every instance is born with the model of the type, in the mint transaction.

The model keeps only the role names: every role is born with no account, and the holder links the accounts or licenses of its instance with `setRoles`, under the Creator AND Holder checks. Every later change is a delta through `setNodes` and `setRoles`; the model contract is never read again, and the instances of a type evolve independently. A different starting model is a different type: a new model contract and a new NMT. The encoded model must fit the contract size limit (24,576 bytes; the paper example takes 11,136).

## Cost benchmark

`npm run test:policies` and `npm run evaluate:policies` measure the type and its instances on Hardhat:

| Operation | Gas used |
| --- | ---: |
| Deploy the paper-example model contract (once per type) | 2,343,146 |
| Mint a paper-example instance, born with the model | 5,619,770 |
| Link its five role accounts (`setRoles`) | 198,112 |
| Mint a three-node test instance | 3,173,819 |

The values are reproducible local gas measurements, not public-network prices. Storage writes in the asset dominate the mint. In the same run, an allowed constrained update used 406,903 gas and structural deny paths used 138,930--176,730 gas.

## Instance policies

The default Creator and Holder policies both allow the current holder to update roles, nodes, and links. Token metadata is not stored: `tokenURI` is always generated from the current model. Their intersection is required for every such operation, so a Holder can further restrict an instance by replacing its Holder policy; `DenyAllSmartPolicy` is used in tests to demonstrate this restriction.

Replacing the Creator policy is not a Holder operation: only the Creator policy's administrator (Hardhat account 0) can do it.

## BPMN constraints in the Creator policy

The Creator policy also defines the structural boundaries for `setNodes(...)`; it is not a fourth policy type. Like every policy it stands for a policy translated from XACML, so its rules are hardcoded, not set at runtime; a different set of constraints is a different policy, installed with `setCreatorSmartPolicy` or passed at mint.

- `CreatorSmartPolicy`, the default, has no BPMN constraint: it rejects only malformed updates (array lengths that differ, empty or duplicate names).
- `ConstrainedCreatorSmartPolicy` (abstract) holds the constraint rules. Each scenario extends it and writes the data as literals: `CreatorSmartPolicyTestScenario` for the fixture of `scripts/test-policies.js` (4 tasks, 5 flows, allowed tasks `Delivery`, `Inspection`, `Packing`, `Labeling`, `Shipping`, protected node `Start`, protected role `Buyer`, `Carrier` requires a `SpecialCarrier` license, distinct role accounts) and `CreatorSmartPolicyPaperScenario` for the paper example (11 tasks, 15 flows, the evolved paper tasks plus two optional inspections, protected node `Order`, `Special Carrier` requires a `SpecialCarrier` license).
- `ChoreographyParticipantAM` is the attribute manager the constrained policies read role licenses from: it returns the type of a license minted by the participant NMT and certified by the participant Creator policy, both bound at its deploy, and zero for any other address. Which type a role requires stays in the Creator policy.

Before writing storage, the asset asks its Creator policy to evaluate the update. A constrained policy computes the post-update task count and total outgoing sequence-flow count, and rejects protected-node updates, task names outside the allowlist, incoming or outgoing flows whose endpoint does not already exist or appear in the same delta, and any change to the links of a protected node. `setRoles` is checked for protected roles that already have an account, new roles (only existing roles can be reassigned), addresses that are not a suitable license for a role with a requirement, and, when the scenario requires it, accounts that would play two roles.

The Holder policy remains an independent second approval, also for these domain checks: the asset asks `evaluateNodeUpdate` and `evaluateRoleUpdate` of the Creator AND the Holder policy (`IChoreographyPolicy`). A Holder can further restrict an instance by installing `DenyAllSmartPolicy`, without weakening the Creator-defined BPMN boundaries.

The Master policy is deployed before `ChoreographyNMT`. Its rules are hardcoded for Hardhat account 0 (authorized creator, administrator, and the default deployer of `deploy:asset`) and account 1 (eligible holder); another organization needs a different Master policy, installed with `setMasterSmartPolicy`.

Run `npm run test:policies` to execute allowed and denied paths for each policy category. The test reports the gas used and wei cost for both outcomes, including reverted transactions.

## Role licenses

A role is played by a license: a `ParticipantMutableAsset` minted by `ParticipantNMT`. The choreography links the role to the license once. The organization that plays the role is the license holder; it changes when the holder sells the license.

The participant policies stand for policies translated from XACML: their configuration is hardcoded, not set at runtime. The participant Master writes, for every license type (`SpecialCarrier`, `Carrier`, `Supplier`), its issuers and the organizations qualified to hold it; the certifier's Creator policy writes the messages each type may declare. Changing a rule means deploying a new policy and installing it (`setMasterSmartPolicy`, `setCreatorSmartPolicy`). The design is in [Participant license design](participant-license-design.md).

| Action | Authority (participant Master administrator, issuer) | Certifier (participant Creator policy administrator) | License holder | Buyer | Anyone else |
| --- | --- | --- | --- | --- | --- |
| Mint a license of a type (`mintWithParticipantType`) | yes, for the types it issues | no | no | no | no |
| Mint a license without a type (`mint`) | no | no | no | no | no |
| Replace the participant Master policy (`setMasterSmartPolicy` on `ParticipantNMT`) | yes | no | no | no | no |
| Replace the license Creator policy (`setCreatorSmartPolicy`) | no | yes | no | no | no |
| Change the license type | no | no | no | no | no |
| Sell the license (`transferFrom`) to an organization qualified for its type | no | no | yes | no | no |
| Update the organization data (`setName`, `setProfile`, `setLinked`) | no | no | yes, after installing a Holder policy | no | no |
| Declare messages (`setMessages`) allowed for the license type | no | no | yes, after installing a Holder policy | no | no |
| Any other action on the license | no | no | no | no | no |

Both participant policies deny by default: they allow only the actions listed above, so a new license function stays blocked until a policy assigns it explicitly; `test:policies` checks that every license mutator has an explicit decision. The type is an `immutable` of the license, set at mint, so a choreography that checked it when linking a role can rely on it forever. `setMessages` is a Creator AND Holder decision at both levels: the action check, and the domain check `evaluateMessagesUpdate`, where the certifier's policy rejects a message outside the vocabulary of the license type. A sale resets the license Holder policy and clears the seller's name and profile; the messages stay, with the address of the holder who wrote them. The new holder installs a Holder policy and then updates its own data; the former holder loses every right on the license. Qualifications are checked at the sale.

