import fs from "node:fs/promises";
import path from "node:path";

export const GAS_PRICE_SCENARIOS = [10, 30, 100];

export async function resolveEthUsdPrice() {
  if (Number(process.env.ETH_USD_PRICE) > 0) return Number(process.env.ETH_USD_PRICE);
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(5000) });
    const payload = await response.json();
    return Number(payload.data.amount) || null;
  } catch {
    return null;
  }
}

export function scenarioUsd(gasUsed, ethUsdPrice) {
  return GAS_PRICE_SCENARIOS.map((gwei) => {
    if (!ethUsdPrice) return "N/A";
    return `$${(Number(gasUsed) * gwei / 1e9 * ethUsdPrice).toFixed(4)}`;
  });
}

export function summarizeNodes(nodes = [], roles = []) {
  const tasks = nodes.filter((node) => node.nodeType === 2);
  return {
    roles: roles.length,
    nodes: nodes.length,
    tasks: tasks.length,
    gateways: nodes.filter((node) => node.nodeType >= 3 && node.nodeType <= 7).length,
    sequenceEdges: nodes.reduce((total, node) => total + (node.outgoing?.length || 0), 0),
    messages: tasks.reduce((total, node) => total + Number(Boolean(node.initiatingMessage)) + Number(Boolean(node.returnMessage)), 0)
  };
}

export async function writeMetrics(operation, measurement) {
  const directory = path.join(process.cwd(), "metrics");
  await fs.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(directory, `${stamp}-${operation}.generated.json`);
  await fs.writeFile(outputPath, `${JSON.stringify({ operation, recordedAt: new Date().toISOString(), ...measurement }, null, 2)}\n`);
  console.log(`Metrics report: ${outputPath}`);
  return outputPath;
}
