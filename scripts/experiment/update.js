// npm run evidence:update [-- --out <dir>]: runs the experiment on an ephemeral Hardhat network
// and writes the evidence to evaluation/evidence/, or to <dir> for an exploratory run.
import { spawnSync } from "node:child_process";
import path from "node:path";

const outIndex = process.argv.indexOf("--out");
if (outIndex !== -1 && !process.argv[outIndex + 1]) {
  console.error("Usage: npm run evidence:update [-- --out <dir>]");
  process.exit(1);
}
const env = { ...process.env };
if (outIndex !== -1) env.EVIDENCE_OUT = path.resolve(process.argv[outIndex + 1]);
// The run, then the sequence diagrams generated from its traces, then their SVG (Java and Graphviz).
const evidence = env.EVIDENCE_OUT || path.resolve("evaluation", "evidence");
for (const command of [
  ["npx", "hardhat", "run", "scripts/experiment/run.js"],
  ["node", "scripts/experiment/sequence.js"],
  ["node", "scripts/render-uml.js", "--dir", path.join(evidence, "uml")]
]) {
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
