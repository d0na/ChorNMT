import path from "node:path";
import { fileURLToPath } from "node:url";
import { importBpmnToNmt } from "../bpmn-builder-js/scripts/import-bpmn.js";
import { populateDataset } from "./populate-local.js";
import { summarizeNodes, writeMetrics } from "./evaluation/metrics.js";

const __filename = fileURLToPath(import.meta.url);

export async function importBpmnIntoAsset(assetAddress, bpmnPath, outputPath) {
  if (!assetAddress || !bpmnPath) {
    throw new Error("Usage: npm run import:asset -- <asset-address> <input.bpmn> [output.nmt.json]");
  }
  const startedAt = performance.now();
  const { dataset, outputPath: nmtPath } = await importBpmnToNmt(bpmnPath, outputPath);
  const importedAt = performance.now();
  const population = await populateDataset(assetAddress, dataset, path.basename(nmtPath));
  const metricsPath = await writeMetrics("import-asset", {
    assetAddress,
    sourceBpmn: bpmnPath,
    model: summarizeNodes(dataset.nodes, dataset.roles),
    blockchain: { transactions: population.costs, total: population.totalCost },
    timingsMs: { import: importedAt - startedAt, populate: performance.now() - importedAt, total: performance.now() - startedAt }
  });
  return { nmtPath, metricsPath };
}

async function main() {
  const result = await importBpmnIntoAsset(process.argv[2], process.argv[3], process.argv[4]);
  console.log(`Imported NMT dataset: ${result.nmtPath}`);
  console.log(`Stored dataset in asset: ${process.argv[2]}`);
  console.log(`Metrics: ${result.metricsPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
