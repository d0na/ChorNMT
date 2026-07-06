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

function isEventNode(node) {
  return node.type === "startEvent" || node.type === "endEvent";
}

function isGatewayNode(node) {
  return node.type === "parallelGateway" || node.type === "exclusiveGateway" || node.type === "eventBasedGateway";
}

function nodeSize(node) {
  if (isEventNode(node)) {
    return { width: 36, height: 36 };
  }

  if (isGatewayNode(node)) {
    return { width: 50, height: 50 };
  }

  return { width: 100, height: 80 };
}

function centerOf(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function roundPoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

function buildLayout(nodes, sequenceFlows) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingByNodeId = new Map(nodes.map((node) => [node.id, []]));
  const incomingByNodeId = new Map(nodes.map((node) => [node.id, []]));

  sequenceFlows.forEach((flow) => {
    outgoingByNodeId.get(flow.sourceRef)?.push(flow);
    incomingByNodeId.get(flow.targetRef)?.push(flow);
  });

  const ranks = new Map();
  const visiting = new Set();

  function rankNode(nodeId) {
    if (ranks.has(nodeId)) {
      return ranks.get(nodeId);
    }

    if (visiting.has(nodeId)) {
      return 0;
    }

    visiting.add(nodeId);
    const incoming = incomingByNodeId.get(nodeId) || [];
    const rank = incoming.length === 0
      ? 0
      : Math.max(...incoming.map((flow) => rankNode(flow.sourceRef) + 1));
    visiting.delete(nodeId);
    ranks.set(nodeId, rank);
    return rank;
  }

  nodes.forEach((node) => rankNode(node.id));

  const nodesByRank = new Map();
  nodes.forEach((node) => {
    const rank = ranks.get(node.id) || 0;
    const levelNodes = nodesByRank.get(rank) || [];
    levelNodes.push(node);
    nodesByRank.set(rank, levelNodes);
  });

  const boundsByNodeId = new Map();
  const startX = 252;
  const startY = 368;
  const rankGap = 150;
  const branchGap = 180;

  [...nodesByRank.entries()].forEach(([rank, levelNodes]) => {
    levelNodes.forEach((node, index) => {
      const size = nodeSize(node);
      const center = {
        x: startX + rank * rankGap,
        y: startY + (index - (levelNodes.length - 1) / 2) * branchGap
      };

      boundsByNodeId.set(node.id, {
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height
      });
    });
  });

  return { boundsByNodeId, nodeById, outgoingByNodeId, incomingByNodeId };
}

function createBounds(bounds) {
  return {
    $type: "dc:Bounds",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function createPoint(point) {
  return {
    $type: "dc:Point",
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

function edgeWaypoints(flow, layout) {
  const sourceBounds = layout.boundsByNodeId.get(flow.sourceRef);
  const targetBounds = layout.boundsByNodeId.get(flow.targetRef);
  const sourceNode = layout.nodeById.get(flow.sourceRef);
  const targetNode = layout.nodeById.get(flow.targetRef);

  if (!sourceBounds || !targetBounds) {
    return [];
  }

  const sourceCenter = centerOf(sourceBounds);
  const targetCenter = centerOf(targetBounds);

  if (Math.round(sourceCenter.y) === Math.round(targetCenter.y)) {
    return [
      createPoint({ x: sourceBounds.x + sourceBounds.width, y: sourceCenter.y }),
      createPoint({ x: targetBounds.x, y: targetCenter.y })
    ];
  }

  if (sourceNode && isGatewayNode(sourceNode)) {
    const sourceY = targetCenter.y < sourceCenter.y ? sourceBounds.y : sourceBounds.y + sourceBounds.height;
    return [
      createPoint({ x: sourceCenter.x, y: sourceY }),
      createPoint({ x: sourceCenter.x, y: targetCenter.y }),
      createPoint({ x: targetBounds.x, y: targetCenter.y })
    ];
  }

  if (targetNode && isGatewayNode(targetNode)) {
    const targetY = sourceCenter.y < targetCenter.y ? targetBounds.y : targetBounds.y + targetBounds.height;
    return [
      createPoint({ x: sourceBounds.x + sourceBounds.width, y: sourceCenter.y }),
      createPoint({ x: targetCenter.x, y: sourceCenter.y }),
      createPoint({ x: targetCenter.x, y: targetY })
    ];
  }

  const midX = Math.round((sourceBounds.x + sourceBounds.width + targetBounds.x) / 2);
  return [
    createPoint({ x: sourceBounds.x + sourceBounds.width, y: sourceCenter.y }),
    createPoint({ x: midX, y: sourceCenter.y }),
    createPoint({ x: midX, y: targetCenter.y }),
    createPoint({ x: targetBounds.x, y: targetCenter.y })
  ];
}

function participantBandShapes(node, bounds, messageFlowById) {
  if (!Array.isArray(node.participantRef) || node.participantRef.length === 0) {
    return [];
  }

  const taskShapeId = `${node.id}_di`;
  const bandHeight = 20;

  return node.participantRef.slice(0, 2).map((participantId, index) => {
    const isTop = index === 0;
    const isInitiating = participantId === node.initiatingParticipantRef;
    const messageVisible = Array.isArray(node.messageFlowRef) && node.messageFlowRef.some((messageFlowId) => {
      const messageFlow = messageFlowById.get(messageFlowId);
      return messageFlow?.sourceRef === participantId;
    });

    return {
      $type: "bpmndi:BPMNShape",
      id: `${node.id}_${participantId}_band_di`,
      bpmnElement: participantId,
      isMessageVisible: messageVisible,
      participantBandKind: `${isTop ? "top" : "bottom"}_${isInitiating ? "initiating" : "non_initiating"}`,
      choreographyActivityShape: taskShapeId,
      bounds: createBounds({
        x: bounds.x,
        y: isTop ? bounds.y : bounds.y + bounds.height - bandHeight,
        width: bounds.width,
        height: bandHeight
      })
    };
  });
}

function buildChoreographyDiagram(choreography, nodes, sequenceFlows, messageFlows) {
  const layout = buildLayout(nodes, sequenceFlows);
  const messageFlowById = new Map(messageFlows.map((flow) => [flow.id, flow]));
  const planeElements = [];

  nodes.forEach((node) => {
    const bounds = layout.boundsByNodeId.get(node.id);
    if (!bounds) {
      return;
    }

    planeElements.push({
      $type: "bpmndi:BPMNShape",
      id: `${node.id}_di`,
      bpmnElement: node.id,
      bounds: createBounds(bounds)
    });

    planeElements.push(...participantBandShapes(node, bounds, messageFlowById));
  });

  sequenceFlows.forEach((flow) => {
    planeElements.push({
      $type: "bpmndi:BPMNEdge",
      id: `${flow.id}_di`,
      bpmnElement: flow.id,
      waypoint: edgeWaypoints(flow, layout)
    });
  });

  return {
    $type: "bpmndi:BPMNDiagram",
    id: "BPMNDiagram_1",
    plane: {
      $type: "bpmndi:BPMNPlane",
      id: `BPMNPlane_${choreography.id}`,
      bpmnElement: choreography.id,
      planeElement: planeElements
    },
    labelStyle: [
      {
        $type: "bpmndi:BPMNLabelStyle",
        id: "BPMNLabelStyle_1",
        font: {
          $type: "dc:Font",
          name: "arial",
          size: 9
        }
      }
    ]
  };
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
      diagrams: [
        buildChoreographyDiagram(choreography, nodes, sequenceFlows, messageFlows)
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
