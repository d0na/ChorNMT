import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Web3 } from "web3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  0: { type: "startEvent", contractNodeType: "START_EVENT", idPrefix: "StartEvent" },
  1: { type: "endEvent", contractNodeType: "END_EVENT", idPrefix: "EndEvent" },
  2: { type: "choreographyTask", contractNodeType: "TASK", idPrefix: "ChoreographyTask" },
  3: {
    type: "exclusiveGateway",
    contractNodeType: "EXCLUSIVE_SPLIT",
    gatewayKind: "split",
    idPrefix: "ExclusiveGateway"
  },
  4: {
    type: "exclusiveGateway",
    contractNodeType: "EXCLUSIVE_JOIN",
    gatewayKind: "join",
    idPrefix: "ExclusiveGateway"
  },
  5: {
    type: "parallelGateway",
    contractNodeType: "PARALLEL_SPLIT",
    gatewayKind: "split",
    idPrefix: "ParallelGateway"
  },
  6: {
    type: "parallelGateway",
    contractNodeType: "PARALLEL_JOIN",
    gatewayKind: "join",
    idPrefix: "ParallelGateway"
  },
  7: { type: "eventBasedGateway", contractNodeType: "EVENT_BASED_GATEWAY", idPrefix: "EventBasedGateway" }
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

  return path.resolve(path.dirname(manifestPath), "..", "input", "contract-export.generated.json");
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

  return {
    participants,
    participantByRole: new Map(participants.map((participant) => [participant.role, participant]))
  };
}

function createNodeIdMap(nodes, manifest) {
  const configuredIds = manifest.nodeIds || {};
  const factoriesByPrefix = new Map();
  const nodeIdByName = new Map();

  for (const node of nodes) {
    const typeInfo = NODE_TYPE_MAP[node.nodeType];

    if (!typeInfo) {
      throw new Error(`Unsupported node type "${node.nodeType}" for node "${node.name}".`);
    }

    if (!factoriesByPrefix.has(typeInfo.idPrefix)) {
      factoriesByPrefix.set(typeInfo.idPrefix, createIdFactory(typeInfo.idPrefix, configuredIds));
    }

    const makeNodeId = factoriesByPrefix.get(typeInfo.idPrefix);
    nodeIdByName.set(node.name, makeNodeId(node.name, node.name));
  }

  return nodeIdByName;
}

function createSequenceFlows(nodes, nodeIdByName, manifest) {
  const configuredIds = manifest.sequenceFlowIds || {};
  const makeSequenceFlowId = createIdFactory("Flow", configuredIds);
  const sequenceFlows = [];
  const incomingByNodeId = new Map();
  const outgoingByNodeId = new Map();

  for (const node of nodes) {
    const sourceId = nodeIdByName.get(node.name);

    for (let index = 0; index < node.outgoing.length; index += 1) {
      const targetName = node.outgoing[index];
      const targetId = nodeIdByName.get(targetName);

      if (!targetId) {
        throw new Error(`Node "${node.name}" references unknown outgoing node "${targetName}".`);
      }

      const edgeKey = `${node.name}->${targetName}`;
      const flowId = makeSequenceFlowId(edgeKey, `${node.name}_to_${targetName}`);
      const condition = node.conditions[index] || "";
      const flow = {
        id: flowId,
        sourceRef: sourceId,
        targetRef: targetId
      };

      if (condition) {
        flow.name = condition;
        flow.condition = condition;
      }

      sequenceFlows.push(flow);

      const outgoing = outgoingByNodeId.get(sourceId) || [];
      outgoing.push(flowId);
      outgoingByNodeId.set(sourceId, outgoing);

      const incoming = incomingByNodeId.get(targetId) || [];
      incoming.push(flowId);
      incomingByNodeId.set(targetId, incoming);
    }
  }

  return { sequenceFlows, incomingByNodeId, outgoingByNodeId };
}

