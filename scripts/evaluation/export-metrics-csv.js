import fs from "node:fs/promises";
import path from "node:path";

const directory = path.join(process.cwd(), "metrics");
const outputPath = path.join(directory, "measurements.generated.csv");
const fields = ["operation", "recordedAt", "durationMs", "roles", "nodes", "tasks", "gateways", "sequenceEdges", "messages", "gasUsed", "costEth"];

export async function exportMetricsCsv() {
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".generated.json"));
  const rows = await Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(directory, file), "utf8"))));
  const csv = [fields.join(","), ...rows.map((row) => {
    const model = row.model || row.delta || {};
    const transactions = row.blockchain?.transactions || [];
    const gasUsed = transactions.reduce((sum, transaction) => sum + BigInt(transaction.gasUsed), 0n);
    return [row.operation, row.recordedAt, row.timingsMs?.total ?? "", model.roles ?? "", model.nodes ?? "", model.tasks ?? "", model.gateways ?? "", model.sequenceEdges ?? "", model.messages ?? "", gasUsed, row.blockchain?.total?.totalEth ?? ""].join(",");
  })].join("\n");
  await fs.writeFile(outputPath, `${csv}\n`);
  console.log(`Metrics CSV: ${outputPath}`);
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.url.replace("file://", "")) {
  exportMetricsCsv().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
