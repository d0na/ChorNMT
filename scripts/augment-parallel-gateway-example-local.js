import { Contract, JsonRpcProvider, Wallet } from "ethers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { populateContract } from "./populate-local.js";
import { renderAssetToBpmn } from "./render-local-support.js";

const __filename = fileURLToPath(import.meta.url);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const CHOREOGRAPHY_MUTABLE_ASSET_ABI = [
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

function buildParallelGatewayExampleDeltaNodes() {
  return [
    {
      name: "Parallel Join",
      nodeType: 6,
      incoming: ["Activity2", "Activity3"],
      outgoing: ["Activity4"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "Activity4",
      nodeType: 2,
      incoming: ["Parallel Join"],
      outgoing: ["End"],
      conditions: [],
      initiatorRole: "Ale",
      participantRole: "Fra",
      initiatingMessage: "msg5",
      returnMessage: "msg6"
    },
    {
      name: "End",
      nodeType: 1,
      incoming: ["Activity4"],
      outgoing: [],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    }
  ];
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

async function applyAugmentedNodes(assetAddress) {
  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const contract = new Contract(assetAddress, CHOREOGRAPHY_MUTABLE_ASSET_ABI, signer);
  const deltaNodes = buildParallelGatewayExampleDeltaNodes();
  const payload = buildNodePayload(deltaNodes);

  const tx = await contract.setNodes(
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
  await tx.wait();

  return deltaNodes;
}

async function main() {
  const assetAddress = process.argv[2];

  if (!assetAddress) {
    throw new Error(
      "An asset address is required. Usage: npm run augment:parallel-gateway-example -- <asset-address>"
    );
  }

  await populateContract(assetAddress, "parallel-gateway-example");
  const baseline = await renderAssetToBpmn({
    assetAddress,
    choreographyId: "ParallelGatewayExample",
    choreographyName: "Parallel Gateway Example",
    definitionsId: "ParallelGatewayExample_definitions",
    targetNamespace: "http://example.com/parallel-gateway-example",
    outputBaseName: "parallel-gateway-example-baseline-from-contract"
  });

  const deltaNodes = await applyAugmentedNodes(assetAddress);
  const updated = await renderAssetToBpmn({
    assetAddress,
    choreographyId: "ParallelGatewayExampleAugmented",
    choreographyName: "Parallel Gateway Example Augmented",
    definitionsId: "ParallelGatewayExampleAugmented_definitions",
    targetNamespace: "http://example.com/parallel-gateway-example-augmented",
    outputBaseName: "parallel-gateway-example-augmented-from-contract"
  });

  console.log(`Baseline XML: ${baseline.xmlPath}`);
  console.log(`Updated XML: ${updated.xmlPath}`);
  console.log(`Delta nodes updated through setNodes(...): Parallel Join, Activity4, End`);
  console.log(`Added task: Activity4`);
  console.log(`Added messages: msg5, msg6`);
  console.log(`Delta node count: ${deltaNodes.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
