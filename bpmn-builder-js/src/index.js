function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDefinitionsId(processId) {
  return `${processId}_definitions`;
}

function buildCollaborationId(processId) {
  return `${processId}_collaboration`;
}

function buildParticipantId(processId) {
  return `${processId}_participant`;
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

function renderNode(node) {
  const attributes = [`id="${escapeXml(node.id)}"`];

  if (node.name) {
    attributes.push(`name="${escapeXml(node.name)}"`);
  }

  return `    <bpmn:${node.type} ${attributes.join(" ")} />`;
}

function renderSequenceFlow(flow) {
  const attributes = [
    `id="${escapeXml(flow.id)}"`,
    `sourceRef="${escapeXml(flow.sourceRef)}"`,
    `targetRef="${escapeXml(flow.targetRef)}"`,
  ];

  if (flow.name) {
    attributes.push(`name="${escapeXml(flow.name)}"`);
  }

  return `    <bpmn:sequenceFlow ${attributes.join(" ")} />`;
}

function generateBpmnXml(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be a JSON object.");
  }

  const process = input.process;

  if (!process || typeof process !== "object") {
    throw new Error('Input must contain a "process" object.');
  }

  if (!process.id) {
    throw new Error('The "process" object must contain an "id".');
  }

  const processName = process.name || process.id;
  const isExecutable = process.isExecutable === true ? "true" : "false";
  const nodes = Array.isArray(process.nodes) ? process.nodes : [];
  const sequenceFlows = Array.isArray(process.sequenceFlows) ? process.sequenceFlows : [];

  nodes.forEach(validateNode);

  const nodeIds = new Set(nodes.map((node) => node.id));
  sequenceFlows.forEach((flow, index) => validateSequenceFlow(flow, index, nodeIds));

  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<bpmn:definitions id="${escapeXml(buildDefinitionsId(process.id))}"`,
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    '  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    '  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    '  targetNamespace="http://example.com/bpmn-builder-js">',
    `  <bpmn:process id="${escapeXml(process.id)}" name="${escapeXml(processName)}" isExecutable="${isExecutable}">`,
    ...nodes.map(renderNode),
    ...sequenceFlows.map(renderSequenceFlow),
    "  </bpmn:process>",
    `  <bpmn:collaboration id="${escapeXml(buildCollaborationId(process.id))}">`,
    `    <bpmn:participant id="${escapeXml(buildParticipantId(process.id))}" name="${escapeXml(processName)}" processRef="${escapeXml(process.id)}" />`,
    "  </bpmn:collaboration>",
    "</bpmn:definitions>",
  ];

  return `${xmlLines.join("\n")}\n`;
}

module.exports = {
  generateBpmnXml,
};
