# Future improvements

Ideas worth doing later, with the reasoning and the estimates behind them. Nothing here is implemented. An idea moves out of this page when it is applied (record the measured numbers in [Contract structure](contract-structure.md#gas) and, for a design change, a decision in [Design decisions](decisions.md)) or rejected (say why here).

Estimates are paper-and-pencil: they come from measured totals on the current code (`ETH_USD_PRICE=3000`, `npm test`, and the experiment evidence of `evaluation/evidence/`) and from EVM gas rules, not from an implementation. Measure before deciding.

## G1: assets as EIP-1167 clones

*Status: estimated, not implemented. Candidate G1 in [Contract structure](contract-structure.md#gas).*

**Today.** `ChoreographyNMT._mint` runs `new ChoreographyMutableAsset(...)`: every mint deploys a complete copy of the asset (11,055 bytes of runtime code), and the NMT embeds the asset bytecode to be able to create it, which is why `ChoreographyNMT` takes 21,440 of the 24,576 bytes allowed.

**Idea.** Deploy the asset once as an implementation; every mint creates an EIP-1167 clone, a 45-byte proxy that forwards every call to the implementation with `delegatecall`. The implementation can be shared by every choreography type.

**What changes in the contracts.**

- `nmt`, an `immutable` of the asset today, becomes storage.
- The initialization from the model contract moves from the constructor to an `initialize(model)` callable once, by the NMT only, and guarded against a second call.
- `ChoreographyNMT` no longer embeds the asset bytecode, so the 24 KB constraint on Token + Asset disappears.
- It changes how an instance is born from the model contract (D13), so it needs its own design round before an implementation.

### Estimated effect on a mint

| Part of the paper mint (5,619,770 gas measured) | Today (`new`) | With a clone |
| --- | ---: | ---: |
| Code deposit of the asset (11,055 bytes × 200 gas) | ≈ 2,211,000 | ≈ 9,000 (45 bytes) |
| Model writes from the model contract, policies, ERC-721 | ≈ 3,400,000 | ≈ 3,400,000 (unchanged) |
| Clone overhead (`nmt` in storage, initialize flag, `delegatecall`) | — | ≈ +25,000–45,000 |
| **Estimated total** | **5.62 M** | **≈ 3.45–3.47 M** |

The mint saves about 2.15 M gas, **about −38%**; a whole instance (mint + `setRoles`, 5.82 M) saves **about −37%**.

### Estimated effect on deploy and calls

- **Deploy of a type.** `ChoreographyNMT` would drop from about 4.8 M to about 1.8 M gas, since it no longer embeds the asset. The implementation costs about 2.3–2.4 M once, shared by every type. Net: about −0.6 M (−6%) for the first type, about −3 M for every further type.
- **Calls on an instance.** Every call goes through the proxy: about +2,600 gas the first time in a transaction, then about +100. On the paper delta (1.87 M) that is a few thousand gas, **+0.2–0.3%**. The render (`tokenURI`) is a free `eth_call`.

### Estimated effect on the paper flow

The whole flow (deploy of the type, first instance, delta) costs about 17.9 M gas today.

| Scenario | Estimated saving |
| --- | ---: |
| First instance, whole flow | ≈ −2.8 M (**−15%**) |
| Every further instance | ≈ −2.15 M (**−37%**) |
| Ten instances of the same type | ≈ −22 M out of ≈ 60 M (**≈ −36%**) |

### Uncertainties

- **The initialization weighs more than the deposit.** About 3.4 M of the mint are storage writes of the model, which G1 does not touch. Lowering them needs a different idea (see below).
- **The proxy overhead** depends on how many times the policies call the asset within one `setNodes`. The flow-consistency rule (D15) added calls, but they are warm, so the overhead should stay small.

### How to measure

Implement a minimal version in a separate worktree, then run `npm test` and `npm run check:evidence` and compare gas per row, as for the other candidates (`gas-optimization` skill). Keep it only if the whole-flow total drops and every allow/deny outcome is unchanged.

## Instances that read unchanged nodes from the model contract

*Status: idea, not estimated.*

The largest part of a mint (about 3.4 M gas for the paper example) is copying the model contract into the storage of the asset. An instance could instead read from the model contract every node it has not overwritten, and store only the nodes changed by a delta. A mint would then cost little more than the asset creation, at the price of more complex reads (asset storage first, then the model contract) for the renderer and the policies. It interacts with G1 and with the flow-consistency rule (D15), which reads neighbour nodes on every update.
