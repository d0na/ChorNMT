import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { deployAsset } from "../deploy-local.js";
import { importBpmnIntoAsset } from "../import-bpmn-asset.js";
import { renderAsset } from "../render-asset.js";
import { applyAssetDelta } from "../apply-asset-delta.js";
import { populateDataset } from "../populate-local.js";
import { exportMetricsCsv } from "./export-metrics-csv.js";
import { renderBpmnImages } from "./render-bpmn-images.js";
import { resolveEthUsdPrice, scenarioUsd } from "./metrics.js";

const execute = promisify(execFile);
const root = process.cwd();
const bpmn = "references/paper-example.bpmn";
const delta = "scripts/data/paper-example-parallel-transport-preparation.delta.json";

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
  const baselineImage = await renderBpmnImages({
    xmlPath: baseline.xmlPath,
    outputBaseName: "paper-example-baseline"
  });
  const finalImage = await renderBpmnImages({
    xmlPath: finalRender.xmlPath,
    outputBaseName: "paper-example-final"
  });
  const baselineDataset = JSON.parse(await fs.readFile(imported.nmtPath, "utf8"));
  const deltaDataset = JSON.parse(await fs.readFile(path.join(root, delta), "utf8"));
  const finalNodes = new Map(baselineDataset.nodes.map((node) => [node.name, node]));
  deltaDataset.nodes.forEach((node) => finalNodes.set(node.name, node));
  const fullPopulationDeployment = await deployAsset();
  const fullPopulation = await populateDataset(fullPopulationDeployment.assetAddress, {
    ...baselineDataset,
    nodes: [...finalNodes.values()]
  }, "paper-example-final-full");
  const csvPath = await exportMetricsCsv();
  const readMetric = async (result) => JSON.parse(await fs.readFile(result.metricsPath, "utf8"));
  const importMetric = await readMetric(imported);
  const baselineMetric = await readMetric(baseline);
  const modifyMetric = await readMetric(modified);
  const finalMetric = await readMetric(finalRender);
  const resultsPath = path.join(root, "evaluation", "experiment-results.generated.csv");
  const deploymentGas = deployment.costs.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n);
  const scenarioCosts = [10, 30, 100].map((gwei) => {
    const eth = Number(deploymentGas) * gwei / 1e9;
    return { gwei, eth, usd: ethUsdPrice ? eth * ethUsdPrice : null };
  });
  const deltaGas = modifyMetric.blockchain.transactions.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n);
  const fullGas = fullPopulation.costs.reduce((sum, cost) => sum + BigInt(cost.gasUsed), 0n);
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
    "## Generated BPMN",
    "",
    `- Baseline BPMN from the asset: [${path.basename(baseline.xmlPath)}](${relativeToSummary(baseline.xmlPath)})`,
    `- Final BPMN after the delta: [${path.basename(finalRender.xmlPath)}](${relativeToSummary(finalRender.xmlPath)})`,
    `- Baseline image: [SVG](${relativeToSummary(baselineImage.svgPath)}) · [PNG](${relativeToSummary(baselineImage.pngPath)})`,
    `- Final image: [SVG](${relativeToSummary(finalImage.svgPath)}) · [PNG](${relativeToSummary(finalImage.pngPath)})`,
    "",
    "The BPMN 2.0 XML and its SVG/PNG images are generated from the asset state. SVG preserves vector quality for publication; PNG is embedded below for immediate inspection.",
    "",
    "### Baseline model",
    "",
    `![Baseline BPMN](${relativeToSummary(baselineImage.pngPath)})`,
    "",
    "### Model after delta",
    "",
    `![Final BPMN](${relativeToSummary(finalImage.pngPath)})`,
    "",
    "## Deployment and mint costs",
    "",
    "| Transaction | Smart contract / asset | Address | Gas | ETH cost | USD @10 gwei | USD @30 gwei | USD @100 gwei |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...[[deployment.costs[0], "MasterSmartPolicy", deployment.masterPolicyAddress], [deployment.costs[1], "CreatorSmartPolicy", deployment.creatorPolicyAddress], [deployment.costs[2], "HolderSmartPolicy", deployment.holderPolicyAddress], [deployment.costs[3], "ChoreographyTokenURIRenderer", deployment.rendererAddress], [deployment.costs[4], "ChoreographyNMT", deployment.choreographyNmtAddress], [deployment.costs[5], "ChoreographyMutableAsset (mint)", deployment.assetAddress]].map(([cost, name, address]) => `| ${cost.label} | ${name} | \`${address}\` | ${cost.gasUsed} | ${cost.costEth} | ${scenarioUsd(cost.gasUsed, ethUsdPrice).join(" | ")} |`),
    `| **Deployment and mint total** | — | — | **${deploymentGas}** | **${deployment.totalCost.totalEth}** | **${scenarioUsd(deploymentGas, ethUsdPrice).join(" | ")}** |`,
    "| Transfer asset | Not executed in this experiment | — | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |",
    "",
    "## Delta update versus full model population",
    "",
    "Deployment cost is excluded: this comparison measures only the model-write transactions.",
    "",
    "| Strategy | Gas used | ETH cost | USD @10 gwei | USD @30 gwei | USD @100 gwei | Relative gas saving |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| Delta update (${deltaDataset.nodes.length} changed nodes) | ${deltaGas} | ${modifyMetric.blockchain.total.totalEth} | ${scenarioUsd(deltaGas, ethUsdPrice).join(" | ")} | ${((1 - Number(deltaGas) / Number(fullGas)) * 100).toFixed(2)}% |`,
    `| Full population (${finalNodes.size} nodes) | ${fullGas} | ${fullPopulation.totalCost.totalEth} | ${scenarioUsd(fullGas, ethUsdPrice).join(" | ")} | 0.00% |`,
    "",
    "## Estimated deployment and mint cost under public-network gas-price scenarios",
    "",
    "These estimates reuse the measured deployment-and-mint gas, but replace the local Hardhat gas price with representative public-network scenarios.",
    "",
    "| Network condition | Gas price | Meaning | Deployment + mint gas | Estimated ETH cost | Estimated USD cost |",
    "| --- | ---: | --- | ---: | ---: | ---: |",
    ...scenarioCosts.map((scenario) => `| ${scenario.gwei === 10 ? "Low congestion" : scenario.gwei === 30 ? "Typical congestion" : "High congestion"} | ${scenario.gwei} gwei | ${scenario.gwei === 10 ? "Low demand; transactions are usually inexpensive" : scenario.gwei === 30 ? "Ordinary public-network demand" : "High demand; users pay more to be included sooner"} | ${deploymentGas} | ${scenario.eth.toFixed(6)} | ${scenario.usd === null ? "N/A" : `$${scenario.usd.toFixed(2)}`} |`),
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
