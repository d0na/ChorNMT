import { Contract, JsonRpcProvider, Wallet } from "ethers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PARALLEL_GATEWAY_EXAMPLE_CHOREOGRAPHY } from "./data/parallel-gateway-example.js";
import { PIZZA_DELIVERY_CHOREOGRAPHY } from "./data/pizza-delivery.js";
import { reportTotalCost, reportTransactionCost } from "./transaction-cost.js";

const __filename = fileURLToPath(import.meta.url);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DATASETS = {
  "parallel-gateway-example": PARALLEL_GATEWAY_EXAMPLE_CHOREOGRAPHY,
  "pizza-delivery": PIZZA_DELIVERY_CHOREOGRAPHY
};

const CHOREOGRAPHY_MUTABLE_ASSET_ABI = [
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
      { internalType: "enum ChoreographyMutableAsset.NodeType[]", name: "nodeTypes", type: "uint8[]" },
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

export function resolveDataset(datasetName = process.env.CHOREOGRAPHY_DATASET || "pizza-delivery") {
  const dataset = DATASETS[datasetName];

  if (!dataset) {
    throw new Error(`Unknown choreography dataset "${datasetName}". Available datasets: ${Object.keys(DATASETS).join(", ")}`);
  }

  return { datasetName, dataset };
}

export async function populateDataset(assetAddress, dataset, datasetName = "custom") {
  if (!assetAddress) {
    throw new Error("An asset address is required.");
  }

  if (!dataset || !Array.isArray(dataset.roles) || !Array.isArray(dataset.nodes)) {
    throw new Error('Dataset must contain "roles" and "nodes" arrays.');
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const contract = new Contract(assetAddress, CHOREOGRAPHY_MUTABLE_ASSET_ABI, signer);
  const accounts = await provider.send("eth_accounts", []);
  let nonce = await provider.getTransactionCount(signer.address, "latest");

  const roleAddresses = buildRoleAddresses(accounts, dataset.roles);
  const nodePayload = buildNodePayload(dataset.nodes);

  const setRolesTx = await contract.setRoles(dataset.roles, roleAddresses, {
    nonce
  });
  const setRolesReceipt = await setRolesTx.wait();
  nonce += 1;

  const setNodesTx = await contract.setNodes(
    nodePayload.names,
    nodePayload.nodeTypes,
    nodePayload.incoming,
    nodePayload.outgoing,
    nodePayload.conditions,
    nodePayload.initiatorRoles,
    nodePayload.participantRoles,
    nodePayload.initiatingMessages,
    nodePayload.returnMessages,
    {
      nonce
    }
  );
  const setNodesReceipt = await setNodesTx.wait();

  console.log(`Populated ChoreographyMutableAsset at: ${assetAddress}`);
  console.log(`Dataset: ${datasetName}`);
  reportTotalCost([
    reportTransactionCost("setRoles", setRolesReceipt),
    reportTransactionCost("setNodes", setNodesReceipt)
  ]);

  return { contractAddress: assetAddress, datasetName, roles: dataset.roles };
}

export async function populateContract(assetAddress, datasetName) {
  if (!assetAddress) {
    throw new Error("An asset address is required. Usage: npm run populate:local -- <asset-address> [dataset]");
  }

  const { dataset, datasetName: resolvedDatasetName } = resolveDataset(datasetName);
  return populateDataset(assetAddress, dataset, resolvedDatasetName);
}

async function main() {
  const contractAddress = process.argv[2];
  const datasetName = process.argv[3];
  await populateContract(contractAddress, datasetName);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
