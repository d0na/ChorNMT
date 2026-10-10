# Choreography Policy and Test Specification

This document describes the policy model implemented by ChorNMT and the
cases exercised by the automated test and experiment scripts. It is intended to
make the authorization boundaries, BPMN update constraints, and measurement
methodology explicit for readers of the implementation and of the
[experiment protocol](experiment.md).

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
2. The current Creator policy and then the current Holder policy evaluate the
   submitted BPMN node update (`evaluateNodeUpdate` of `IChoreographyPolicy`);
   `setRoles(...)` does the same with `evaluateRoleUpdate`. The default Holder
   policy adds no constraint; `DenyAllSmartPolicy` denies.
3. Only then are the changed node records written to contract storage.

A rejected transaction reverts. It still consumes gas because the authorization
and, where applicable, structural checks execute before the revert.

## Master Policy

The Master policy is hardcoded, as a policy translated from XACML would be:
its rules are literals in the source, and a different rule is a different
policy installed with `setMasterSmartPolicy`. Accounts are default Hardhat
accounts.

| Control | Hardcoded rule | Enforced action | Expected effect |
| --- | --- | --- | --- |
| Administrator | account 0 | `setMasterSmartPolicy` | Only the authority replaces the Master. |
| Authorized Creator | account 0 | `mint` | Only approved organizations can create instances. |
| Eligible Holder | accounts 0 and 1 | mint, transfer | An instance can only be assigned to an approved Holder. |
| Master replacement | `setMasterSmartPolicy(address)` on the NMT, allowed by the current Master to its administrator | every later NMT action | The new Master governs every later mint and transfer; the zero address is rejected. |

Both NMTs inherit the Master policy from the base `NMT`. The tests check that a
Holder cannot replace it, that the administrator cannot remove it, and that
after a replacement the new Master decides: a mint the old Master allowed is
denied by `DenyAllSmartPolicy`, and so is a license sale to a buyer qualified only under the old
participant Master.

`ChoreographyNMT` keeps no version registry: the history of a model is the
chain itself, the `setNodes`/`setRoles` transactions and the
`NodesChanged`/`RolesChanged` events of its asset. The tests check that the
`ChoreographyInitialized` event names the model of the type and that the
`NodesChanged` events reproduce the sequence of accepted node updates, and they
check a transfer to an eligible Holder (allowed) and to an ineligible one
(denied), and `setLinked`, which the default Creator and Holder policies allow
to the Holder only (allowed for the Holder, denied for another account).

## Creator Policy

The Creator policy has two responsibilities: ordinary edit authorization and
optional BPMN structural governance. Its rules are hardcoded, as a policy
translated from XACML would be. The default `CreatorSmartPolicy` has no
structural constraint beyond well-formed updates; the constraints live in
`ConstrainedCreatorSmartPolicy`, whose scenario policies
(`CreatorSmartPolicyTestScenario`, `CreatorSmartPolicyPaperScenario`) write
the data as literals. The administrator (Hardhat account 0) is the only party
allowed to replace the Creator policy of an instance; the Holder cannot remove
the constraints it is subject to.

### Structural Controls

| Control | Test scenario | Paper scenario | Rule evaluated |
| --- | --- | --- | --- |
| Task limit | 4 | 11 | `setNodes`: the post-update model cannot contain more task nodes. |
| Flow limit | 5 | 15 | `setNodes`: the post-update model cannot contain more outgoing sequence flows. |
| Task-name allowlist | `Delivery`, `Inspection`, `Packing`, `Labeling`, `Shipping` | the 10 evolved paper tasks, `Optional Customs Inspection`, `Optional Quality Inspection` | `setNodes`: every changed task name must be approved. |
| Known flow endpoint | always | always | `setNodes`: each `incoming` source and `outgoing` target must exist already or be present in the same update. |
| Consistent flows | always (also the default Creator policy) | always | `setNodes`: in the post-update model every flow is declared on both endpoints, `B` in `A.outgoing` if and only if `A` in `B.incoming`; a delta that changes a flow carries both endpoints. |
| Protected node | `Start` | `Order` | `setNodes`: a protected node cannot be changed, and no other node may add or remove a sequence flow to or from it. |
| Protected role | `Buyer` | none | `setRoles`: a protected role is assigned once, while it has no account, and cannot be reassigned. |
| Role license requirement | `Carrier` → `SpecialCarrier` | `Special Carrier` → `SpecialCarrier` | `setRoles`: the role can be linked only to a license whose type, read from `ChoreographyParticipantAM`, is the required one: minted by the participant NMT and certified by the participant Creator policy bound to the attribute manager. |
| Known roles | always | always | `setRoles`: only existing roles can be reassigned; new roles are rejected. |
| Distinct role accounts | yes | no | `setRoles`: after the update, no account plays two roles. |

The implementation also rejects duplicate node names in the same submitted
delta. The denied test updates are well formed (the default Creator policy
accepts them), so each one is denied by the constraint it names; a flow to or
from an unknown node, and a new or removed link to a protected node, are also
one-sided and denied by both rules. Counts are computed over the effective post-update model: existing node
records are considered, then changed nodes replace records with the same name
or add new records.

### Example: Paper Example Delta

The experiment imports `references/paper-example.bpmn` into the model of a
choreography type and deploys `CreatorSmartPolicyPaperScenario` (phase F1),
mints an instance born with that Creator policy (phase F2; the Creator policy
is never replaced), and applies
`paper-example-parallel-transport-preparation.delta.json` (phase F5). The
permitted delta adds the `Prepare Transport Documentation` task and introduces
a parallel split/join before the waybill. It is checked against limits one
above the evolved model, the allowlist of its task names, known targets, and
the protected `Order`.

