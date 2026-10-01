# Choreography Policies

`ChoreographyNMT` delegates master-level decisions to `MasterSmartPolicy` and instance-level decisions to the Creator and Holder policies passed at mint time.

For the full English policy model, structural-rule semantics, and automated
test mapping, see [Policy and Test Specification](policy-test-specification.md).

## Who can do what

The table is the intended trust model with the default policies. Every change to a policy contract must keep this table, the tests in `scripts/test-policies.js`, and the code in agreement.

| Action | Master administrator | Authorized creator | Holder | Creator policy administrator | Anyone else |
| --- | --- | --- | --- | --- | --- |
| Configure creators, holders, and the transfer switch | yes | no | no | no | no |
| `mint` / `mintWithInitialModel` to an eligible holder | yes (registered as creator) | yes | no | no | no |
| `transferFrom` to an eligible holder, when enabled | no | no | yes | no | no |
| `setNodes` | no | no | yes, within the Creator BPMN constraints | no | no |
| `setRoles` (define roles, bind/rebind/clear participants) | no | no | yes, except protected roles; addresses must be empty or a `ParticipantMutableAsset` of the role category in the Holder allowlist | no | no |
| `setTokenURI`, `setLinked` | no | no | yes | no | no |
| `setHolderSmartPolicy` | no | no | yes | no | no |
| `setCreatorSmartPolicy` | no | no | **no** | yes | no |
| Configure BPMN constraints (`setBpmnLimits`, allowlist, known endpoints, consistent flows, protected nodes and roles, role categories) | no | no | no | yes | no |
| Allowlist participant assets for an asset (`setAllowedParticipant` in the Holder policy) | no | no | yes | no | no |

Design decisions behind the table:

- The Creator policy is a constraint the Holder cannot remove. `setCreatorSmartPolicy` is evaluated by the current Creator policy only, and the choreography `CreatorSmartPolicy` allows it only to its `administrator`.
- There is no application-level versioning. The model history is kept by the blockchain: every accepted change is a transaction on the asset and emits `ChoreographyInitialized`, `RolesChanged`, or `NodesChanged`.
- The initial model passed to `mintWithInitialModel` is trusted: it comes from an authorized creator and is not checked by `evaluateNodeUpdate`. The constraints apply to every later `setNodes`.
- A protected node is frozen together with its sequence flows: an update of another node cannot add or remove a link to it, in either `incoming` or `outgoing`, so a protected node cannot be disconnected through its neighbours.
- A choreography starts without participants: imported and initial roles have the zero address. Binding a `ParticipantMutableAsset` to a role is part of the choreography evolution and is done by the Holder with `setRoles`; the same call rebinds a role or clears it back to the zero address. The Master policy is not involved: it governs the token, not its evolution. The Creator policy sets a category per role (`setRoleCategory`) and always accepts only the zero address or a tokenized participant asset whose `descriptor` matches the role category (any participant asset when the role has no category); externally owned accounts and other contracts are rejected. The Holder policy accepts only participant assets the Holder has allowlisted for that asset (`setAllowedParticipant`); a new Holder starts with an empty list after a transfer. The category is self-declared by the participant asset, so the trust in a specific participant comes from the Holder's allowlist.
- A protected role keeps its address: `setRoles` rejects any entry for it. Roles referenced by a protected task are not protected implicitly; protect them explicitly when their address must not change.
- Nodes are never deleted: a node with the same name is overwritten. Roles are currently name-to-address entries that can be overwritten but not removed; the target design identifies participants by `ParticipantMutableAsset` NFTs, which can be destroyed independently of the choreography.
- A transfer resets the Holder policy to zero. The new Holder must install a Holder policy with `setHolderSmartPolicy` before editing the model.
- NMT tokens are minted with `_mint`, not `_safeMint`, so no receiver callback runs before an asset is initialized.

## Master policy

The policy administrator configures authorized creators and eligible holders with `setAuthorizedCreator` and `setEligibleHolder`.

- `mint(...)` requires an authorized creator and an eligible initial holder.
- `transferFrom(...)` requires an enabled transfer policy, the current holder as caller, and an eligible receiving holder.

`setTransfersEnabled(false)` disables ownership transfers.

## Atomic initialization

`mintWithInitialModel(...)` receives the initial Holder, the two instance policies, and an `InitialModel` tuple:

- `roleNames` (roles start without participants);
- node names and node types;
- incoming and outgoing edges, conditions, roles, and messages for every node.

The array-length validation is the same as `setRoles(...)` and `setNodes(...)`. Initialization is callable only by `ChoreographyNMT` and happens in the mint transaction. Subsequent mutations remain governed by the Creator and Holder policies.

The Master policy authorizes the Creator and initial Holder but does not currently register or compare a BPMN/template hash. Use this route only when the authorized Creator is trusted to provide the selected model.

## Cost benchmark

`npm run test:policies` compares the same three-node model using both routes on Hardhat:

| Route | Gas used |
| --- | ---: |
| `mint` + `setRoles` + `setNodes` | 3,726,949 |
| `mintWithInitialModel` | 3,624,234 |
| Saving | 102,715 (2.76%) |

The values are reproducible local gas measurements, not public-network prices. Storage writes dominate both routes, so the saving is modest; atomic creation is the main operational advantage. In the same run, an allowed constrained update used 424,731 gas and structural deny paths used 143,657--188,266 gas.

## Instance policies

The default Creator and Holder policies both allow the current holder to update roles, nodes, token metadata, and links. Their intersection is required for every such operation, so a Holder can further restrict an instance by replacing its Holder policy; `DenyAllSmartPolicy` is used in tests to demonstrate this restriction.

Replacing the Creator policy is not a Holder operation: only the Creator policy's administrator can do it.

## BPMN constraints in the Creator policy

`CreatorSmartPolicy` also defines the structural boundaries for `setNodes(...)`; it is not a fourth policy type. Its administrator can configure:

- `setBpmnLimits(maxTasks, maxSequenceFlows)`;
- `setTaskNameAllowlistEnabled(...)` and `setAllowedTaskName(...)`;
- `setKnownFlowTargetsEnabled(...)`;
- `setConsistentFlowsEnabled(...)`;
- `setProtectedNode(...)`;
- `setProtectedRole(...)`, evaluated by `evaluateRoleUpdate` on every `setRoles`;
- `setRoleCategory(...)`, the participant category required by a role.

Before writing storage, the asset asks its Creator policy to evaluate the post-update task count and total outgoing sequence-flow count. The policy rejects duplicate names in a delta, protected-node updates, task names outside an enabled allowlist, incoming or outgoing flows whose endpoint does not already exist or appear in the same delta, flows declared on only one endpoint when consistent flows are enabled, and any change to the links of a protected node. `setRoles` is checked the same way for empty or duplicate names, protected roles, and addresses that are neither zero nor a participant asset of the role category.

The Holder policy remains an independent second approval. A Holder can further restrict an instance by installing `DenyAllSmartPolicy`, without weakening the Creator-defined BPMN boundaries.

The Master policy is deployed before `ChoreographyNMT`; `deploy:asset` creates a default configuration in which the deployer is both an authorized creator and an eligible holder. Configure additional organizations on the deployed Master policy before minting or transferring assets to them.

Run `npm run test:policies` to execute allowed and denied paths for each policy category. The test reports the gas used and wei cost for both outcomes, including reverted transactions.
