import { Contract, JsonRpcProvider, Wallet } from "ethers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PIZZA_DELIVERY_CHOREOGRAPHY } from "./data/pizza-delivery.js";

const __filename = fileURLToPath(import.meta.url);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const BPMN_CHOREOGRAPHY_ABI = [
  {
    inputs: [
      { internalType: "string[]", name: "roleNames", type: "string[]" },
      { internalType: "address[]", name: "addresses", type: "address[]" }
    ],
    name: "setRoles",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string[]", name: "names", type: "string[]" },
      { internalType: "enum BPMNChoreography.NodeType[]", name: "nodeTypes", type: "uint8[]" },
      { internalType: "string[][]", name: "incoming", type: "string[][]" },
      { internalType: "string[][]", name: "outgoing", type: "string[][]" },
      { internalType: "string[][]", name: "conditions", type: "string[][]" },
      { internalType: "string[]", name: "initiatorRoles", type: "string[]" },
      { internalType: "string[]", name: "participantRoles", type: "string[]" },
      { internalType: "string[]", name: "initiatingMessages", type: "string[]" },
      { internalType: "string[]", name: "returnMessages", type: "string[]" }
    ],
    name: "setNodes",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

function buildRoleAddresses(accounts, roles) {
  if (accounts.length < roles.length + 1) {
    throw new Error("Not enough local accounts to assign choreography roles.");
  }

  return roles.map((_, index) => accounts[index + 1]);
}

function buildNodePayload(nodes) {
  return {
    names: nodes.map((node) => node.name),
    nodeTypes: nodes.map((node) => node.nodeType),
    incoming: nodes.map((node) => node.incoming),
    outgoing: nodes.map((node) => node.outgoing),
    conditions: nodes.map((node) => node.conditions),
    initiatorRoles: nodes.map((node) => node.initiatorRole),
    participantRoles: nodes.map((node) => node.participantRole),
    initiatingMessages: nodes.map((node) => node.initiatingMessage),
    returnMessages: nodes.map((node) => node.returnMessage)
  };
}

export async function populateContract(contractAddress) {
  if (!contractAddress) {
    throw new Error("A contract address is required. Usage: npm run populate:local -- <contract-address>");
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const contract = new Contract(contractAddress, BPMN_CHOREOGRAPHY_ABI, signer);
  const accounts = await provider.send("eth_accounts", []);

  const roleAddresses = buildRoleAddresses(accounts, PIZZA_DELIVERY_CHOREOGRAPHY.roles);
  const nodePayload = buildNodePayload(PIZZA_DELIVERY_CHOREOGRAPHY.nodes);

  const setRolesTx = await contract.setRoles(PIZZA_DELIVERY_CHOREOGRAPHY.roles, roleAddresses);
  await setRolesTx.wait();

  const setNodesTx = await contract.setNodes(
    nodePayload.names,
    nodePayload.nodeTypes,
    nodePayload.incoming,
    nodePayload.outgoing,
    nodePayload.conditions,
    nodePayload.initiatorRoles,
    nodePayload.participantRoles,
    nodePayload.initiatingMessages,
    nodePayload.returnMessages
  );
  await setNodesTx.wait();

  console.log(`Populated BPMNChoreography at: ${contractAddress}`);

  return { contractAddress, roles: PIZZA_DELIVERY_CHOREOGRAPHY.roles };
}

async function main() {
  const contractAddress = process.argv[2];
  await populateContract(contractAddress);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
