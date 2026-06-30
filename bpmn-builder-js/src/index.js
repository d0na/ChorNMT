import { generateBpmnXml as generateXmlWithModdle } from "./generators/moddle-generator.js";

export async function generateBpmnXml(input) {
  return generateXmlWithModdle(input);
}
