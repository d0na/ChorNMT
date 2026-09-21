import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { deployAsset } from "../deploy-local.js";
import { importBpmnIntoAsset } from "../import-bpmn-asset.js";
import { renderAsset } from "../render-asset.js";
import { applyAssetDelta } from "../apply-asset-delta.js";
import { exportMetricsCsv } from "./export-metrics-csv.js";

const execute = promisify(execFile);
const root = process.cwd();
const bpmn = "references/paper-example.bpmn";
const delta = "scripts/data/paper-example-parallel-transport-preparation.delta.json";

async function main() {
  const startedAt = performance.now();
  const metricsDirectory = path.join(root, "metrics");
  await fs.mkdir(metricsDirectory, { recursive: true });
  for (const file of await fs.readdir(metricsDirectory)) {
    if (file.includes(".generated.")) await fs.unlink(path.join(metricsDirectory, file));
  }
  const deployment = await deployAsset();
  const imported = await importBpmnIntoAsset(deployment.assetAddress, bpmn);
  const baseline = await renderAsset(deployment.assetAddress, imported.nmtPath);
  const modified = await applyAssetDelta(deployment.assetAddress, delta, { render: false });
  const finalRender = await renderAsset(deployment.assetAddress, delta);
  const csvPath = await exportMetricsCsv();
  await fs.mkdir(path.join(root, "evaluation", "figures"), { recursive: true });
  for (const plot of ["duration-by-nodes.gp", "duration-by-edges.gp", "gas-by-changed-nodes.gp"]) {
    await execute("gnuplot", [path.join(root, "evaluation", "gnuplot", plot)]);
  }
  const summaryPath = path.join(root, "evaluation", "experiment-summary.generated.md");
  await fs.writeFile(summaryPath, [
    "# Paper example experiment summary",
    "",
    `- Asset: \`${deployment.assetAddress}\``,
    `- Total wall-clock duration: \`${(performance.now() - startedAt).toFixed(2)} ms\``,
    `- Import metrics: [${path.basename(imported.metricsPath)}](../${imported.metricsPath})`,
    `- Baseline render metrics: [${path.basename(baseline.metricsPath)}](../${baseline.metricsPath})`,
    `- Modification metrics: [${path.basename(modified.metricsPath)}](../${modified.metricsPath})`,
    `- Final render metrics: [${path.basename(finalRender.metricsPath)}](../${finalRender.metricsPath})`,
    `- Aggregated CSV: [${path.basename(csvPath)}](../${csvPath})`,
    "",
    "Generated figures: `evaluation/figures/duration-by-nodes.png`, `evaluation/figures/duration-by-edges.png`, and `evaluation/figures/gas-by-changed-nodes.png`."
  ].join("\n") + "\n");
  console.log(`Experiment summary: ${summaryPath}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
