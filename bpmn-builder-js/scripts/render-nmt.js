import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml } from "../src/index.js";
import { nmtDatasetToBpmnInput } from "../src/nmt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function renderNmtDataset(inputArg, outputArg) {
  if (!inputArg) {
    throw new Error("Usage: node ./scripts/render-nmt.js <input.nmt.json> [output.bpmn]");
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.join(
        __dirname,
        "..",
        "example",
        "output",
        `${path.basename(inputPath).replace(/\.nmt\.json$/i, "")}.generated.bpmn.xml`
      );
  const dataset = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const xml = await generateBpmnXml(nmtDatasetToBpmnInput(dataset));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, xml, "utf8");
  process.stdout.write(`Rendered BPMN to ${outputPath}\n`);
  return { outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  renderNmtDataset(process.argv[2], process.argv[3]).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
