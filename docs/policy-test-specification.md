# Choreography Policy and Test Specification

This document describes the policy model implemented by ChorNMT and the
evaluation cases exercised by the automated test and evaluation scripts. It is
intended to make the authorization boundaries, BPMN update constraints, and
measurement methodology explicit for readers of the implementation and the
experimental report.

## Scope and Policy Types

The system has exactly three choreography policy categories:

1. **Master policy** (`MasterSmartPolicy`) governs the lifecycle of the base
   choreography and its instances.
2. **Creator policy** (`CreatorSmartPolicy`) governs model-editing rights and
   structural BPMN constraints defined by the Creator.
3. **Holder policy** (`HolderSmartPolicy`) is the instance-holder approval
   layer and may further restrict permitted operations.

There is no separate constraint-policy category. BPMN structural validation is
part of the Creator policy because the Creator defines the editable model
boundaries. The Holder policy remains an independent second approval layer.

## Evaluation Order

Every mutable instance operation is evaluated by the Creator and Holder policy
layers inherited from `MutableAsset`. Both approvals are required. A positive
Creator decision therefore does not override a Holder denial.

For `setNodes(...)`, `ChoreographyMutableAsset` performs the following checks
in order:

1. The regular Creator and Holder policy evaluations must permit the action.
2. The current Creator policy evaluates the submitted BPMN node update against
   its structural configuration.
3. Only then are the changed node records written to contract storage.

A rejected transaction reverts. It still consumes gas because the authorization
and, where applicable, structural checks execute before the revert.

## Master Policy

The Master policy is administered by its deployer. It maintains allowlists and
two lifecycle switches.

| Control | Configuration method | Enforced action | Expected effect |
| --- | --- | --- | --- |
| Authorized Creator | `setAuthorizedCreator(address, bool)` | `mint`, `mintWithInitialModel`, `mintVersion` | Only approved organizations can create instances. |
| Eligible Holder | `setEligibleHolder(address, bool)` | mint, transfer, version mint | An instance can only be assigned to an approved Holder. |
| Transfer switch | `setTransfersEnabled(bool)` | `transferFrom` | Disables ownership transfer without deleting the instance. |
| Version switch | `setVersioningEnabled(bool)` | `mintVersion` | Prevents creation of additional versions while retaining history. |

`ChoreographyNMT` records version lineage through `predecessorOf(tokenId)` and
`versionOf(tokenId)`. A version may be created by an authorized Creator or by
the Holder of the predecessor, provided that Master-policy conditions hold. A
Holder who is not an authorized Creator must keep the predecessor's Creator
policy. A new version starts from an empty model.

## Creator Policy

The Creator policy has two responsibilities: ordinary edit authorization and
optional BPMN structural governance. Its administrator configures the latter
and is the only party allowed to replace the Creator policy of an instance;
the Holder cannot remove the constraints it is subject to.
All structural controls are opt-in by default, except that limits are set to
the maximum unsigned value until configured.

### Structural Controls

| Control | Configuration method | Rule evaluated for a `setNodes` update |
| --- | --- | --- |
| Task limit | `setBpmnLimits(maxTasks, maxSequenceFlows)` | The post-update model cannot contain more task nodes than `maxTasks`. |
| Flow limit | `setBpmnLimits(maxTasks, maxSequenceFlows)` | The post-update model cannot contain more outgoing sequence flows than `maxSequenceFlows`. |
| Task-name allowlist | `setTaskNameAllowlistEnabled(bool)`, `setAllowedTaskName(name, bool)` | When enabled, every changed task name must be approved. |
| Known flow target | `setKnownFlowTargetsEnabled(bool)` | When enabled, each outgoing target must exist already or be present in the same update. |
| Protected node | `setProtectedNode(name, bool)` | A protected node cannot be changed by `setNodes`. |

The implementation also rejects duplicate node names in the same submitted
delta. Counts are computed over the effective post-update model: existing node
records are considered, then changed nodes replace records with the same name
or add new records.

### Example: Paper Example Delta

The policy lifecycle evaluation imports `references/paper-example.bpmn` and
uses `paper-example-parallel-transport-preparation.delta.json`. The permitted
delta adds the `Prepare Transport Documentation` task and introduces a parallel
split/join before the waybill. The evaluation configures limits for the evolved
model, allowlists its task names, enables known-target validation, and protects
`Order`.

The permitted delta is followed by denials for:

- a new task exceeding the evolved task limit;
- an extra sequence flow exceeding the evolved flow limit;
- a task outside the name allowlist;
- a flow pointing to an unknown BPMN node; and
- a modification of the protected `Order` node.

## Holder Policy Restrictions

The Holder policy is evaluated together with the Creator policy. It allows the
Holder to adopt a stricter local rule without weakening Creator constraints. In
the tests, the Holder installs `DenyAllSmartPolicy`; a later model update is
then denied even though the Creator policy would otherwise allow it.

The model has no permanent freeze flag. A Holder who needs to block changes
installs a stricter Holder policy; this preserves the option to later replace
that policy under the Holder's administrative authority. The tests demonstrate
this behavior by installing `DenyAllSmartPolicy` and rejecting a later model
update.

## Atomic Initialization and Cost Comparison

Two initialization strategies are measured:

1. `mint(...)`, followed by `setRoles(...)` and `setNodes(...)`.
2. `mintWithInitialModel(...)`, which stores the same initial model inside the
   mint transaction.

Atomic initialization removes two post-mint transactions but does not remove
the dominant storage writes. It is primarily an atomicity and operational
simplicity improvement; the report records the measured gas difference rather
than assuming a universal saving.

## Automated Evidence

| Command | Model | Evidence produced |
| --- | --- | --- |
| `npm run test:policies` | Small deterministic fixture | Complete Master/Creator/Holder allow-deny matrix, restrictive Holder policy, transfer, versioning, attempts to bypass the Creator policy, and receipt gas/wei. The script exits with an error if any case has an unexpected outcome. |
| `npm run evaluate:policies` | Imported `paper-example` plus real delta | Empty versus populated mint, paper-model structural allow/deny cases, and scenario costs. |
| `npm run evaluate:paper` | Imported `paper-example` plus real delta | Import/render/delta/full-population measurements, chor-js BPMN images, and gnuplot charts. |
| `npm run evaluate:all` | All of the above | Rebuilds the canonical final report. |

The generated `evaluation/final-report.generated.md` embeds the paper workflow,
policy lifecycle evaluation, and policy integration test matrix. The on-chain
cost tables report gas, the local receipt cost in wei where available, and
estimated USD costs at 10, 30, and 100 gwei. ETH/USD is fetched automatically
unless a fixed `ETH_USD_PRICE` value is supplied for reproducibility.

## Reproducing the Evidence

```bash
# Terminal 1
npm run start:operations

# Terminal 2
ETH_USD_PRICE=3000 npm run evaluate:all
```

Open `evaluation/final-report.generated.md` after completion. The fixed price
is optional; omit it to use the current ETH/USD spot price when available.
