import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Web3 } from "web3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "id", type: "string" }],
    name: "getNode",
    outputs: [
      { internalType: "string", name: "", type: "string" },
      { internalType: "enum BPMNChoreography.NodeType", name: "", type: "uint8" },
      { internalType: "string", name: "", type: "string" },
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
    inputs: [{ internalType: "string", name: "role", type: "string" }],
    name: "getRole",
    outputs: [{ internalType: "address", name: "", type: "address" }],
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

function sanitizeIdPart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "value";
}

function createIdFactory(prefix, configuredMap = {}) {
  const counters = new Map();
  const explicit = new Map(Object.entries(configuredMap));

  return (key, fallbackSeed) => {
    if (explicit.has(key)) {
      return explicit.get(key);
    }

    const base = `${prefix}_${sanitizeIdPart(fallbackSeed || key)}`;
    const current = counters.get(base) || 0;
    counters.set(base, current + 1);

    return current === 0 ? base : `${base}_${current + 1}`;
  };
}

function normalizeNode(rawNode) {
  return {
    id: rawNode[0],
    nodeType: Number(rawNode[1]),
    name: rawNode[2],
    incoming: toArray(rawNode[3]),
    outgoing: toArray(rawNode[4]),
    conditions: toArray(rawNode[5]),
    initiatorRole: rawNode[6],
    participantRole: rawNode[7],
    initiatingMessage: rawNode[8],
    returnMessage: rawNode[9]
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

  if (!Array.isArray(manifest.nodeIds) || manifest.nodeIds.length === 0) {
    throw new Error('Manifest must contain a non-empty "nodeIds" array.');
  }

  if (!Array.isArray(manifest.roleNames) || manifest.roleNames.length === 0) {
    throw new Error('Manifest must contain a non-empty "roleNames" array.');
  }
}

function resolveOutputPath(manifestPath, manifest, cliOutputPath) {
  if (cliOutputPath) {
    return path.resolve(process.cwd(), cliOutputPath);
  }

  if (manifest.outputPath) {
    return path.resolve(path.dirname(manifestPath), manifest.outputPath);
  }

  return path.resolve(path.dirname(manifestPath), "..", "input", "contract-export.generated.json");
}

function createSequenceFlows(nodes, manifest) {
  const configuredIds = manifest.sequenceFlowIds || {};
  const makeSequenceFlowId = createIdFactory("Flow", configuredIds);
  const sequenceFlows = [];
  const incomingByNode = new Map();
  const outgoingByNode = new Map();

  for (const node of nodes) {
    for (let index = 0; index < node.outgoing.length; index += 1) {
      const targetRef = node.outgoing[index];
      const edgeKey = `${node.id}->${targetRef}`;
      const flowId = makeSequenceFlowId(edgeKey, `${node.id}_to_${targetRef}`);
      const condition = node.conditions[index] || "";
      const flow = {
        id: flowId,
        sourceRef: node.id,
        targetRef
      };

      if (condition) {
        flow.name = condition;
        flow.condition = condition;
      }

      sequenceFlows.push(flow);

      const outgoing = outgoingByNode.get(node.id) || [];
      outgoing.push(flowId);
      outgoingByNode.set(node.id, outgoing);

      const incoming = incomingByNode.get(targetRef) || [];
      incoming.push(flowId);
      incomingByNode.set(targetRef, incoming);
    }
  }

  return { sequenceFlows, incomingByNode, outgoingByNode };
}

function createParticipants(roles, manifest) {
  const configuredIds = manifest.participantIds || {};
  const makeParticipantId = createIdFactory("Participant", configuredIds);
  const participants = roles.map((role) => ({
    id: makeParticipantId(role.name, role.name),
    name: role.name,
    role: role.name,
    address: role.address
  }));

  const byRole = new Map(participants.map((participant) => [participant.role, participant]));
  return { participants, participantByRole: byRole };
}

function createMessagesAndFlows(nodes, participantByRole, manifest) {
  const configuredMessageIds = manifest.messageIds || {};
  const configuredMessageFlowIds = manifest.messageFlowIds || {};
  const makeMessageId = createIdFactory("Message", configuredMessageIds);
  const makeMessageFlowId = createIdFactory("MessageFlow", configuredMessageFlowIds);

  const messages = [];
  const messageFlows = [];
  const messageFlowRefsByNode = new Map();

  for (const node of nodes) {
    const nodeMessageFlowRefs = [];
    const initiator = participantByRole.get(node.initiatorRole);
    const participant = participantByRole.get(node.participantRole);

    if (node.initiatingMessage && initiator && participant) {
      const messageId = makeMessageId(`${node.id}:initiating`, `${node.id}_initiating_message`);
      const messageFlowId = makeMessageFlowId(
        `${node.id}:initiating`,
        `${node.id}_initiating_flow`
      );

      messages.push({
        id: messageId,
        name: node.initiatingMessage
      });
      messageFlows.push({
        id: messageFlowId,
        sourceRef: initiator.id,
        targetRef: participant.id,
        messageRef: messageId
      });
      nodeMessageFlowRefs.push(messageFlowId);
    }

    if (node.returnMessage && initiator && participant) {
      const messageId = makeMessageId(`${node.id}:return`, `${node.id}_return_message`);
      const messageFlowId = makeMessageFlowId(`${node.id}:return`, `${node.id}_return_flow`);

      messages.push({
        id: messageId,
        name: node.returnMessage
      });
      messageFlows.push({
        id: messageFlowId,
        sourceRef: participant.id,
        targetRef: initiator.id,
        messageRef: messageId
      });
      nodeMessageFlowRefs.push(messageFlowId);
    }

    if (nodeMessageFlowRefs.length > 0) {
      messageFlowRefsByNode.set(node.id, nodeMessageFlowRefs);
    }
  }

  return { messages, messageFlows, messageFlowRefsByNode };
}

function mapNodesToChoreographyNodes(
  nodes,
  participantByRole,
  incomingByNode,
  outgoingByNode,
  messageFlowRefsByNode
) {
  return nodes.map((node) => {
    const typeInfo = NODE_TYPE_MAP[node.nodeType];

    if (!typeInfo) {
      throw new Error(`Unsupported node type "${node.nodeType}" for node "${node.id}".`);
    }

    const result = {
      id: node.id,
      type: typeInfo.type,
      contractNodeType: typeInfo.contractNodeType
    };

    if (node.name) {
      result.name = node.name;
    }

    const incoming = incomingByNode.get(node.id) || [];
    if (incoming.length > 0) {
      result.incoming = incoming;
    }

    const outgoing = outgoingByNode.get(node.id) || [];
    if (outgoing.length > 0) {
      result.outgoing = outgoing;
    }

    if (typeInfo.gatewayKind) {
      result.gatewayKind = typeInfo.gatewayKind;
    }

    if (node.initiatorRole && participantByRole.has(node.initiatorRole)) {
      result.initiatingParticipantRef = participantByRole.get(node.initiatorRole).id;
    }

    const participantRefs = [];
    if (node.initiatorRole && participantByRole.has(node.initiatorRole)) {
      participantRefs.push(participantByRole.get(node.initiatorRole).id);
    }
    if (
      node.participantRole &&
      participantByRole.has(node.participantRole) &&
      participantByRole.get(node.participantRole).id !== result.initiatingParticipantRef
    ) {
      participantRefs.push(participantByRole.get(node.participantRole).id);
    }
    if (participantRefs.length > 0) {
      result.participantRef = participantRefs;
    }

    const messageFlowRefs = messageFlowRefsByNode.get(node.id) || [];
    if (messageFlowRefs.length > 0) {
      result.messageFlowRef = messageFlowRefs;
    }

    if (node.conditions.length > 0) {
      result.contractConditions = node.conditions;
    }

    if (node.initiatorRole) {
      result.contractInitiatorRole = node.initiatorRole;
    }

    if (node.participantRole) {
      result.contractParticipantRole = node.participantRole;
    }

    return result;
  });
}

async function loadManifest(manifestPath) {
  const content = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(content);
  assertManifest(manifest);
  return manifest;
}

async function readRoles(contract, roleNames) {
  return Promise.all(
    roleNames.map(async (name) => ({
      name,
      address: await contract.methods.getRole(name).call()
    }))
  );
}

async function readNodes(contract, nodeIds) {
  const nodes = await Promise.all(
    nodeIds.map(async (id) => normalizeNode(await contract.methods.getNode(id).call()))
  );

  nodes.forEach((node, index) => {
    if (!node.id) {
      throw new Error(`Contract returned an empty node for requested id "${nodeIds[index]}".`);
    }
  });

  return nodes;
}

function buildOutput(manifest, roles, nodes) {
  const { sequenceFlows, incomingByNode, outgoingByNode } = createSequenceFlows(nodes, manifest);
  const { participants, participantByRole } = createParticipants(roles, manifest);
  const { messages, messageFlows, messageFlowRefsByNode } = createMessagesAndFlows(
    nodes,
    participantByRole,
    manifest
  );

  return {
    contractExport: {
      sourceContract: "BPMNChoreography.sol",
      contractAddress: manifest.contractAddress,
      exportedAt: new Date().toISOString(),
      rpcUrl: manifest.rpcUrl,
      nodeIds: manifest.nodeIds,
      roleNames: manifest.roleNames
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
      participants,
      messageFlows,
      nodes: mapNodesToChoreographyNodes(
        nodes,
        participantByRole,
        incomingByNode,
        outgoingByNode,
        messageFlowRefsByNode
      ),
      sequenceFlows
    }
  };
}

async function main() {
  const manifestArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!manifestArg) {
    throw new Error(
      "Usage: node ./scripts/web3.js <manifest-path> [output-path]"
    );
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = await loadManifest(manifestPath);
  const web3 = new Web3(manifest.rpcUrl);
  const contract = new web3.eth.Contract(CONTRACT_ABI, manifest.contractAddress);

  const [roles, nodes] = await Promise.all([
    readRoles(contract, manifest.roleNames),
    readNodes(contract, manifest.nodeIds)
  ]);

  const output = buildOutput(manifest, roles, nodes);
  const outputPath = resolveOutputPath(manifestPath, manifest, outputArg);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  process.stdout.write(`Exported choreography JSON to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
