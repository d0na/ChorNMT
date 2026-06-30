import { generateBpmnXml as generateXmlWithModdle } from "./generators/moddle-generator.js";
import { normalizeInput } from "./normalize.js";

export async function generateBpmnXml(input) {
  return generateXmlWithModdle(normalizeInput(input));
}

export { normalizeInput };
