# Choreography Policies

`ChoreographyNMT` delegates master-level decisions to `MasterSmartPolicy` and instance-level decisions to the Creator and Holder policies passed at mint time.

For the full English policy model, structural-rule semantics, and automated
test mapping, see [Policy and Test Specification](policy-test-specification.md).

## Who can do what

The table is the intended trust model with the default policies. Every change to a policy contract must keep this table, the tests in `scripts/test-policies.js`, and the code in agreement.

| Action | Master administrator | Authorized creator | Holder | Creator policy administrator | Anyone else |
| --- | --- | --- | --- | --- | --- |
| Configure creators, holders, transfer and versioning switches | yes | no | no | no | no |
| Replace the Master policy of the NMT (`setMasterSmartPolicy`) | yes | no | no | no | no |
| `mint` / `mintWithInitialModel` to an eligible holder | yes (registered as creator) | yes | no | no | no |
| `mintVersion` | yes (registered as creator) | yes, with any policies | yes, only keeping the predecessor's Creator policy | no | no |
| `transferFrom` to an eligible holder, when enabled | no | no | yes | no | no |
| `setNodes` | no | no | yes, within the Creator BPMN constraints | no | no |
| `setRoles` | no | no | yes, except protected roles and within the Creator role constraints | no | no |
| `setLinked` | no | no | yes | no | no |
| Read `tokenURI` (metadata generated from the asset state) | yes | yes | yes | yes | yes |
| `setHolderSmartPolicy` | no | no | yes | no | no |
| `setCreatorSmartPolicy` | no | no | **no** | yes | no |
| Configure BPMN and role constraints (`setBpmnLimits`, allowlist, known endpoints, protected nodes and roles, role license requirements, known roles, distinct role accounts) | no | no | no | yes | no |

Design decisions behind the table:

