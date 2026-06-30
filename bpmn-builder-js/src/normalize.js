function sanitizeIdPart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "value";
}

function createIdFactory(prefix) {
  const counters = new Map();

  return (seed) => {
    const base = `${prefix}_${sanitizeIdPart(seed)}`;
    const current = counters.get(base) || 0;
    counters.set(base, current + 1);

    return current === 0 ? base : `${base}_${current + 1}`;
  };
}

function nodePrefix(type) {
  switch (type) {
    case "startEvent":
      return "StartEvent";
    case "endEvent":
      return "EndEvent";
    case "task":
      return "Task";
    case "choreographyTask":
      return "ChoreographyTask";
    case "parallelGateway":
      return "ParallelGateway";
    case "exclusiveGateway":
      return "ExclusiveGateway";
    case "eventBasedGateway":
      return "EventBasedGateway";
    default:
      return "Node";
  }
}

function normalizeProcessInput(input) {
  return input;
}

function normalizeChoreographyInput(input) {
  const definitions = input.definitions || {};
  const choreography = input.choreography || {};
  const participants = Array.isArray(choreography.participants) ? choreography.participants : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const nodes = Array.isArray(choreography.nodes) ? choreography.nodes : [];
  const sequenceFlows = Array.isArray(choreography.sequenceFlows) ? choreography.sequenceFlows : [];
  const messageFlows = Array.isArray(choreography.messageFlows) ? choreography.messageFlows : [];

  const makeParticipantId = createIdFactory("Participant");
  const makeMessageId = createIdFactory("Message");
  const makeMessageFlowId = createIdFactory("MessageFlow");
  const makeSequenceFlowId = createIdFactory("Flow");
  const nodeFactories = new Map();

  const participantByKey = new Map();
  const normalizedParticipants = participants.map((participant, index) => {
    const seed = participant.role || participant.name || `participant_${index + 1}`;
    const normalized = {
      ...participant,
      id: participant.id || makeParticipantId(seed)
    };

    [participant.id, participant.role, participant.name, normalized.id]
      .filter(Boolean)
      .forEach((key) => participantByKey.set(key, normalized));

    return normalized;
  });

  const messageByKey = new Map();
  const normalizedMessages = messages.map((message, index) => {
    const seed = message.key || message.name || `message_${index + 1}`;
    const normalized = {
      ...message,
      id: message.id || makeMessageId(seed)
    };

    [message.id, message.key, message.name, normalized.id]
      .filter(Boolean)
      .forEach((key) => messageByKey.set(key, normalized));

    return normalized;
  });

  const nodeByKey = new Map();
  const normalizedNodes = nodes.map((node, index) => {
    const prefix = nodePrefix(node.type);
    if (!nodeFactories.has(prefix)) {
      nodeFactories.set(prefix, createIdFactory(prefix));
    }

    const seed = node.contractName || node.name || `node_${index + 1}`;
    const normalized = {
      ...node,
      id: node.id || nodeFactories.get(prefix)(seed)
    };

    [node.id, node.contractName, node.name, normalized.id]
      .filter(Boolean)
      .forEach((key) => nodeByKey.set(key, normalized));

    return normalized;
  });

  const sequenceFlowByKey = new Map();
  const normalizedSequenceFlows = sequenceFlows.map((flow, index) => {
    const sourceNode = nodeByKey.get(flow.sourceName) || nodeByKey.get(flow.sourceRef);
    const targetNode = nodeByKey.get(flow.targetName) || nodeByKey.get(flow.targetRef);
    const seed =
      flow.key ||
      `${flow.sourceName || flow.sourceRef || "source"}_to_${flow.targetName || flow.targetRef || "target"}_${index + 1}`;

    const normalized = {
      ...flow,
      id: flow.id || makeSequenceFlowId(seed),
      sourceRef: sourceNode?.id || flow.sourceRef,
      targetRef: targetNode?.id || flow.targetRef
    };

    [
      flow.id,
      flow.key,
      normalized.id,
      flow.sourceName && flow.targetName ? `${flow.sourceName}->${flow.targetName}` : null
    ]
      .filter(Boolean)
      .forEach((key) => sequenceFlowByKey.set(key, normalized));

    return normalized;
  });

  const messageFlowByKey = new Map();
  const normalizedMessageFlows = messageFlows.map((flow, index) => {
    const sourceParticipant =
      participantByKey.get(flow.sourceParticipant) || participantByKey.get(flow.sourceRef);
    const targetParticipant =
      participantByKey.get(flow.targetParticipant) || participantByKey.get(flow.targetRef);
    const message =
      messageByKey.get(flow.messageKey) ||
      messageByKey.get(flow.messageName) ||
      messageByKey.get(flow.messageRef);
    const seed =
      flow.key ||
      `${flow.sourceParticipant || flow.sourceRef || "source"}_to_${flow.targetParticipant || flow.targetRef || "target"}_${index + 1}`;

    const normalized = {
      ...flow,
      id: flow.id || makeMessageFlowId(seed),
      sourceRef: sourceParticipant?.id || flow.sourceRef,
      targetRef: targetParticipant?.id || flow.targetRef,
      messageRef: message?.id || flow.messageRef
    };

    [flow.id, flow.key, normalized.id, flow.messageKey, flow.messageName]
      .filter(Boolean)
      .forEach((key) => messageFlowByKey.set(key, normalized));

    return normalized;
  });

  const incomingByNodeId = new Map();
  const outgoingByNodeId = new Map();

  normalizedSequenceFlows.forEach((flow) => {
    if (flow.sourceRef) {
      const outgoing = outgoingByNodeId.get(flow.sourceRef) || [];
      outgoing.push(flow.id);
      outgoingByNodeId.set(flow.sourceRef, outgoing);
    }

    if (flow.targetRef) {
      const incoming = incomingByNodeId.get(flow.targetRef) || [];
      incoming.push(flow.id);
      incomingByNodeId.set(flow.targetRef, incoming);
    }
  });

  const fullyNormalizedNodes = normalizedNodes.map((node) => {
    const participantRef = Array.isArray(node.participants)
      ? node.participants.map((ref) => participantByKey.get(ref)?.id || ref)
      : Array.isArray(node.participantRef)
        ? node.participantRef.map((ref) => participantByKey.get(ref)?.id || ref)
        : undefined;

    const messageFlowRef = Array.isArray(node.messageFlowKeys)
      ? node.messageFlowKeys.map((ref) => messageFlowByKey.get(ref)?.id || ref)
      : Array.isArray(node.messageFlowRef)
        ? node.messageFlowRef.map((ref) => messageFlowByKey.get(ref)?.id || ref)
        : undefined;

    const initiatingParticipant =
      participantByKey.get(node.initiatingParticipant) ||
      participantByKey.get(node.initiatingParticipantRef);

    const incoming = Array.isArray(node.incoming)
      ? node.incoming.map((ref) => sequenceFlowByKey.get(ref)?.id || ref)
      : incomingByNodeId.get(node.id) || [];

    const outgoing = Array.isArray(node.outgoing)
      ? node.outgoing.map((ref) => sequenceFlowByKey.get(ref)?.id || ref)
      : outgoingByNodeId.get(node.id) || [];

    return {
      ...node,
      id: node.id,
      incoming,
      outgoing,
      ...(participantRef ? { participantRef } : {}),
      ...(messageFlowRef ? { messageFlowRef } : {}),
      ...(initiatingParticipant ? { initiatingParticipantRef: initiatingParticipant.id } : {})
    };
  });

  return {
    ...input,
    definitions: {
      id: definitions.id || `${choreography.id || "Choreography"}_definitions`,
      targetNamespace:
        definitions.targetNamespace || "http://example.com/bpmn-builder-js"
    },
    messages: normalizedMessages,
    choreography: {
      ...choreography,
      participants: normalizedParticipants,
      messageFlows: normalizedMessageFlows,
      nodes: fullyNormalizedNodes,
      sequenceFlows: normalizedSequenceFlows
    }
  };
}

export function normalizeInput(input) {
  if (!input || typeof input !== "object") {
    return input;
  }

  if (input.process) {
    return normalizeProcessInput(input);
  }

  if (input.choreography) {
    return normalizeChoreographyInput(input);
  }

  return input;
}
