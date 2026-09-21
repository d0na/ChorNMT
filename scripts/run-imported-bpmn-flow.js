import path from "node:path";
import { fileURLToPath } from "node:url";
import { importBpmnToNmt } from "../bpmn-builder-js/scripts/import-bpmn.js";
import { populateDataset } from "./populate-local.js";
import { renderAssetToBpmn } from "./render-local-support.js";

const __filename = fileURLToPath(import.meta.url);

function outputBaseName(bpmnPath) {
  return `${path.basename(bpmnPath, path.extname(bpmnPath))}-from-contract`;
}

async function main() {
  const assetAddress = process.argv[2];
  const bpmnPath = process.argv[3];

  if (!assetAddress || !bpmnPath) {
    throw new Error(
      "Usage: npm run flow:import-bpmn -- <asset-address> <input.bpmn>"
    );
  }

  const { dataset, outputPath: nmtPath } = await importBpmnToNmt(bpmnPath);
  const baseName = outputBaseName(bpmnPath);

  await populateDataset(assetAddress, dataset, path.basename(nmtPath));
  const { rawJsonPath, normalizedPath, xmlPath } = await renderAssetToBpmn({
    assetAddress,
    choreographyId: dataset.id,
    choreographyName: dataset.name,
    definitionsId: `${dataset.id}_definitions`,
    targetNamespace: "http://example.com/chornmt/import",
    outputBaseName: baseName
  });

  process.stdout.write(
    [
      `Imported NMT dataset: ${nmtPath}`,
      `Generated raw JSON: ${rawJsonPath}`,
      `Generated normalized JSON: ${normalizedPath}`,
      `Generated BPMN: ${xmlPath}`
    ].join("\n") + "\n"
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