The permitted delta is followed by denials for:

- two new approved tasks exceeding the task limit;
- two extra sequence flows exceeding the flow limit;
- a task outside the name allowlist;
- a flow pointing to an unknown BPMN node; and
- a modification of the protected `Order` node.

### Example: Special Carrier License Sale

The experiment then (phase F6) changes the organization that plays `Special
Carrier`. The role is played by a license, a `ParticipantMutableAsset`; the
choreography links the role to the license once, and the organization changes
when Carrier A sells the license to Carrier B. The role, its tasks, and every
node stay unchanged.

The authority is the participant Master administrator, the issuer of every
license type, and the certifier. The participant policies are hardcoded, as
policies translated from XACML would be: Carrier A and Carrier B (Hardhat
accounts 5 and 6) are qualified for `SpecialCarrier` and `Carrier`, Carrier C
(account 7) for `Carrier` only, and the Supplier company (account 8) for
`Supplier`; the authority is account 9. The authority mints the `Special
Carrier` license to Carrier A with type `SpecialCarrier`, fixed at mint. The
certifier's policy allows a `SpecialCarrier` license to declare the messages
of the Special Carrier tasks of the paper example, including the one added by
the delta.

| Case | Expected outcome | Rule |
| --- | --- | --- |
| Link the role to a plain account | denied | The role requires a license. |
| Link the role to a `Carrier` license | denied | Wrong license type. |
| Link the role to a `Supplier` license | denied | Wrong license type. |
| Link the role to the Special Carrier license | allowed | The license meets the requirement. |
| Create a `Backup Carrier` role | denied | Only existing roles can be reassigned. |
| Carrier A declares the Special Carrier messages | allowed | Every message is allowed for `SpecialCarrier`. |
| Carrier A declares a message of another role | denied | The certifier's policy rejects it (`evaluateMessagesUpdate`). |
| Sell the license to Carrier C | denied | Carrier C is not qualified for `SpecialCarrier`. |
| Sell the license to the Supplier company | denied | Not qualified for `SpecialCarrier`. |
| Carrier B takes the license by itself | denied | Only the holder sells. |
| Carrier A sells the license to Carrier B | allowed | Carrier B is qualified; the sale clears name and profile and keeps the messages, written by Carrier A. |
| Carrier B updates the license before installing a Holder policy | denied | The sale reset the Holder policy. |
| Carrier A installs a Holder policy on the sold license | denied | Not a policy decision: only the current holder installs one (`CallerNotHolder`); covered by `test:policies`. |
| Carrier B installs its Holder policy, then updates its name and profile | allowed | Carrier B is the holder. |
| Carrier A updates the license after the sale | denied | Carrier A is no longer the holder. |
| Carrier B confirms the messages | allowed | The messages are now written by the current holder. |

After the sale the experiment checks that the license belongs to Carrier B,
that `getRole("Special Carrier")` still returns the license, that every task
of the role still references it, and that the messages survived the sale with
Carrier A as writer. `npm run test:policies` covers the same rules on the
small fixture, plus an unauthorized issuer, a mint without a type, a license
certified by an untrusted policy, an account playing two roles, the computed
license `tokenURI` before and after the sale, and the replacement of the
participant Master policy.

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

## Choreography Types and Instances

A `ChoreographyNMT` is one choreography type: its model is fixed at deploy in a
data-only contract (SSTORE2), and `mint(...)` creates an asset born with that
model. The tests deploy one type per fixture model (the three-node fixture, a
model with escaped names, and a model with a licensed `Carrier` role) and
check that a minted instance returns the model of its type through `tokenURI`.
Roles are born with no account: the tests link them with `setRoles` before the
role constraints are exercised, and the first assignment of the protected
`Buyer` is allowed while a later one is denied. The experiment records the
cost of the model contract (once per type) and of each mint.

## Automated Evidence

| Command | Model | Evidence produced |
| --- | --- | --- |
| `npm run test:policies` | Small deterministic fixture | Complete Master/Creator/Holder allow-deny matrix, restrictive Holder policy, transfer, `setLinked`, event-based model history, Master policy replacement, attempts to bypass the Creator policy, and receipt gas/wei. The script exits with an error if any case has an unexpected outcome. |
| `npm run evidence:update` | Imported `paper-example` plus real delta | The experiment, phases F1–F8 of `scripts/experiment/phases.js`: model contract and instance mint, Master denials, the licenses and the Special Carrier link with its Creator denials, the baseline render, the paper delta with five structural denials, the Special Carrier license sale with its denials, a transfer and a Holder restriction, the final render, and the delta versus a new instance; every transaction checked against its expected outcome and trust-table row, with call traces, sequence diagrams, charts, chor-js BPMN drawings, and the `test:policies` matrix (`evaluation/evidence/`). |
| `npm run check:evidence` | Same | Reruns the experiment and fails if its evidence differs from the versioned one. |

The tables of [`docs/experiment.md`](experiment.md) are generated from the evidence: per
phase, the actors, the transactions with outcome, revert reason, trust-table
row, gas, wei, and estimated USD costs at 10, 30, and 100 gwei (ETH/USD fixed
by `ETH_USD_PRICE`, 3000 by default), the policies in force, and the sequence
diagram; then the test matrix.

## Reproducing the Evidence

```bash
npm run evidence:update    # no local node needed
npm run check:evidence
```

Open `docs/experiment.md` after completion; the setup and the other runs are in
the [evaluation toolkit](../evaluation/README.md).
