# Choreography Policies

`ChoreographyNMT` delegates master-level decisions to `MasterSmartPolicy` and instance-level decisions to the Creator and Holder policies passed at mint time.

For the full English policy model, structural-rule semantics, and automated
test mapping, see [Policy and Test Specification](policy-test-specification.md).

## Master policy

The policy administrator configures authorized creators and eligible holders with `setAuthorizedCreator` and `setEligibleHolder`.

- `mint(...)` requires an authorized creator and an eligible initial holder.
- `transferFrom(...)` requires an enabled transfer policy, the current holder as caller, and an eligible receiving holder.
- `mintVersion(...)` requires enabled versioning, an eligible holder for the new instance, and either an authorized creator or the holder of the predecessor instance.

`setTransfersEnabled(false)` disables ownership transfers. `setVersioningEnabled(false)` disables new versions without changing existing instances or their history. `predecessorOf` and `versionOf` on `ChoreographyNMT` expose that history.

## Atomic initialization

`mintWithInitialModel(...)` receives the initial Holder, the two instance policies, and an `InitialModel` tuple:

- `roleNames` and `roleAddresses`;
- node names and node types;
- incoming and outgoing edges, conditions, roles, and messages for every node.

The array-length validation is the same as `setRoles(...)` and `setNodes(...)`. Initialization is callable only by `ChoreographyNMT`, happens in the mint transaction, and sets `initialized` to `true`. Existing mutation methods remain available until `freeze()` is called.

The Master policy authorizes the Creator and initial Holder but does not currently register or compare a BPMN/template hash. Use this route only when the authorized Creator is trusted to provide the selected model.

## Cost benchmark

`npm run test:policies` compares the same three-node model using both routes on Hardhat:

| Route | Gas used |
| --- | ---: |
| `mint` + `setRoles` + `setNodes` | 3,757,968 |
| `mintWithInitialModel` | 3,700,593 |
| Saving | 57,375 (1.53%) |

The values are reproducible local gas measurements, not public-network prices. Storage writes dominate both routes, so the saving is modest; atomic creation is the main operational advantage. In the same run, an allowed constrained update used 412,738 gas and structural deny paths used 143,798--163,789 gas.

## Instance policies

The default Creator and Holder policies both allow the current holder to update roles, nodes, token metadata, links, and the Creator policy. Their intersection is required for every mutable operation, so a Holder can further restrict an instance by replacing its Holder policy.

The defaults also permit `freeze()`. Once frozen, an instance rejects role, node, and token-URI updates permanently. Replacing the Holder policy remains available to the holder as an administrative action.

## BPMN constraints in the Creator policy

`CreatorSmartPolicy` also defines the structural boundaries for `setNodes(...)`; it is not a fourth policy type. Its administrator can configure:

- `setBpmnLimits(maxTasks, maxSequenceFlows)`;
- `setTaskNameAllowlistEnabled(...)` and `setAllowedTaskName(...)`;
- `setKnownFlowTargetsEnabled(...)`;
- `setProtectedNode(...)`.

Before writing storage, the asset asks its Creator policy to evaluate the post-update task count and total outgoing sequence-flow count. The policy rejects duplicate names in a delta, protected-node updates, task names outside an enabled allowlist, and outgoing flows whose target does not already exist or appear in the same delta.

The Holder policy remains an independent second approval. A Holder can further restrict an instance by installing `DenyAllSmartPolicy`, without weakening the Creator-defined BPMN boundaries.

The Master policy is deployed before `ChoreographyNMT`; `deploy:asset` creates a default configuration in which the deployer is both an authorized creator and an eligible holder. Configure additional organizations on the deployed Master policy before minting or transferring assets to them.

Run `npm run test:policies` to execute allowed and denied paths for each policy category. The test reports the gas used and wei cost for both outcomes, including reverted transactions.
