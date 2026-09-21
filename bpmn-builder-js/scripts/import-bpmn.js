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

function nameOf(element, label) {
  const name = element?.name?.trim() || element?.id;
  if (!name) {
    throw new Error(`${label} must have an id or name.`);
  }
  return name;
}

function nodeTypeOf(element) {
  const nodeType = BPMN_NODE_TYPE_TO_NMT_TYPE[element.$type];
  if (nodeType === undefined) {
    throw new Error(`Unsupported BPMN flow element "${element.$type}" (${element.id}).`);
  }
  return nodeType;
}

function messageName(flow) {
  return flow.messageRef?.name?.trim() || flow.messageRef?.id || flow.name?.trim() || flow.id;
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

  const elements = choreography.flowElements || [];
  const nodeNames = new Map();
  elements.forEach((element) => {
    if (BPMN_NODE_TYPE_TO_NMT_TYPE[element.$type] !== undefined) {
      const name = nameOf(element, "Flow element");
      if ([...nodeNames.values()].includes(name)) {
        throw new Error(`Flow element name "${name}" is not unique.`);
      }
      nodeNames.set(element.id, name);
    }
  });

  const messageFlows = new Map((choreography.messageFlows || []).map((flow) => [flow.id, flow]));
  const nodes = elements
    .filter((element) => BPMN_NODE_TYPE_TO_NMT_TYPE[element.$type] !== undefined)
    .map((element) => {
      const nodeType = nodeTypeOf(element);
      const name = nodeNames.get(element.id);
      const outgoing = (element.outgoing || []).map((flow) => nodeNames.get(flow.targetRef?.id)).filter(Boolean);
      const incoming = (element.incoming || []).map((flow) => nodeNames.get(flow.sourceRef?.id)).filter(Boolean);
      const node = {
        name,
        nodeType,
        incoming,
        outgoing,
        conditions: (element.outgoing || []).map((flow) => flow.name || "")
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
