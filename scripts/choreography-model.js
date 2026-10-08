import { AbiCoder, ZeroAddress, getBytes, hexlify } from "ethers";

// The model of a choreography type: an ABI-encoded ChoreographyMutableAsset.InitialModel stored
// as the code of a data-only contract (SSTORE2). ChoreographyNMT fixes its address at deploy, and
// every asset decodes it in its constructor. The encoding starts with a zero byte (STOP), so the
// contract cannot be executed.
const INITIAL_MODEL_TYPE =
  "tuple(string[],address[],string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])";
const EIP_170_LIMIT = 24_576;

// Roles keep only their names: each instance links its own accounts or licenses with setRoles.
export function modelFromDataset(dataset) {
  return {
    roleNames: dataset.roles,
    roleAddresses: dataset.roles.map(() => ZeroAddress),
    names: dataset.nodes.map((node) => node.name),
    nodeTypes: dataset.nodes.map((node) => node.nodeType),
    incoming: dataset.nodes.map((node) => node.incoming),
    outgoing: dataset.nodes.map((node) => node.outgoing),
    conditions: dataset.nodes.map((node) => node.conditions),
    initiatorRoles: dataset.nodes.map((node) => node.initiatorRole),
    participantRoles: dataset.nodes.map((node) => node.participantRole),
    initiatingMessages: dataset.nodes.map((node) => node.initiatingMessage),
    returnMessages: dataset.nodes.map((node) => node.returnMessage)
  };
}

export function encodeModel(model) {
  return AbiCoder.defaultAbiCoder().encode([INITIAL_MODEL_TYPE], [[
    model.roleNames,
    model.roleAddresses,
    model.names,
    model.nodeTypes,
    model.incoming,
    model.outgoing,
    model.conditions,
    model.initiatorRoles,
    model.participantRoles,
    model.initiatingMessages,
    model.returnMessages
  ]]);
}

// Creation code that returns the data as runtime code:
// PUSH2 size, DUP1, PUSH1 0x0a, RETURNDATASIZE, CODECOPY, RETURNDATASIZE, RETURN.
export function modelCreationCode(model) {
  const data = getBytes(encodeModel(model));
  if (data.length > EIP_170_LIMIT) {
    throw new Error(`The encoded model takes ${data.length} bytes, above the ${EIP_170_LIMIT}-byte contract size limit.`);
  }
  return `0x61${data.length.toString(16).padStart(4, "0")}80600a3d393df3${hexlify(data).slice(2)}`;
}

export async function deployChoreographyModel(signer, model) {
  const transaction = await signer.sendTransaction({ data: modelCreationCode(model) });
  const receipt = await transaction.wait();
  return { address: receipt.contractAddress, receipt };
}
