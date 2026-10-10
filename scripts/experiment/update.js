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
const result = spawnSync("npx", ["hardhat", "run", "scripts/experiment/run.js"], { stdio: "inherit", env });
process.exit(result.status ?? 1);
