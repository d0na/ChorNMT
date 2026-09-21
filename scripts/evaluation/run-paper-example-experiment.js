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

async function resolveEthUsdPrice() {
  if (Number(process.env.ETH_USD_PRICE) > 0) return Number(process.env.ETH_USD_PRICE);
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(5000) });
    const payload = await response.json();
    return Number(payload.data.amount) || null;
  } catch {
    return null;
  }
}

async function main() {
  const startedAt = performance.now();
  const ethUsdPrice = await resolveEthUsdPrice();
  if (ethUsdPrice) process.env.ETH_USD_PRICE = String(ethUsdPrice);
  const metricsDirectory = path.join(root, "metrics");
  await fs.mkdir(metricsDirectory, { recursive: true });
  for (const file of await fs.readdir(metricsDirectory)) {
    if (file.includes(".generated.")) await fs.unlink(path.join(metricsDirectory, file));
  }
  const deployStartedAt = performance.now();
  const deployment = await deployAsset();
  const deployDurationMs = performance.now() - deployStartedAt;
  const imported = await importBpmnIntoAsset(deployment.assetAddress, bpmn);
  const baseline = await renderAsset(deployment.assetAddress, imported.nmtPath);
  const modified = await applyAssetDelta(deployment.assetAddress, delta, { render: false });
  const finalRender = await renderAsset(deployment.assetAddress, delta);
  const csvPath = await exportMetricsCsv();
  const readMetric = async (result) => JSON.parse(await fs.readFile(result.metricsPath, "utf8"));
  const importMetric = await readMetric(imported);
  const baselineMetric = await readMetric(baseline);
  const modifyMetric = await readMetric(modified);
  const finalMetric = await readMetric(finalRender);
  const resultsPath = path.join(root, "evaluation", "experiment-results.generated.csv");
  const rows = [
    ["deploy", deployDurationMs, deployment.costs.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n), deployment.totalCost.totalEth, "", "", "", ""],
    ["import", importMetric.timingsMs.total, importMetric.blockchain.transactions.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n), importMetric.blockchain.total.totalEth, importMetric.model.nodes, importMetric.model.sequenceEdges, importMetric.model.gateways, importMetric.model.messages],
    ["baseline-render", baselineMetric.timingsMs.total, 0, 0, baselineMetric.model.nodes, baselineMetric.model.sequenceEdges, baselineMetric.model.gateways, baselineMetric.model.messages],
    ["modify", modifyMetric.timingsMs.total, modifyMetric.blockchain.transactions.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n), modifyMetric.blockchain.total.totalEth, modifyMetric.delta.nodes, modifyMetric.delta.sequenceEdges, modifyMetric.delta.gateways, modifyMetric.delta.messages],
    ["final-render", finalMetric.timingsMs.total, 0, 0, finalMetric.model.nodes, finalMetric.model.sequenceEdges, finalMetric.model.gateways, finalMetric.model.messages]
  ];
  await fs.writeFile(resultsPath, `phase,durationMs,gasUsed,costEth,nodes,edges,gateways,messages\n${rows.map((row) => row.join(",")).join("\n")}\n`);
  await fs.writeFile(
    path.join(root, "evaluation", "model-structure.generated.csv"),
    `model,nodes,edges,gateways,messages\nbaseline,${baselineMetric.model.nodes},${baselineMetric.model.sequenceEdges},${baselineMetric.model.gateways},${baselineMetric.model.messages}\nafter-delta,${finalMetric.model.nodes},${finalMetric.model.sequenceEdges},${finalMetric.model.gateways},${finalMetric.model.messages}\n`
  );
  await fs.mkdir(path.join(root, "evaluation", "figures"), { recursive: true });
  for (const plot of ["phase-duration.gp", "phase-gas.gp", "model-comparison.gp"]) {
    await execute("gnuplot", [path.join(root, "evaluation", "gnuplot", plot)]);
  }
  const summaryPath = path.join(root, "evaluation", "experiment-summary.generated.md");
  const relativeToSummary = (targetPath) => path.relative(path.dirname(summaryPath), targetPath);
  const tableCell = (value) => value === "" || value === undefined ? "—" : value;
  await fs.writeFile(summaryPath, [
    "# Paper example experiment summary",
    "",
    `- Asset: \`${deployment.assetAddress}\``,
    `- Total wall-clock duration: \`${(performance.now() - startedAt).toFixed(2)} ms\``,
    `- ETH/USD price used: ${ethUsdPrice ? `$${ethUsdPrice.toFixed(2)}` : "not available"}`,
    `- Import metrics: [${path.basename(imported.metricsPath)}](${relativeToSummary(imported.metricsPath)})`,
    `- Baseline render metrics: [${path.basename(baseline.metricsPath)}](${relativeToSummary(baseline.metricsPath)})`,
    `- Modification metrics: [${path.basename(modified.metricsPath)}](${relativeToSummary(modified.metricsPath)})`,
    `- Final render metrics: [${path.basename(finalRender.metricsPath)}](${relativeToSummary(finalRender.metricsPath)})`,
    `- Aggregated CSV: [${path.basename(csvPath)}](${relativeToSummary(csvPath)})`,
    "",
    "## Deployment and mint costs",
    "",
    "| Transaction | Smart contract / asset | Address | Gas | ETH cost | USD cost |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...[[deployment.costs[0], "CreatorSmartPolicy", deployment.creatorPolicyAddress], [deployment.costs[1], "HolderSmartPolicy", deployment.holderPolicyAddress], [deployment.costs[2], "ChoreographyNMT", deployment.choreographyNmtAddress], [deployment.costs[3], "ChoreographyMutableAsset (mint)", deployment.assetAddress]].map(([cost, name, address]) => `| ${cost.label} | ${name} | \`${address}\` | ${cost.gasUsed} | ${cost.costEth} | ${cost.costUsd === null ? "N/A" : `$${cost.costUsd.toFixed(4)}`} |`),
    `| **Deployment and mint total** | — | — | **${deployment.costs.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n)}** | **${deployment.totalCost.totalEth}** | **${ethUsdPrice ? `$${(Number(deployment.totalCost.totalEth) * ethUsdPrice).toFixed(4)}` : "N/A"}** |`,
    "| Transfer asset | Not executed in this experiment | — | Not applicable | Not applicable | Not applicable |",
    "",
    "## Phase measurements",
    "",
    "| Phase | Duration (ms) | Gas | ETH cost | Nodes | Edges | Gateways | Messages |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row[0]} | ${Number(row[1]).toFixed(2)} | ${row[2]} | ${row[3]} | ${tableCell(row[4])} | ${tableCell(row[5])} | ${tableCell(row[6])} | ${tableCell(row[7])} |`),
    "",
    `Experiment CSV: [${path.basename(resultsPath)}](${relativeToSummary(resultsPath)})`,
    "",
    "## Figures",
    "",
    "![Duration by phase](figures/phase-duration.png)",
    "",
    "![Gas by phase](figures/phase-gas.png)",
    "",
    "![Model comparison](figures/model-comparison.png)"
  ].join("\n") + "\n");
  console.log(`Experiment summary: ${summaryPath}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
