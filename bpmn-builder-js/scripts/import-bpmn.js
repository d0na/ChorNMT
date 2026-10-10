import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BpmnModdle } from "bpmn-moddle";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BPMN_NODE_TYPE_TO_NMT_TYPE = {
  "bpmn:StartEvent": 0,
  "bpmn:EndEvent": 1,
  "bpmn:ChoreographyTask": 2,
  "bpmn:ExclusiveGateway": 3,
  "bpmn:ParallelGateway": 5,
  "bpmn:EventBasedGateway": 7
};

const SPLIT_TO_JOIN_NMT_TYPE = { 3: 4, 5: 6 };

function nameOf(element, label) {
  const name = element?.name?.trim() || element?.id;
  if (!name) {
    throw new Error(`${label} must have an id or name.`);
  }
  return name;
}

function baseNodeTypeOf(element) {
  const nodeType = BPMN_NODE_TYPE_TO_NMT_TYPE[element.$type];
  if (nodeType === undefined) {
    throw new Error(`Unsupported BPMN flow element "${element.$type}" (${element.id}).`);
  }
  return nodeType;
}

function nodeTypeOf(element, incomingCount, outgoingCount) {
  const nodeType = baseNodeTypeOf(element);
  const joinType = SPLIT_TO_JOIN_NMT_TYPE[nodeType];
  const converging =
    element.gatewayDirection === "Converging" ||
    (element.gatewayDirection !== "Diverging" && incomingCount > 1 && outgoingCount <= 1);
  return joinType !== undefined && converging ? joinType : nodeType;
}

// Sequence flows are the source of truth for edges: the <incoming>/<outgoing>
// children of a flow node are optional in BPMN. Their order is kept when present.
function orderedFlows(declared, flows) {
  const ordered = (declared || []).filter((flow) => flows.includes(flow));
  flows.forEach((flow) => {
    if (!ordered.includes(flow)) ordered.push(flow);
  });
  return ordered;
}

function messageName(flow) {
  return flow.messageRef?.name?.trim() || flow.name?.trim() || flow.messageRef?.id || flow.id;
}

function roleForParticipant(participant, participantNames) {
  const role = participantNames.get(participant?.id);
  if (!role) {
    throw new Error(`Message or task references an unknown participant "${participant?.id || ""}".`);
  }
  return role;
}

function toNmtDataset(choreography, sourcePath) {
  const participants = choreography.participants || [];
  const participantNames = new Map();
  const roles = participants.map((participant) => {
    const role = nameOf(participant, "Participant");
    if ([...participantNames.values()].includes(role)) {
      throw new Error(`Participant name "${role}" is not unique.`);
    }
    participantNames.set(participant.id, role);
    return role;
  });

  const flowElements = choreography.flowElements || [];
  const sequenceFlows = flowElements.filter((element) => element.$type === "bpmn:SequenceFlow");
  const elements = flowElements.filter((element) => element.$type !== "bpmn:SequenceFlow");
  const nodeNames = new Map();
  elements.forEach((element) => {
    baseNodeTypeOf(element);
    const name = nameOf(element, "Flow element");
    if ([...nodeNames.values()].includes(name)) {
      throw new Error(`Flow element name "${name}" is not unique.`);
    }
    nodeNames.set(element.id, name);
  });
  sequenceFlows.forEach((flow) => {
    if (!nodeNames.has(flow.sourceRef?.id) || !nodeNames.has(flow.targetRef?.id)) {
      throw new Error(`Sequence flow "${flow.id}" must connect two supported flow elements.`);
    }
  });

  const messageFlows = new Map((choreography.messageFlows || []).map((flow) => [flow.id, flow]));
  const nodes = elements
    .map((element) => {
      const outgoingFlows = orderedFlows(element.outgoing, sequenceFlows.filter((flow) => flow.sourceRef.id === element.id));
      const incomingFlows = orderedFlows(element.incoming, sequenceFlows.filter((flow) => flow.targetRef.id === element.id));
      const nodeType = nodeTypeOf(element, incomingFlows.length, outgoingFlows.length);
      const name = nodeNames.get(element.id);
      const node = {
        name,
        nodeType,
        incoming: incomingFlows.map((flow) => nodeNames.get(flow.sourceRef.id)),
        outgoing: outgoingFlows.map((flow) => nodeNames.get(flow.targetRef.id)),
        conditions: outgoingFlows.map((flow) => flow.name || "")
      };

      if (element.$type !== "bpmn:ChoreographyTask") {
        return { ...node, initiatorRole: "", participantRole: "", initiatingMessage: "", returnMessage: "" };
      }

      const initiatorRole = roleForParticipant(element.initiatingParticipantRef, participantNames);
      const taskRoles = (element.participantRef || []).map((participant) => roleForParticipant(participant, participantNames));
      const participantRole = taskRoles.find((role) => role !== initiatorRole);
      if (!participantRole) {
        throw new Error(`Choreography task "${name}" must contain an initiating and a second participant.`);
      }

      let initiatingMessage = "";
      let returnMessage = "";
      (element.messageFlowRef || []).forEach((reference) => {
        const flow = messageFlows.get(reference.id) || reference;
        const sourceRole = roleForParticipant(flow.sourceRef, participantNames);
        const targetRole = roleForParticipant(flow.targetRef, participantNames);
        const message = messageName(flow);
        if (sourceRole === initiatorRole && targetRole === participantRole) {
          initiatingMessage = message;
        } else if (sourceRole === participantRole && targetRole === initiatorRole) {
          returnMessage = message;
        }
      });

      return { ...node, initiatorRole, participantRole, initiatingMessage, returnMessage };
    });

  return {
    schemaVersion: "1.0",
    id: choreography.id || "ImportedChoreography",
    name: choreography.name || path.basename(sourcePath, path.extname(sourcePath)),
    sourceBpmn: sourcePath,
    roles,
    nodes
  };
}

export async function importBpmnToNmt(inputArg, outputArg) {
  if (!inputArg) {
    throw new Error("Usage: node ./scripts/import-bpmn.js <input.bpmn> [output.nmt.json]");
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const defaultName = `${path.basename(inputPath, path.extname(inputPath))}.nmt.json`;
  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.join(__dirname, "..", "example", "input", defaultName);
  const xml = await fs.readFile(inputPath, "utf8");
  const moddle = new BpmnModdle();
  const { rootElement, warnings } = await moddle.fromXML(xml);
  const choreography = (rootElement.rootElements || []).find((element) => element.$type === "bpmn:Choreography");

  if (!choreography) {
    throw new Error("The BPMN file does not contain a bpmn:Choreography root element.");
  }
  if (warnings.length > 0) {
    process.stderr.write(`Imported with ${warnings.length} BPMN warning(s).\n`);
  }

  const dataset = toNmtDataset(choreography, inputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  process.stdout.write(`Imported NMT dataset to ${outputPath}\n`);
  return { dataset, outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  importBpmnToNmt(process.argv[2], process.argv[3]).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
