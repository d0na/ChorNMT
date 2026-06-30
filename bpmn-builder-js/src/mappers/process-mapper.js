import { validateInput } from "../validation.js";
import { normalizeInput } from "../normalize.js";

function buildDefinitionsId(processId) {
  return `${processId}_definitions`;
}

function buildCollaborationId(processId) {
  return `${processId}_collaboration`;
}

function buildParticipantId(processId) {
  return `${processId}_participant`;
}

function toBpmnElementType(type) {
  if (!type) {
    throw new Error('BPMN node type is required.');
  }

  return type.startsWith("bpmn:") ? type : `bpmn:${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

export function mapInputToDefinitionsDescriptor(input) {
  const normalizedInput = normalizeInput(input);
  validateInput(normalizedInput);

  if (normalizedInput.process) {
    return mapProcessInput(normalizedInput);
  }

  return mapChoreographyInput(normalizedInput);
}

function mapProcessInput(input) {
  const { process } = input;
  const processName = process.name || process.id;
  const nodes = Array.isArray(process.nodes) ? process.nodes : [];
  const sequenceFlows = Array.isArray(process.sequenceFlows) ? process.sequenceFlows : [];

  return {
    definitions: {
      $type: "bpmn:Definitions",
      id: buildDefinitionsId(process.id),
      targetNamespace: "http://example.com/bpmn-builder-js",
      rootElements: [
        {
          $type: "bpmn:Process",
          id: process.id,
          name: processName,
          isExecutable: process.isExecutable === true,
          flowElements: [
            ...nodes.map((node) => ({
              $type: toBpmnElementType(node.type),
              id: node.id,
              ...(node.name ? { name: node.name } : {}),
            })),
            ...sequenceFlows.map((flow) => ({
              $type: "bpmn:SequenceFlow",
              id: flow.id,
              sourceRef: flow.sourceRef,
              targetRef: flow.targetRef,
              ...(flow.name ? { name: flow.name } : {}),
            })),
          ],
        },
        {
          $type: "bpmn:Collaboration",
          id: buildCollaborationId(process.id),
          participants: [
            {
              $type: "bpmn:Participant",
              id: buildParticipantId(process.id),
              name: processName,
              processRef: process.id,
            },
          ],
        },
      ],
    },
  };
}

function mapChoreographyInput(input) {
  const { choreography } = input;
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const participants = Array.isArray(choreography.participants) ? choreography.participants : [];
  const nodes = Array.isArray(choreography.nodes) ? choreography.nodes : [];
  const sequenceFlows = Array.isArray(choreography.sequenceFlows) ? choreography.sequenceFlows : [];
  const messageFlows = Array.isArray(choreography.messageFlows) ? choreography.messageFlows : [];

  return {
    definitions: {
      $type: "bpmn:Definitions",
      id: input.definitions?.id || buildDefinitionsId(choreography.id),
      targetNamespace: input.definitions?.targetNamespace || "http://example.com/bpmn-builder-js",
      rootElements: [
        ...messages.map((message) => ({
          $type: "bpmn:Message",
          id: message.id,
          ...(message.name ? { name: message.name } : {}),
        })),
        {
          $type: "bpmn:Choreography",
          id: choreography.id,
          ...(choreography.name ? { name: choreography.name } : {}),
          participants: participants.map((participant) => ({
            $type: "bpmn:Participant",
            id: participant.id,
            ...(participant.name ? { name: participant.name } : {}),
          })),
          flowElements: [
            ...messageFlows.map((flow) => ({
              $type: "bpmn:MessageFlow",
              id: flow.id,
              sourceRef: flow.sourceRef,
              targetRef: flow.targetRef,
              messageRef: flow.messageRef,
            })),
            ...nodes.map((node) => mapChoreographyNode(node)),
            ...sequenceFlows.map((flow) => ({
              $type: "bpmn:SequenceFlow",
              id: flow.id,
              sourceRef: flow.sourceRef,
              targetRef: flow.targetRef,
              ...(flow.name ? { name: flow.name } : {}),
            })),
          ],
        },
      ],
    },
  };
}

function mapChoreographyNode(node) {
  return {
    $type: toBpmnElementType(node.type),
    id: node.id,
    ...(node.name ? { name: node.name } : {}),
    ...(node.initiatingParticipantRef
      ? { initiatingParticipantRef: node.initiatingParticipantRef }
      : {}),
    ...(Array.isArray(node.incoming) ? { incoming: node.incoming } : {}),
    ...(Array.isArray(node.outgoing) ? { outgoing: node.outgoing } : {}),
    ...(Array.isArray(node.participantRef) ? { participantRef: node.participantRef } : {}),
    ...(Array.isArray(node.messageFlowRef) ? { messageFlowRef: node.messageFlowRef } : {}),
  };
}