function createMessagesAndFlows(nodes, nodeIdByName, participantByRole, manifest) {
  const configuredMessageIds = manifest.messageIds || {};
  const configuredMessageFlowIds = manifest.messageFlowIds || {};
  const makeMessageId = createIdFactory("Message", configuredMessageIds);
  const makeMessageFlowId = createIdFactory("MessageFlow", configuredMessageFlowIds);

  const messages = [];
  const messageFlows = [];
  const messageFlowRefsByNodeId = new Map();

  for (const node of nodes) {
    const nodeId = nodeIdByName.get(node.name);
    const initiator = participantByRole.get(node.initiatorRole);
    const participant = participantByRole.get(node.participantRole);
    const nodeMessageFlowRefs = [];

    if (node.initiatingMessage && initiator && participant) {
      const messageId = makeMessageId(`${node.name}:initiating`, `${node.name}_initiating_message`);
      const messageFlowId = makeMessageFlowId(
        `${node.name}:initiating`,
        `${node.name}_initiating_flow`
      );

      messages.push({ id: messageId, name: node.initiatingMessage });
      messageFlows.push({
        id: messageFlowId,
        sourceRef: initiator.id,
        targetRef: participant.id,
        messageRef: messageId
      });
      nodeMessageFlowRefs.push(messageFlowId);
    }

    if (node.returnMessage && initiator && participant) {
      const messageId = makeMessageId(`${node.name}:return`, `${node.name}_return_message`);
      const messageFlowId = makeMessageFlowId(`${node.name}:return`, `${node.name}_return_flow`);

      messages.push({ id: messageId, name: node.returnMessage });
      messageFlows.push({
        id: messageFlowId,
        sourceRef: participant.id,
        targetRef: initiator.id,
        messageRef: messageId
      });
      nodeMessageFlowRefs.push(messageFlowId);
    }

    if (nodeMessageFlowRefs.length > 0) {
      messageFlowRefsByNodeId.set(nodeId, nodeMessageFlowRefs);
    }
  }

  return { messages, messageFlows, messageFlowRefsByNodeId };
}

function mapNodesToChoreographyNodes(
  nodes,
  nodeIdByName,
  participantByRole,
  incomingByNodeId,
  outgoingByNodeId,
  messageFlowRefsByNodeId
) {
  return nodes.map((node) => {
    const typeInfo = NODE_TYPE_MAP[node.nodeType];
    const nodeId = nodeIdByName.get(node.name);

    const result = {
      id: nodeId,
      name: node.name,
      type: typeInfo.type,
      contractNodeType: typeInfo.contractNodeType,
      contractName: node.name
    };

    const incoming = incomingByNodeId.get(nodeId) || [];
    if (incoming.length > 0) {
      result.incoming = incoming;
    }

    const outgoing = outgoingByNodeId.get(nodeId) || [];
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

    const messageFlowRefs = messageFlowRefsByNodeId.get(nodeId) || [];
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

async function readRoles(contract) {
  const roleNames = await contract.methods.getRoleNames().call();

  return Promise.all(
    roleNames.map(async (name) => ({
      name,
      address: await contract.methods.getRole(name).call()
    }))
  );
}

async function readNodes(contract) {
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

function buildOutput(manifest, roles, nodes) {
  const { participants, participantByRole } = createParticipants(roles, manifest);
  const nodeIdByName = createNodeIdMap(nodes, manifest);
  const { sequenceFlows, incomingByNodeId, outgoingByNodeId } = createSequenceFlows(
    nodes,
    nodeIdByName,
    manifest
  );
  const { messages, messageFlows, messageFlowRefsByNodeId } = createMessagesAndFlows(
    nodes,
    nodeIdByName,
    participantByRole,
    manifest
  );

  return {
    contractExport: {
      sourceContract: "BPMNChoreography.sol",
      contractAddress: manifest.contractAddress,
      exportedAt: new Date().toISOString(),
      rpcUrl: manifest.rpcUrl,
      roleNames: roles.map((role) => role.name),
      nodeNames: nodes.map((node) => node.name),
      idsGeneratedBy: "bpmn-builder-js/scripts/web3.js"
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
        nodeIdByName,
        participantByRole,
        incomingByNodeId,
        outgoingByNodeId,
        messageFlowRefsByNodeId
      ),
      sequenceFlows
    }
  };
}

async function main() {
  const manifestArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!manifestArg) {
    throw new Error("Usage: node ./scripts/web3.js <manifest-path> [output-path]");
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = await loadManifest(manifestPath);
  const web3 = new Web3(manifest.rpcUrl);
  const contract = new web3.eth.Contract(CONTRACT_ABI, manifest.contractAddress);

  const [roles, nodes] = await Promise.all([readRoles(contract), readNodes(contract)]);
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
