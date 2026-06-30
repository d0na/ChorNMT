import { BpmnModdle } from "bpmn-moddle";
import { mapInputToDefinitionsDescriptor } from "../mappers/process-mapper.js";

function isReferenceAttribute(key) {
  return (
    key === "sourceRef" ||
    key === "targetRef" ||
    key === "processRef" ||
    key === "messageRef" ||
    key === "initiatingParticipantRef"
  );
}

function isReferenceCollectionAttribute(key) {
  return (
    key === "incoming" ||
    key === "outgoing" ||
    key === "participantRef" ||
    key === "messageFlowRef"
  );
}

function createSkeleton(moddle, descriptor, references) {
  const { $type, id } = descriptor;
  const element = moddle.create($type, id ? { id } : {});

  if (id) {
    references.set(id, element);
  }

  for (const value of Object.values(descriptor)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry && typeof entry === "object" && entry.$type) {
          createSkeleton(moddle, entry, references);
        }
      });
      continue;
    }

    if (value && typeof value === "object" && value.$type) {
      createSkeleton(moddle, value, references);
    }
  }

  return element;
}

function hydrateElement(element, descriptor, references) {
  const { $type, ...attributes } = descriptor;

  for (const [key, value] of Object.entries(attributes)) {
    if (key === "id") {
      continue;
    }

    if (Array.isArray(value)) {
      element.set(
        key,
        value.map((entry) => {
          if (entry && typeof entry === "object" && entry.$type) {
            return hydrateElement(references.get(entry.id), entry, references);
          }

          return isReferenceCollectionAttribute(key) ? references.get(entry) || entry : entry;
        })
      );
      continue;
    }

    if (value && typeof value === "object" && value.$type) {
      element.set(key, hydrateElement(references.get(value.id), value, references));
      continue;
    }

    element.set(key, isReferenceAttribute(key) ? references.get(value) || value : value);
  }

  return element;
}

export async function generateBpmnXml(input) {
  const moddle = new BpmnModdle();
  const { definitions: descriptor } = mapInputToDefinitionsDescriptor(input);
  const references = new Map();
  const definitions = createSkeleton(moddle, descriptor, references);

  hydrateElement(definitions, descriptor, references);

  const { xml } = await moddle.toXML(definitions, { format: true });

  return xml;
}
