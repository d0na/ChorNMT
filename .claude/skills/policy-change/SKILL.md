---
name: policy-change
description: Change ChorNMT authorization or BPMN-constraint behavior (Master, Creator, Holder, Participant policies, or the permission checks in NMT/MutableAsset contracts) while keeping the trust table, the tests, and the specification in sync.
---

# Change a policy safely

The trust model lives in three places that must agree after every change:

1. `docs/choreography-policies.md` — the "Who can do what" table and design decisions.
2. `scripts/test-policies.js` — `expectAllowed` / `expectDenied` cases.
3. `docs/policy-test-specification.md` — semantics and test mapping.

## Steps

1. Read the relevant contract(s) in `contracts/choreography/` (or `contracts/participant/`) and the three files above. Identify which table rows the change affects.
2. Change the contract. Prefer putting logic in a policy contract: `ChoreographyNMT` embeds the asset bytecode and is close to the 24,576-byte limit.
3. Add or update test cases: for each new rule, at least one allowed and one denied case, including the bypass attempt (e.g. through versioning, a neighbour node edit, a transfer, or replacing the policy). Denials must revert, not run out of gas — `expectDenied` asserts that.
4. Update the table and the specification in the same change.
5. Verify:

```bash
npm run compile
npm run check:size
ETH_USD_PRICE=3000 npm test
```

   `check:size` fails above the EIP-170 limit and warns when a contract is within 1,024 bytes of it. Report the `ChoreographyNMT` runtime size if it grew, and update the figure in `docs/architettura.md` when it changes.
6. If the change affects gas meaningfully, mention that `evaluate:policies` numbers in reports will shift.

Commit as `feat:` / `fix:` with a message naming the rule enforced.
