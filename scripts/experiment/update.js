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
// The run (EXPERIMENT_REPETITIONS measured runs after a warm-up) and the policy test matrix, then
// from the evidence the sequence diagrams, the charts (gnuplot), the BPMN images (Chromium), and the
// diagram SVG (Java and Graphviz); last, docs/experiment.md, unless the run went elsewhere (--out).
const evidence = env.EVIDENCE_OUT || path.resolve("evaluation", "evidence");
const commands = [
  ["npx", "hardhat", "run", "scripts/experiment/run.js"],
  ["npx", "hardhat", "run", "scripts/test-policies.js"],
  ["node", "scripts/experiment/sequence.js"],
  ["node", "scripts/experiment/charts.js"],
  ["node", "scripts/experiment/bpmn.js"],
  ["node", "scripts/render-uml.js", "--dir", path.join(evidence, "uml")]
];
if (outIndex === -1) commands.push(["node", "scripts/experiment/protocol.js"]);
for (const command of commands) {
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit", env: { ...env, POLICY_TESTS_OUT: path.join(evidence, "tests.json") } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
