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

    if (entry.name.endsWith(".generated.json") || entry.name.endsWith(".generated.bpmn.xml")) {
      await fs.rm(path.join(directoryPath, entry.name), { force: true });
    }
  }
}

async function main() {
  const projectRoot = path.join(__dirname, "..");
  const bpmnRoot = path.join(projectRoot, "bpmn-builder-js");

  await removeIfExists(path.join(projectRoot, "artifacts"));
  await removeIfExists(path.join(projectRoot, "cache"));
  await removeGeneratedFiles(path.join(bpmnRoot, "example", "input"));
  await removeGeneratedFiles(path.join(bpmnRoot, "example", "output"));

  console.log("Cleaned Hardhat artifacts and generated BPMN files.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
