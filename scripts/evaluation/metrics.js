import fs from "node:fs/promises";
import path from "node:path";

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
