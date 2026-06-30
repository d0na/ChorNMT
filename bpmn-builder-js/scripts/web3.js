import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Web3 } from "web3";

const __filename = fileURLToPath(import.meta.url);

const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "name", type: "string" }],
    name: "getNode",
    outputs: [
      { internalType: "string", name: "", type: "string" },
      { internalType: "enum BPMNChoreography.NodeType", name: "", type: "uint8" },
      { internalType: "string[]", name: "", type: "string[]" },
      { internalType: "string[]", name: "", type: "string[]" },
      { internalType: "string[]", name: "", type: "string[]" },
      { internalType: "string", name: "", type: "string" },
      { internalType: "string", name: "", type: "string" },
      { internalType: "string", name: "", type: "string" },
      { internalType: "string", name: "", type: "string" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getNodeNames",
    outputs: [{ internalType: "string[]", name: "", type: "string[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "role", type: "string" }],
    name: "getRole",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getRoleNames",
    outputs: [{ internalType: "string[]", name: "", type: "string[]" }],
    stateMutability: "view",
    type: "function"
  }
];

const NODE_TYPE_MAP = {
  0: { type: "startEvent", contractNodeType: "START_EVENT" },
  1: { type: "endEvent", contractNodeType: "END_EVENT" },
  2: { type: "choreographyTask", contractNodeType: "TASK" },
  3: { type: "exclusiveGateway", contractNodeType: "EXCLUSIVE_SPLIT", gatewayKind: "split" },
  4: { type: "exclusiveGateway", contractNodeType: "EXCLUSIVE_JOIN", gatewayKind: "join" },
  5: { type: "parallelGateway", contractNodeType: "PARALLEL_SPLIT", gatewayKind: "split" },
  6: { type: "parallelGateway", contractNodeType: "PARALLEL_JOIN", gatewayKind: "join" },
  7: { type: "eventBasedGateway", contractNodeType: "EVENT_BASED_GATEWAY" }
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNode(rawNode) {
  return {
    name: rawNode[0],
    nodeType: Number(rawNode[1]),
    incoming: toArray(rawNode[2]),
    outgoing: toArray(rawNode[3]),
    conditions: toArray(rawNode[4]),
    initiatorRole: rawNode[5],
    participantRole: rawNode[6],
    initiatingMessage: rawNode[7],
    returnMessage: rawNode[8]
  };
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest must be a JSON object.");
  }
  if (!manifest.rpcUrl) {
    throw new Error('Manifest must contain "rpcUrl".');
  }
  if (!manifest.contractAddress) {
    throw new Error('Manifest must contain "contractAddress".');
  }
}

function resolveOutputPath(manifestPath, manifest, cliOutputPath) {
  if (cliOutputPath) {
    return path.resolve(process.cwd(), cliOutputPath);
  }
  if (manifest.outputPath) {
    return path.resolve(path.dirname(manifestPath), manifest.outputPath);
  }
  return path.resolve(path.dirname(manifestPath), "..", "input", "contract-export.raw.generated.json");
}

function buildRawOutput(manifest, roles, nodes) {
  const messages = [];
  const messageFlows = [];

  nodes.forEach((node) => {
    if (node.initiatingMessage) {
      messages.push({
        key: `${node.name}:initiating`,
        name: node.initiatingMessage
      });
      messageFlows.push({
        key: `${node.name}:initiating`,
        sourceParticipant: node.initiatorRole,
        targetParticipant: node.participantRole,
        messageKey: `${node.name}:initiating`
      });
    }

    if (node.returnMessage) {
      messages.push({
        key: `${node.name}:return`,
        name: node.returnMessage
      });
      messageFlows.push({
        key: `${node.name}:return`,
        sourceParticipant: node.participantRole,
        targetParticipant: node.initiatorRole,
        messageKey: `${node.name}:return`
      });
    }
  });

  return {
    contractExport: {
      sourceContract: "BPMNChoreography.sol",
      contractAddress: manifest.contractAddress,
      exportedAt: new Date().toISOString(),
      rpcUrl: manifest.rpcUrl,
      roleNames: roles.map((role) => role.name),
      nodeNames: nodes.map((node) => node.name),
      idsGeneratedBy: null
    },
    definitions: {
      id: manifest.definitions?.id || `${manifest.choreographyId || "ContractChoreography"}_definitions`,
      targetNamespace:
        manifest.definitions?.targetNamespace || "http://example.com/bpmn-builder-js/contract-export"
    },
    messages,
    choreography: {
      id: manifest.choreographyId || "ContractChoreography",
      ...(manifest.choreographyName ? { name: manifest.choreographyName } : {}),
      participants: roles.map((role) => ({
        name: role.name,
        role: role.name,
        address: role.address
      })),
      messageFlows,
      nodes: nodes.map((node) => {
        const typeInfo = NODE_TYPE_MAP[node.nodeType];
        if (!typeInfo) {
          throw new Error(`Unsupported node type "${node.nodeType}" for node "${node.name}".`);
        }

        return {
          name: node.name,
          type: typeInfo.type,
          contractNodeType: typeInfo.contractNodeType,
          contractName: node.name,
          ...(node.incoming.length > 0 ? { incoming: node.incoming.map((name) => `${name}->${node.name}`) } : {}),
          ...(node.outgoing.length > 0 ? { outgoing: node.outgoing.map((name) => `${node.name}->${name}`) } : {}),
          ...(typeInfo.gatewayKind ? { gatewayKind: typeInfo.gatewayKind } : {}),
          ...(node.initiatorRole ? { initiatingParticipant: node.initiatorRole } : {}),
          ...((node.initiatorRole || node.participantRole)
            ? {
                participants: [node.initiatorRole, node.participantRole].filter(Boolean)
              }
            : {}),
          ...((node.initiatingMessage || node.returnMessage)
            ? {
                messageFlowKeys: [
                  node.initiatingMessage ? `${node.name}:initiating` : null,
                  node.returnMessage ? `${node.name}:return` : null
                ].filter(Boolean)
              }
            : {}),
          ...(node.conditions.length > 0 ? { contractConditions: node.conditions } : {}),
          ...(node.initiatorRole ? { contractInitiatorRole: node.initiatorRole } : {}),
          ...(node.participantRole ? { contractParticipantRole: node.participantRole } : {})
        };
      }),
      sequenceFlows: nodes.flatMap((node) =>
        node.outgoing.map((targetName, index) => ({
          key: `${node.name}->${targetName}`,
          sourceName: node.name,
          targetName,
          ...(node.conditions[index] ? { name: node.conditions[index], condition: node.conditions[index] } : {})
        }))
      )
    }
  };
}

export async function loadManifest(manifestPath) {
  const content = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(content);
  assertManifest(manifest);
  return manifest;
}

export async function readRoles(contract) {
  const roleNames = await contract.methods.getRoleNames().call();
  return Promise.all(
    roleNames.map(async (name) => ({
      name,
      address: await contract.methods.getRole(name).call()
    }))
  );
}

export async function readNodes(contract) {
  const nodeNames = await contract.methods.getNodeNames().call();
  const nodes = await Promise.all(
    nodeNames.map(async (name) => normalizeNode(await contract.methods.getNode(name).call()))
  );

  nodes.forEach((node, index) => {
    if (!node.name) {
      throw new Error(`Contract returned an empty node for requested name "${nodeNames[index]}".`);
    }
  });

  return nodes;
}

export async function exportContractToJson(manifestArg, outputArg) {
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = await loadManifest(manifestPath);
  const web3 = new Web3(manifest.rpcUrl);
  const contract = new web3.eth.Contract(CONTRACT_ABI, manifest.contractAddress);

  const [roles, nodes] = await Promise.all([readRoles(contract), readNodes(contract)]);
  const output = buildRawOutput(manifest, roles, nodes);
  const outputPath = resolveOutputPath(manifestPath, manifest, outputArg);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  process.stdout.write(`Exported choreography raw JSON to ${outputPath}\n`);

  return { output, outputPath, manifest };
}

async function main() {
  const manifestArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!manifestArg) {
    throw new Error("Usage: node ./scripts/web3.js <manifest-path> [output-path]");
  }

  await exportContractToJson(manifestArg, outputArg);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
