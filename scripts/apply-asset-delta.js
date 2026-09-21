import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { renderAssetToBpmn } from "./render-local-support.js";

const __filename = fileURLToPath(import.meta.url);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
}

function validateNode(node, index) {
  if (!node || typeof node !== "object") {
    throw new Error(`nodes[${index}] must be an object.`);
  }
  requireString(node.name, `nodes[${index}].name`);
  if (!Number.isInteger(node.nodeType) || node.nodeType < 0 || node.nodeType > 7) {
    throw new Error(`nodes[${index}].nodeType must be an integer between 0 and 7.`);
  }
  ["incoming", "outgoing", "conditions"].forEach((field) => requireStringArray(node[field], `nodes[${index}].${field}`));
  ["initiatorRole", "participantRole", "initiatingMessage", "returnMessage"].forEach((field) => {
    if (typeof node[field] !== "string") {
      throw new Error(`nodes[${index}].${field} must be a string.`);
    }
  });
}

function nodePayload(nodes) {
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

function validateDelta(delta) {
  if (!delta || typeof delta !== "object" || !Array.isArray(delta.nodes) || delta.nodes.length === 0) {
    throw new Error('Delta must contain a non-empty "nodes" array.');
  }
  delta.nodes.forEach(validateNode);
  if (!delta.render || typeof delta.render !== "object") {
    throw new Error('Delta must contain "render" metadata for BPMN generation.');
  }
  ["choreographyId", "choreographyName", "definitionsId", "targetNamespace", "outputBaseName"].forEach((field) =>
    requireString(delta.render[field], `render.${field}`)
  );
  if (delta.roles !== undefined) {
    if (typeof delta.roles !== "object" || Array.isArray(delta.roles) || delta.roles === null) {
      throw new Error("roles must be an object mapping role names to addresses.");
    }
    Object.entries(delta.roles).forEach(([role, address]) => {
      requireString(role, "roles key");
      if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new Error(`roles.${role} must be an Ethereum address.`);
      }
    });
  }
}

export async function applyAssetDelta(assetAddress, deltaPath) {
  if (!assetAddress || !deltaPath) {
    throw new Error("Usage: npm run apply:asset-delta -- <asset-address> <delta.json>");
  }
  const resolvedDeltaPath = path.resolve(process.cwd(), deltaPath);
  const delta = JSON.parse(await fs.readFile(resolvedDeltaPath, "utf8"));
  validateDelta(delta);

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const asset = new Contract(assetAddress, CHOREOGRAPHY_MUTABLE_ASSET_ABI, signer);
  if (delta.roles && Object.keys(delta.roles).length > 0) {
    const roleTransaction = await asset.setRoles(Object.keys(delta.roles), Object.values(delta.roles));
    await roleTransaction.wait();
  }
  const payload = nodePayload(delta.nodes);
  const transaction = await asset.setNodes(
    payload.names,
    payload.nodeTypes,
    payload.incoming,
    payload.outgoing,
    payload.conditions,
    payload.initiatorRoles,
    payload.participantRoles,
    payload.initiatingMessages,
    payload.returnMessages
  );
  await transaction.wait();

  const artifacts = await renderAssetToBpmn({ assetAddress, ...delta.render });
  return { delta, resolvedDeltaPath, ...artifacts };
}

async function main() {
  const result = await applyAssetDelta(process.argv[2], process.argv[3]);
  console.log(`Applied delta: ${result.resolvedDeltaPath}`);
  console.log(`Updated nodes: ${result.delta.nodes.map((node) => node.name).join(", ")}`);
  console.log(`Generated raw JSON: ${result.rawJsonPath}`);
  console.log(`Generated normalized JSON: ${result.normalizedPath}`);
  console.log(`Generated BPMN: ${result.xmlPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
