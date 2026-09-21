const NODE_TYPE_TO_BPMN_TYPE = {
  0: "startEvent",
  1: "endEvent",
  2: "choreographyTask",
  3: "exclusiveGateway",
  4: "exclusiveGateway",
  5: "parallelGateway",
  6: "parallelGateway",
  7: "eventBasedGateway"
};

function assertDataset(dataset) {
  if (!dataset || typeof dataset !== "object") {
    throw new Error("NMT dataset must be a JSON object.");
  }
  if (!Array.isArray(dataset.roles) || !Array.isArray(dataset.nodes)) {
    throw new Error('NMT dataset must contain "roles" and "nodes" arrays.');
  }
}

function gatewayKind(nodeType) {
  if ([3, 5].includes(Number(nodeType))) {
    return "split";
  }
  if ([4, 6].includes(Number(nodeType))) {
    return "join";
  }
  return undefined;
}

function messageKey(node, kind) {
  return `${node.name}:${kind}`;
}

/**
 * Converts the contract-oriented NMT dataset format to the JSON format used by
 * the BPMN renderer. The conversion is local and does not write to a contract.
 */
export function nmtDatasetToBpmnInput(dataset, options = {}) {
  assertDataset(dataset);

  const roles = dataset.roles.map((role) => (typeof role === "string" ? role : role.name));
  const roleSet = new Set(roles);
  const nodeNames = new Set();

  dataset.nodes.forEach((node) => {
    if (!node?.name || nodeNames.has(node.name)) {
      throw new Error(`Each NMT node must have a unique name. Invalid name: "${node?.name || ""}".`);
    }
    nodeNames.add(node.name);
    if (!NODE_TYPE_TO_BPMN_TYPE[Number(node.nodeType)]) {
      throw new Error(`Unsupported NMT node type "${node.nodeType}" for node "${node.name}".`);
    }
    [node.initiatorRole, node.participantRole].filter(Boolean).forEach((role) => {
      if (!roleSet.has(role)) {
        throw new Error(`Node "${node.name}" references unknown role "${role}".`);
      }
    });
  });

  const messages = [];
  const messageFlows = [];
  const rendererNodes = dataset.nodes.map((node) => {
    const type = NODE_TYPE_TO_BPMN_TYPE[Number(node.nodeType)];
    const flowKeys = [];

    if (node.initiatingMessage) {
      const key = messageKey(node, "initiating");
      messages.push({ key, name: node.initiatingMessage });
      messageFlows.push({
        key,
        sourceParticipant: node.initiatorRole,
        targetParticipant: node.participantRole,
        messageKey: key
      });
      flowKeys.push(key);
    }

    if (node.returnMessage) {
      const key = messageKey(node, "return");
      messages.push({ key, name: node.returnMessage });
      messageFlows.push({
        key,
        sourceParticipant: node.participantRole,
        targetParticipant: node.initiatorRole,
        messageKey: key
      });
      flowKeys.push(key);
    }

    return {
      name: node.name,
      contractName: node.name,
      type,
      ...(Array.isArray(node.incoming) && node.incoming.length > 0
        ? { incoming: node.incoming.map((source) => `${source}->${node.name}`) }
        : {}),
      ...(Array.isArray(node.outgoing) && node.outgoing.length > 0
        ? { outgoing: node.outgoing.map((target) => `${node.name}->${target}`) }
        : {}),
      ...(node.initiatorRole ? { initiatingParticipant: node.initiatorRole } : {}),
      ...((node.initiatorRole || node.participantRole)
        ? { participants: [node.initiatorRole, node.participantRole].filter(Boolean) }
        : {}),
      ...(flowKeys.length > 0 ? { messageFlowKeys: flowKeys } : {}),
      ...(gatewayKind(node.nodeType) ? { gatewayKind: gatewayKind(node.nodeType) } : {})
    };
  });

  const sequenceFlows = dataset.nodes.flatMap((node) =>
    (node.outgoing || []).map((targetName, index) => ({
      key: `${node.name}->${targetName}`,
      sourceName: node.name,
      targetName,
      ...(node.conditions?.[index] ? { name: node.conditions[index], condition: node.conditions[index] } : {})
    }))
  );

  const baseName = options.name || dataset.name || "Imported choreography";
  const id = options.id || dataset.id || "ImportedChoreography";

  return {
    definitions: {
      id: options.definitionsId || `${id}_definitions`,
      targetNamespace: options.targetNamespace || "http://example.com/chornmt/import"
    },
    messages,
    choreography: {
      id,
      name: baseName,
      participants: roles.map((role) => ({ name: role, role })),
      nodes: rendererNodes,
      sequenceFlows,
      messageFlows
    }
  };
}
