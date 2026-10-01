# ParticipantMutableAsset

[contracts/participant/ParticipantMutableAsset.sol](../contracts/participant/ParticipantMutableAsset.sol) represents one choreography participant, for example the organization that plays `Special Carrier` in the `paper-example`. Each instance is minted by `ParticipantNMT`, which owns its ERC-721 token (token ID = `uint160(asset address)`). It extends [`MutableAsset`](../contracts/base/MutableAsset.sol). See [Architettura](architettura.md#identità-dei-partecipanti) for how participants are bound to choreography roles.

## Fields

### Inherited from `MutableAsset`

| Field | Type | Description |
| --- | --- | --- |
| `nmt` | `address` (immutable, public) | The `ParticipantNMT` that minted the asset. The choreography Creator policy reads it to check that the asset is tokenized. |
| `linked` | `address` (public) | Optional link; set with `setLinked`. |
| `tokenURI` | `string` (public) | Token metadata URI, returned by `ParticipantNMT.tokenURI`. |
| `creatorSmartPolicy` | `address` (public) | Creator policy. |
| `holderSmartPolicy` | `address` (public) | Holder policy; reset to zero by a transfer. |

### `ParticipantDescriptor`

Stored in the public `participantDescriptor`.

| Field | Type | Description |
| --- | --- | --- |
| `name` | `bytes32` | Compact participant name. |
| `bpmn` | `string` | Textual BPMN representation of the participant. |
| `descriptor` | `bytes32` | Participant category, for example `"CARRIER"` (`encodeBytes32String`). A choreography role with category `CARRIER` accepts only participant assets with this descriptor. |
| `messages` | `bytes32[]` | Message identifiers. |

## Events

| Event | Emitted by | Content |
| --- | --- | --- |
| `StateChanged(ParticipantDescriptor participantDescriptorValue)` | `setName`, `setDescriptor`, `setBpmn`, `setMessages` | The full descriptor after the change. |

## Write methods

All write methods except `setHolderSmartPolicy` pass through `evaluatedBySmartPolicies` (Creator policy, Holder policy set, Holder policy). The participant policies allow only the current holder of the participant token.

| Method | Effect |
| --- | --- |
| `setName(bytes32 nameValue)` | Sets `name`. |
| `setDescriptor(bytes32 descriptorValue)` | Sets `descriptor`, the participant category. Changing it can make the asset unacceptable for roles that require the previous category; an existing binding is not re-checked. |
| `setBpmn(string bpmn)` | Sets `bpmn`. |
| `setMessages(bytes32[] messages)` | Replaces `messages`. |
| `setTokenURI(string uri)` | Sets `tokenURI`. |
| `setLinked(address linkedNmt)` | Sets `linked` (inherited). |
| `setHolderSmartPolicy(address)` | `onlyHolder` (inherited); replaces the Holder policy. |
| `setCreatorSmartPolicy(address)` | Evaluated by the current Creator policy only (inherited). The participant `CreatorSmartPolicy` denies it to everyone, so the Creator policy of a participant asset cannot be replaced. |
| `transferFrom(address from, address to)` | `onlyNMT` (inherited); called by `ParticipantNMT.transferFrom`, allowed when `from` is the holder, and resets `holderSmartPolicy` to zero. `ParticipantNMT` has no Master policy. |

## Read methods

| Method | Returns |
| --- | --- |
| `getParticipantDescriptor()` | The full `ParticipantDescriptor`, including `messages`. |
| `participantDescriptor()` | Automatic getter: `name`, `bpmn`, and `descriptor` (Solidity omits the `messages` array). |
| `getDescriptor()` | `descriptor` only; used by the choreography Creator policy to check the role category. |
| `getMessages()` | `messages`. |
| `getHolder()` | Current owner of the participant token (inherited). |

## Use in a choreography

```bash
npm run mint:participant -- CARRIER                                            # mints and calls setDescriptor
npm run set:role-category -- <asset-address> "Special Carrier" CARRIER
npm run assign:participant -- <asset-address> "Special Carrier" <participant-address>
```

When binding it to a role, the choreography Creator policy checks that the address has code, that `ParticipantNMT(nmt()).ownerOf(uint160(address))` exists, and that `getDescriptor()` equals the role category. These are values the participant asset reports about itself; the Holder's allowlist decides which specific participants are trusted.
