export function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be a JSON object.");
  }

  if (input.process) {
    validateProcessInput(input.process);
    return;
  }

  if (input.choreography) {
    validateChoreographyInput(input);
    return;
  }

  throw new Error('Input must contain either a "process" object or a "choreography" object.');
}

function validateProcessInput(process) {
  if (!process || typeof process !== "object") {
    throw new Error('Input must contain a "process" object.');
  }

  if (!process.id) {
    throw new Error('The "process" object must contain an "id".');
  }

  const nodes = Array.isArray(process.nodes) ? process.nodes : [];
  const sequenceFlows = Array.isArray(process.sequenceFlows) ? process.sequenceFlows : [];

  nodes.forEach((node, index) => validateNode(node, index));

  const nodeIds = new Set(nodes.map((node) => node.id));
  sequenceFlows.forEach((flow, index) => validateSequenceFlow(flow, index, nodeIds));
}

function validateChoreographyInput(input) {
  const { choreography } = input;

  if (!choreography || typeof choreography !== "object") {
    throw new Error('Input must contain a "choreography" object.');
  }

  if (!choreography.id) {
    throw new Error('The "choreography" object must contain an "id".');
  }

  const participants = Array.isArray(choreography.participants) ? choreography.participants : [];
  const nodes = Array.isArray(choreography.nodes) ? choreography.nodes : [];
  const sequenceFlows = Array.isArray(choreography.sequenceFlows) ? choreography.sequenceFlows : [];
  const messageFlows = Array.isArray(choreography.messageFlows) ? choreography.messageFlows : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];

  participants.forEach((participant, index) => {
    if (!participant || typeof participant !== "object") {
      throw new Error(`Participant at index ${index} must be an object.`);
    }

    if (!participant.id) {
      throw new Error(`Participant at index ${index} must contain an "id".`);
    }
  });

  nodes.forEach((node, index) => validateNode(node, index));

  const participantIds = new Set(participants.map((participant) => participant.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const messageIds = new Set(messages.map((message) => message.id));

  sequenceFlows.forEach((flow, index) => validateSequenceFlow(flow, index, nodeIds));

  messageFlows.forEach((flow, index) => {
    if (!flow || typeof flow !== "object") {
      throw new Error(`Message flow at index ${index} must be an object.`);
    }

    if (!flow.id || !flow.sourceRef || !flow.targetRef || !flow.messageRef) {
      throw new Error(
        `Message flow at index ${index} must contain "id", "sourceRef", "targetRef" and "messageRef".`
      );
    }

    if (!participantIds.has(flow.sourceRef)) {
      throw new Error(`Message flow "${flow.id}" references unknown sourceRef "${flow.sourceRef}".`);
    }

    if (!participantIds.has(flow.targetRef)) {
      throw new Error(`Message flow "${flow.id}" references unknown targetRef "${flow.targetRef}".`);
    }

    if (!messageIds.has(flow.messageRef)) {
      throw new Error(`Message flow "${flow.id}" references unknown messageRef "${flow.messageRef}".`);
    }
  });

  nodes.forEach((node) => {
    if (Array.isArray(node.participantRef)) {
      node.participantRef.forEach((participantId) => {
        if (!participantIds.has(participantId)) {
          throw new Error(`Node "${node.id}" references unknown participantRef "${participantId}".`);
        }
      });
    }

    if (Array.isArray(node.messageFlowRef)) {
      node.messageFlowRef.forEach((messageFlowId) => {
        if (!messageFlows.find((flow) => flow.id === messageFlowId)) {
          throw new Error(`Node "${node.id}" references unknown messageFlowRef "${messageFlowId}".`);
        }
      });
    }

    if (node.initiatingParticipantRef && !participantIds.has(node.initiatingParticipantRef)) {
      throw new Error(
        `Node "${node.id}" references unknown initiatingParticipantRef "${node.initiatingParticipantRef}".`
      );
    }
  });
}

function validateNode(node, index) {
  if (!node || typeof node !== "object") {
    throw new Error(`Node at index ${index} must be an object.`);
  }

  if (!node.id || !node.type) {
    throw new Error(`Node at index ${index} must contain "id" and "type".`);
  }
}

function validateSequenceFlow(flow, index, nodeIds) {
  if (!flow || typeof flow !== "object") {
    throw new Error(`Sequence flow at index ${index} must be an object.`);
  }

  if (!flow.id || !flow.sourceRef || !flow.targetRef) {
    throw new Error(
      `Sequence flow at index ${index} must contain "id", "sourceRef" and "targetRef".`
    );
  }

  if (!nodeIds.has(flow.sourceRef)) {
    throw new Error(`Sequence flow "${flow.id}" references unknown sourceRef "${flow.sourceRef}".`);
  }

  if (!nodeIds.has(flow.targetRef)) {
    throw new Error(`Sequence flow "${flow.id}" references unknown targetRef "${flow.targetRef}".`);
  }
}
