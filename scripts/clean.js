import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function removeGeneratedFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (
      entry.name.endsWith(".generated.json") ||
      entry.name.endsWith(".generated.csv") ||
      entry.name.endsWith(".generated.md") ||
      entry.name.endsWith(".generated.bpmn.xml") ||
      entry.name.endsWith(".generated.png")
    ) {
      await fs.rm(path.join(directoryPath, entry.name), { force: true });
    }
  }
}

async function main() {
  const projectRoot = path.join(__dirname, "..");
  const bpmnRoot = path.join(projectRoot, "bpmn-builder-js");

  await removeIfExists(path.join(projectRoot, "artifacts"));
  await removeIfExists(path.join(projectRoot, "cache"));
  await removeGeneratedFiles(path.join(projectRoot, "metrics"));
  await removeGeneratedFiles(path.join(projectRoot, "evaluation"));
  await removeIfExists(path.join(projectRoot, "evaluation", "figures"));
  await removeGeneratedFiles(path.join(bpmnRoot, "example", "contract"));
  await removeGeneratedFiles(path.join(bpmnRoot, "example", "input"));
  await removeGeneratedFiles(path.join(bpmnRoot, "example", "output"));

  console.log("Cleaned Hardhat artifacts, generated BPMN files, evaluation reports, and metrics.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
