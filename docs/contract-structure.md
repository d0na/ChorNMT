# Contract structure standard

This page fixes the internal structure that every ChorNMT contract must follow: what state it holds, which functions are public, which are internal or private, and in what order they appear. It applies to both domains, `choreography/` and `participant/`, and to any new domain built on `contracts/base/`.

Two goals drive every rule: **policy-checked mutability** (no state change bypasses the Master, Creator, and Holder policies) and **minimum total cost** of the whole flow (deploy, mint, import, modify, render). When two structures are equally safe, choose the cheaper one, and prove it with measured gas (see [Gas](#gas)).

The rules are derived from the current code. Where the code does not follow them yet, the deviation is listed in [Known deviations](#known-deviations); new code must follow the rules, not the deviations.

## Contract kinds

Every contract belongs to exactly one kind:

| Kind | Base | Choreography | Participant | Role |
| --- | --- | --- | --- | --- |
| Token | `NMT` | `ChoreographyNMT` | `ParticipantNMT` | ERC-721 that deploys and owns one asset per token. |
| Asset | `MutableAsset` | `ChoreographyMutableAsset` | `ParticipantMutableAsset` | Holds the domain model; every mutation is policy-checked. |
| Master policy | `SmartPolicy` | `MasterSmartPolicy` | `ParticipantMasterSmartPolicy` | Decides token-level actions: mint, transfer, versions. |
| Creator policy | `SmartPolicy` | `CreatorSmartPolicy` | `participant/CreatorSmartPolicy` | Constraint the holder cannot remove; domain rules. |
| Holder policy | `SmartPolicy` | `HolderSmartPolicy` | `participant/HolderSmartPolicy` | Second approval chosen by the holder. |
| Renderer | none | `ChoreographyTokenURIRenderer` | — | Stateless; builds `tokenURI` from asset views. |
| Interface | none | `IChoreographyCreatorPolicy` | — | Cross-contract calls only go through interfaces. |

A domain is complete when it has one Token, one Asset, and the three policies. Helpers that do not fit a kind (e.g. `DenyAllSmartPolicy`) are policies.

## Layout of every contract file

The order follows the Solidity style guide:

1. `// SPDX-License-Identifier: MIT`, `pragma solidity ^0.8.20;`
2. Imports: OpenZeppelin, then `../base/`, then same-domain files.
3. File-level interfaces used only by this contract (prefer a shared interface file, see [Interfaces](#interfaces)).
4. Contract body, in this order:
   1. type declarations: `enum`, then `struct`;
   2. `constant`s (selectors first);
   3. `immutable`s;
   4. other state variables;
   5. events;
   6. custom errors, if used;
   7. modifiers;
   8. constructor;
   9. `external` / `public` state-changing functions;
   10. `external` / `public` `view` / `pure` functions;
   11. `internal` functions;
   12. `private` functions.

## Naming

| Element | Rule | Example |
| --- | --- | --- |
| Internal/private function | `_camelCase` | `_setNodes`, `_addressAt` |
| State variable (any visibility) | `camelCase`, no underscore | `descriptor`, `roleRequirements` |
| Constant | `UPPER_SNAKE_CASE` | `SET_NODES`, `RUNTIME_LIMIT` |
| Selector constant | the function name in `UPPER_SNAKE_CASE` | `MINT_VERSION` for `mintVersion(...)` |
| Constructor parameter | `<name>Address` for addresses | `masterSmartPolicyAddress` |
| Setter parameter that shadows a state variable | `<name>Value` | `participantTypeValue` |
| Event | `<Thing>Changed`, or a past-tense verb for one-off facts | `NodesChanged`, `ChoreographyInitialized` |
| View | `get<Thing>`, `get<Thing>Names`, `has<Thing>`, `is<Condition>` | `getRole`, `hasNode`, `isQualifiedFor` |
| Policy switch | `<feature>Enabled`, set by `set<Feature>Enabled(bool)` | `transfersEnabled` |
| Policy modifier | `evaluatedBy<Layer>` / `only<Actor>` | `evaluatedByMaster`, `onlyHolder` |

## Token (`NMT`)

**State**

- `address public masterSmartPolicy`, declared in the base `NMT` — required, non-zero, checked in the base constructor (`NMT(masterSmartPolicyAddress)`). It is storage, not `immutable`, because it is replaceable: `setMasterSmartPolicy(address)` is `evaluatedByMaster` with the current Master, rejects the zero address, and emits `MasterSmartPolicyChanged`. Concrete Tokens do not redeclare it.
- Other immutables for stateless collaborators (e.g. `tokenURIRenderer`), non-zero.
- Token-level bookkeeping only (e.g. `predecessorOf`, `versionOf`). Never domain data: that lives in the asset.

**Public functions**

- `mint(to, creatorSmartPolicy, holderSmartPolicy)` is defined once in the base `NMT`, `evaluatedByMaster(abi.encodeWithSignature("mint(address,address,address)", ...), address(this))`.
- Every other minting entry point (`mintVersion`, `mintWith…`) is `evaluatedByMaster` with its exact signature, then calls the internal `_mint`.
- `transferFrom(from, to, tokenId)` is defined once in the base `NMT`: `evaluatedByMaster(abi.encodeWithSignature("transferFrom(address,address)", from, to), getMutableAssetAddress(tokenId))`, then the asset's Creator check, then the ERC-721 transfer.
- `tokenURI(tokenId)` calls `_requireOwned(tokenId)`, then delegates: to the renderer, or to the asset.

**Internal functions**

- `_mint(to, creatorSmartPolicy, holderSmartPolicy) internal override returns (address, uint256)`: deploys the asset with `new`, sets `tokenId = uint160(asset)`, and calls ERC-721 `_mint` — never `_safeMint`, so no external callback runs before the asset is initialized.

**Modifier**

- `evaluatedByMaster(bytes action, address resource)`, declared in the base `NMT`: reverts with `OperationDenied(MASTER)` unless `SmartPolicy(masterSmartPolicy).evaluate(msg.sender, action, resource)`. The resource is `address(this)` for token-wide actions and the asset address for actions on one token.

**Size and cost budget**: a Token embeds the full Asset bytecode, and every mint pays to deploy it. Keep Token and Asset logic minimal; run `npm run check:size`, and see candidate G1 in [Gas](#gas).

## Asset (`MutableAsset`)

**Inherited state** (do not redeclare): `nmt` (immutable), `linked`, `creatorSmartPolicy`, `holderSmartPolicy`.

**Domain state**

- All domain state is `private`: a single `Descriptor` struct, or a few private variables. It is exposed only through explicit views, never through automatic getters of structs or arrays.
- Collections keyed by name use three parts: `mapping(string => T) <thing>sByName`, `mapping(string => bool) has<Thing>`, `string[] <thing>Names`. Names are never removed from the list.

**Public state-changing functions**

Every mutator has the same shape:

```solidity
function setThing(T calldata value)
    external
    evaluatedBySmartPolicies(
        msg.sender,
        msg.data, // byte-identical to abi.encodeWithSignature("setThing(<abi types>)", value)
        address(this)
    )
{
    _evaluateThingUpdate(value); // optional domain check: Creator AND Holder
    _setThing(value);
}

function _evaluateThingUpdate(T calldata value) private view {
    if (!IDomainPolicy(creatorSmartPolicy).evaluateThingUpdate(address(this), value)) {
        revert OperationDenied(CREATOR);
    }
    if (!IDomainPolicy(holderSmartPolicy).evaluateThingUpdate(address(this), value)) {
        revert OperationDenied(HOLDER);
    }
}
```

- **Every decision is an AND of Creator and Holder.** This holds at both levels:
  1. the action check, `evaluatedBySmartPolicies`: Creator `evaluate` AND Holder `evaluate` (a zero Holder policy denies);
  2. the domain check (e.g. BPMN structure, role constraints): Creator `evaluate<Thing>Update` AND Holder `evaluate<Thing>Update`, through the same domain interface.
  The Creator sets the outer bounds the holder cannot remove; the Holder can only restrict further. Neither approval can override a denial by the other.
- Single-layer checks are exceptions, allowed only where the trust table in `docs/choreography-policies.md` requires them, and each must be listed there:
  - `evaluatedByCreator` only: `setCreatorSmartPolicy` (the holder must not escape the Creator constraint), certified data the holder must not set (`setParticipantType`, `setCapabilities`), and the asset side of `transferFrom` (the Holder policy is reset by the transfer);
  - `onlyHolder` only: `setHolderSmartPolicy`.
- The action passed to the policies is `msg.data` (see [Gas](#gas)). The policies' selector constants use the exact canonical signature, with enums as `uint8` and structs as tuples. Until G2 is applied, existing mutators re-encode with `abi.encodeWithSignature` and the same signature string.
- No logic between the policy check and the private setter, except the domain check.
- One-shot initialization by the Token is a separate function guarded by `onlyNMT` that calls the same private setters (trusted path; no policy evaluation).

**Public view functions**

- `get<Thing>(name)`, `get<Thing>Names()`, `has<Thing>(name)` for every keyed collection.
- Narrow views needed by policies (e.g. `getNodeTypeAndEdges`), to keep policy calls cheap.
- `tokenURI()` returns `NMT(nmt).tokenURI(uint160(address(this)))`: metadata is computed, never stored.

**Private functions**

- `_set<Thing>(...)`: validates array lengths and empty names, writes storage, and emits `<Thing>Changed`. This is the only place that writes domain storage.
- `_evaluate<Thing>Update(...)`: adapts arguments for the domain policy interface (e.g. enum → `uint8`) and asks the Creator, then the Holder; reverts with the layer that denied.

**Events**: every private setter emits exactly one event naming what changed.

## Policies (`SmartPolicy`)

**State**

- Selector constants: `bytes4 private constant NAME = bytes4(keccak256("<canonical signature>"))`, one per action the policy recognizes.
- `address public immutable administrator` for configurable policies; set from the constructor (Master policies take it as a parameter, Creator policies use `msg.sender`).
- Configuration as `public` state: switches (`<feature>Enabled`), allow-lists (`mapping(address => bool)` or `mapping(bytes32 => bool)` keyed by `keccak256(bytes(name))`), limits. Structured configuration is `private` with an explicit `get…` view.

**Public functions**

- Configuration setters: `external onlyAdministrator`, one concern each.
- `evaluate(subject, action, resource) public view override returns (bool)`:
  1. `bytes4 signature = decodeSignature(action);`
  2. one `if (signature == X)` branch per recognized action, returning the decision;
  3. `return false;` at the end — **default deny** for unrecognized actions.
- Domain evaluations (`evaluateNodeUpdate`, `evaluateRoleUpdate`) are `view`, declared in a domain interface, return `false` instead of reverting, and never write state. **Both** the Creator and the Holder policy of a domain implement the domain interface (a permissive Holder returns `true`; `DenyAllSmartPolicy` returns `false`), since the asset asks both.
- Views exposing derived decisions: `is<Condition>` (e.g. `isQualifiedFor`).
- Master policies recognize `setMasterSmartPolicy(address)` and decide who may replace them (the default policies: their `administrator`).

**Private functions**: calldata decoding (`_addressAt(action, offset)`, which reverts on malformed input) and rule helpers (`_isDuplicate`, `_containsName`, …).

**Modifier**: `onlyAdministrator`, reverting with `CallerNotAdministrator()`.

## Renderer

- No state, no constructor arguments, no access control.
- `external view` entry point (`tokenURI(address asset)`) and `public view` building blocks (`metadata`); every other function is `private`.
- Reads the asset only through its view interface.

## Interfaces

- Cross-contract calls go through an interface, never through a concrete contract import, except for the Token deploying its own Asset.
- Each asset kind declares the views other contracts may use in one shared interface, and the asset declares `is` that interface so the compiler checks that views and interface agree:
  - `base/IMutableAsset.sol`: `nmt`, `linked`, `creatorSmartPolicy`, `holderSmartPolicy`, `getHolder`; implemented by `MutableAsset`;
  - `choreography/IChoreographyAsset.sol`: node and role views and `tokenURI`, plus the `NodeType` enum; implemented by `ChoreographyMutableAsset`;
  - `participant/IParticipantAsset.sol`: `participantType`, `getCapabilities`, `hasCapability`, `getMessages`; implemented by `ParticipantMutableAsset`.
- Policies and renderers type their calls with these interfaces (`IMutableAsset(resource).getHolder()`), not with the concrete asset contracts. A view a policy needs is added to the interface first.
- Shared enums used across contracts live in the interface (e.g. `IChoreographyAsset.NodeType`).
- Domain policy extensions live in their own file and are layer-neutral, because both Creator and Holder implement them (target: rename `IChoreographyCreatorPolicy` to `IChoreographyPolicy`).

## Errors and checks

- New code uses **custom errors** (`error OperationDenied(uint8 layer);`, `error CallerNotHolder();`, `error InvalidAddress();`, `error ArraySizeMismatch();`, `error NameRequired();`) with `if (!condition) revert Error();`. They are cheaper to deploy and to revert than `require` strings, and the Token embeds the Asset bytecode, so every string counts twice.
- Errors shared by a kind are declared once in its base (`MutableAsset`, `NMT`, `SmartPolicy`).
- Constructors reject the zero address for every required collaborator.
- Every allow and deny path of a public mutator is covered in `scripts/test-policies.js`. The tests check revert status, not revert messages, so switching to custom errors does not change them.

## Gas

The cost of the whole flow is measured, not estimated: `npm test` and `npm run evaluate:policies` print receipt-derived gas for deploy, mint, `setRoles`, `setNodes`, and policy allow/deny cases; `evaluate:paper` covers import and delta. Rules:

**Measure every change.** Record gas before and after (same `ETH_USD_PRICE`, same inputs) for the operations the change touches, and report the difference. A change that makes the flow more expensive needs a stated reason (e.g. a security rule).

**Never trade safety for gas.** An optimization must keep every allow/deny outcome in `scripts/test-policies.js` unchanged.

**Structural rules**

- Public mutators that only the outside world calls are `external` with `calldata` parameters; `memory` only where the function is also called internally.
- Pass `msg.data` to the policies as the action instead of re-encoding the arguments with `abi.encodeWithSignature`: for an external call they are byte-identical, and re-encoding large arrays (e.g. in `setNodes`) is paid on every call. The selector constants in the policies stay the contract between asset and policy.
- Policy `evaluate` and domain evaluations read only what they need: the selector and, at fixed offsets, the static arguments. Do not decode dynamic arrays a decision does not use.
- Keep loops over storage in the contract that owns the storage; avoid one external call per element (e.g. counting all nodes from a policy on every update). Prefer counters maintained by the private setters when a policy needs totals.
- Read a storage value once into a local variable when it is used more than once; use `immutable` / `constant` for anything fixed at deploy time.
- Pack related small fields (`bool`, `uint8`, `address`) next to each other so they share a slot.
- Emit events with the minimum data an off-chain reader needs; do not emit full arrays already readable through views.
- `view` functions used only off-chain (render) may be expensive; functions called during a transaction (policy checks, setters) may not.
- The Creator AND Holder domain check costs a second external call per mutator. Keep it cheap: a Holder domain evaluation with no configured constraint must return without reading the asset. Never skip the call to save gas.

**Optimization candidates** (not yet applied; each needs a measured before/after):

| # | Change | Affected cost | Expected effect |
| --- | --- | --- | --- |
| G1 | Deploy assets as EIP-1167 minimal-proxy clones of one implementation, with an `initialize` guarded by `onlyNMT`, instead of `new`. | Every mint; Token size. | Mint drops from a full asset deployment to a clone plus initialization; the Token no longer embeds the Asset bytecode, which removes the 24 KB constraint. Requires replacing `immutable nmt` and the constructor with initializer state. |
| G2 | Use `msg.data` as the policy action in asset mutators. | `setNodes`, `setRoles`. | Removes re-encoding of every array argument on each call. Safe only while the policies read the selector or fixed-offset static arguments: a caller can send non-canonical ABI encoding, so a policy that decodes dynamic arguments from the action must use `abi.decode`, not offsets. |
| G3 | `external` + `calldata` for `setNodes`, `setRoles`, `mint…`. | Same. | Avoids copying arguments to memory. |
| G4 | Custom errors instead of `require` strings. | Deploy of Token/Asset, every revert. | Smaller bytecode; cheaper denied cases. |
| G5 | Keep task and sequence-flow counters in the asset, updated by `_setNodes`, and expose them to the Creator policy. | `setNodes` with a configured Creator policy. | Replaces the O(N) `_currentCounts` scan of external calls. |
| G6 | Copy `incoming`/`outgoing`/`conditions` arrays with a single assignment where the compiler supports it, instead of `delete` + `push` loops. | `setNodes`, import. | Fewer storage-length writes; measure first. |
| G7 | Emit `NodesChanged`/`RolesChanged` with counts or hashes instead of full name arrays. | `setNodes`, `setRoles`. | Smaller log data cost. Check off-chain consumers first. |
| G8 | Tune optimizer `runs` for the flow's call pattern (deploy-heavy vs. call-heavy). | All. | Lower `runs` favours deployment, higher favours calls; pick from measurements. |

## Known deviations

Resolved: 7 (shared asset interfaces) and 10 (default-deny participant policies). The current code differs from the rules above in these places. Fix them in dedicated changes, with tests and `check:size`:

| # | Contract | Deviation | Rule |
| --- | --- | --- | --- |
| 1 | `ParticipantMutableAsset` | `string public tokenURI` is stored and set by `setTokenURI`. | Asset: metadata computed via `NMT(nmt).tokenURI(...)`. |
| 2 | `ParticipantMutableAsset` | `participantDescriptor` is `public` and also has `getParticipantDescriptor()`; `participantType` is public outside the descriptor. | Asset: domain state private, explicit views only. |
| 3 | `ParticipantMutableAsset` | Mutators write storage inline; no `_set…` private setters; `StateChanged` names no field. | Asset: one private setter per thing, one `<Thing>Changed` event. |
| 4 | `ParticipantNMT` | `tokenURI` does not call `_requireOwned`. | Token: `_requireOwned` before delegating. |
| 5 | `MutableAsset` | Modifiers declared after the functions. | Layout: modifiers before the constructor. |
| 6 | `CreatorSmartPolicy` (choreography) | `struct RoleRequirement` declared after state variables; `uint8 private constant TASK = 2` duplicates the asset's `NodeType` enum. | Layout: types first; one source for node types. |
| 8 | `MasterSmartPolicy`, `ParticipantMasterSmartPolicy` | `_addressAt` and `onlyAdministrator` are duplicated. | Candidate for a shared base policy. |
| 9 | `CreatorSmartPolicy` (choreography) | Switches named `enforce<Feature>` next to Master's `<feature>Enabled`. | Naming: `<feature>Enabled`. |
| 11 | All contracts | `require` with string messages. | Errors: custom errors (G4). |
| 12 | Both Assets | Mutators are `public` with `memory` parameters and re-encode arguments for the policies. | Gas: `external` + `calldata`, `msg.data` as action (G2, G3). |
| 13 | `ChoreographyMutableAsset`, `HolderSmartPolicy`, `IChoreographyCreatorPolicy` | The domain checks (`evaluateNodeUpdate`, `evaluateRoleUpdate`) are asked of the Creator policy only; the Holder policy does not implement the domain interface, whose name is Creator-specific. | Asset: domain check is Creator AND Holder; layer-neutral `IChoreographyPolicy`. |
