import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exampleName = process.argv[2] || "simple-process";
const inputPath = path.join(__dirname, "..", "example", "input", `${exampleName}.json`);
const outputPath = path.join(__dirname, "..", "example", "output", `${exampleName}.generated.bpmn.xml`);

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const xml = await generateBpmnXml(input);

await fs.writeFile(outputPath, xml, "utf8");

process.stdout.write(`Generated ${outputPath}\n`);