- Every policy is replaceable only with the approval of the policy it replaces: the Master by the current Master (its `administrator`), the Creator by the current Creator, the Holder by the holder. A replacement Master governs every later mint, version, and transfer of the NMT; it cannot be the zero address.
- The Creator policy is a constraint the Holder cannot remove. `setCreatorSmartPolicy` is evaluated by the current Creator policy only, and the choreography `CreatorSmartPolicy` allows it only to its `administrator`.
- A new version starts from an empty model; it does not copy nodes or roles from its predecessor. A Holder who is not an authorized creator must reuse the predecessor's Creator policy, so versioning cannot be used to escape the Creator constraints.
- The initial model passed to `mintWithInitialModel` is trusted: it comes from an authorized creator and is not checked by `evaluateNodeUpdate`. The constraints apply to every later `setNodes`.
- A protected node is frozen together with its sequence flows: an update of another node cannot add or remove a link to it, in either `incoming` or `outgoing`, so a protected node cannot be disconnected through its neighbours.
- A protected role keeps its address: `setRoles` rejects any entry for it. A role with a requirement can be linked only to a participant license (`ParticipantMutableAsset`) of the required type. The organization behind the role changes when the license is sold, not through `setRoles`: see [Role licenses](#role-licenses). Roles referenced by a protected task are not protected implicitly; protect them explicitly when their address must not change.
- Nodes are never deleted: a node with the same name is overwritten. Roles are currently name-to-address entries that can be overwritten but not removed; the target design identifies participants by `ParticipantMutableAsset` NFTs, which can be destroyed independently of the choreography.
- A transfer resets the Holder policy to zero. The new Holder must install a Holder policy with `setHolderSmartPolicy` before editing the model.
- NMT tokens are minted with `_mint`, not `_safeMint`, so no receiver callback runs before an asset is initialized and its version lineage is recorded.

## Master policy

The policy administrator configures authorized creators and eligible holders with `setAuthorizedCreator` and `setEligibleHolder`.

- `mint(...)` requires an authorized creator and an eligible initial holder.
- `transferFrom(...)` requires an enabled transfer policy, the current holder as caller, and an eligible receiving holder.
- `mintVersion(...)` requires enabled versioning, an eligible holder for the new instance, and either an authorized creator or the holder of the predecessor instance. A holder who is not an authorized creator must pass the predecessor's Creator policy.

`setTransfersEnabled(false)` disables ownership transfers. `setVersioningEnabled(false)` disables new versions without changing existing instances or their history. `predecessorOf` and `versionOf` on `ChoreographyNMT` expose that history.

## Atomic initialization

`mintWithInitialModel(...)` receives the initial Holder, the two instance policies, and an `InitialModel` tuple:

- `roleNames` and `roleAddresses`;
- node names and node types;
- incoming and outgoing edges, conditions, roles, and messages for every node.

The array-length validation is the same as `setRoles(...)` and `setNodes(...)`. Initialization is callable only by `ChoreographyNMT` and happens in the mint transaction. Subsequent mutations remain governed by the Creator and Holder policies.

The Master policy authorizes the Creator and initial Holder but does not currently register or compare a BPMN/template hash. Use this route only when the authorized Creator is trusted to provide the selected model.

## Cost benchmark

`npm run test:policies` compares the same three-node model using both routes on Hardhat:

| Route | Gas used |
| --- | ---: |
| `mint` + `setRoles` + `setNodes` | 3,756,233 |
| `mintWithInitialModel` | 3,664,473 |
| Saving | 91,760 (2.44%) |

The values are reproducible local gas measurements, not public-network prices. Storage writes dominate both routes, so the saving is modest; atomic creation is the main operational advantage. In the same run, an allowed constrained update used 424,218 gas and structural deny paths used 143,057--187,666 gas.

## Instance policies

The default Creator and Holder policies both allow the current holder to update roles, nodes, and links. Token metadata is not stored: `tokenURI` is always generated from the current model. Their intersection is required for every such operation, so a Holder can further restrict an instance by replacing its Holder policy; `DenyAllSmartPolicy` is used in tests to demonstrate this restriction.

Replacing the Creator policy is not a Holder operation: only the Creator policy's administrator can do it.

## BPMN constraints in the Creator policy

`CreatorSmartPolicy` also defines the structural boundaries for `setNodes(...)`; it is not a fourth policy type. Its administrator can configure:

- `setBpmnLimits(maxTasks, maxSequenceFlows)`;
- `setTaskNameAllowlistEnabled(...)` and `setAllowedTaskName(...)`;
- `setKnownFlowTargetsEnabled(...)`;
- `setProtectedNode(...)`;
- `setProtectedRole(...)`, evaluated by `evaluateRoleUpdate` on every `setRoles`;
- `setParticipantRegistry(participantNmt, certifier)` and `setRoleRequirement(role, type)`: the role can be linked only to a license minted by `participantNmt`, certified by the `certifier` participant Creator policy, of the required type;
- `setKnownRolesEnabled(...)`: `setRoles` can reassign existing roles but not create new ones;
- `setDistinctRoleAccountsEnabled(...)`: after the update, no account plays two roles.

Before writing storage, the asset asks its Creator policy to evaluate the post-update task count and total outgoing sequence-flow count. The policy rejects duplicate names in a delta, protected-node updates, task names outside an enabled allowlist, incoming or outgoing flows whose endpoint does not already exist or appear in the same delta, and any change to the links of a protected node. `setRoles` is checked the same way for empty or duplicate names, protected roles, new roles when known roles are enforced, addresses that are not a suitable license for a role with a requirement, and accounts that would play two roles.

The Holder policy remains an independent second approval. A Holder can further restrict an instance by installing `DenyAllSmartPolicy`, without weakening the Creator-defined BPMN boundaries.

The Master policy is deployed before `ChoreographyNMT`; `deploy:asset` creates a default configuration in which the deployer is both an authorized creator and an eligible holder. Configure additional organizations on the deployed Master policy before minting or transferring assets to them.

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

