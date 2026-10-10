import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const METRICS_DIR = path.join(ROOT, "metrics");
const CONTRACTS_DIR = path.join(ROOT, "contracts");

// Metrics written by `npm run test:policies` and `npm run evaluate:policies`.
const SOURCES = {
  tests: "policy-tests",
  lifecycle: "policy-lifecycle",
};

// Structural Creator denials on setNodes in scripts/test-policies.js.
const STRUCTURAL_DENIALS = [
  "creator policy denies a flow declared on one endpoint",
  "creator policy denies task count above limit",
  "creator policy denies sequence flow count above limit",
  "creator policy denies task outside name allowlist",
  "creator policy denies flow to unknown node",
  "creator policy denies protected node update",
  "creator policy denies flow from unknown node",
  "creator policy denies unlinking protected node",
  "creator policy denies new link to protected node",
];

// Current gas figures quoted in the docs. `text` is the doc text with `{gas}` where each
// figure stands; `gas` returns the measured values in the same order. Historical before/after
// figures (in decisions, applied optimizations) are not listed: they record a past measurement.
const FIGURES = [
  {
    doc: "docs/choreography-policies.md",
    text: "| Deploy the paper-example model contract (once per type) | {gas} |",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "deploy paper-example model (SSTORE2)")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "| Mint a paper-example instance, born with the model | {gas} |",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "mint paper-example instance")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "| Link its five role accounts (`setRoles`) | {gas} |",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "holder assigns the role accounts")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "| Mint a three-node test instance | {gas} |",
    gas: ({ tests }) => [gasOf(tests, "authorized creator mints eligible holder")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "an allowed constrained update (three whole nodes) used {gas} gas",
    gas: ({ tests }) => [gasOf(tests, "creator policy allows approved task within limits")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "structural deny paths used {gas}--{gas} gas",
    gas: ({ tests }) => {
      const values = STRUCTURAL_DENIALS.map((label) => gasOf(tests, label));
      return [Math.min(...values), Math.max(...values)];
    },
  },
  {
    doc: "docs/choreography-policies.md",
    text: "the paper delta used {gas} gas",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "creator permits paper-example BPMN delta")],
  },
  {
    doc: "docs/decisions.md",
    text: "costs the model contract once ({gas} gas for the paper example)",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "deploy paper-example model (SSTORE2)")],
  },
  {
    doc: "docs/future-improvements.md",
    text: "Part of the paper mint ({gas} gas measured)",
    gas: ({ lifecycle }) => [gasOf(lifecycle, "mint paper-example instance")],
  },
];

function gasOf(metrics, label) {
  const entry = metrics.cases.find((candidate) => candidate.label === label);
  if (!entry) {
    throw new Error(`No measured case "${label}" in ${metrics.file}; update FIGURES in scripts/check-gas.js.`);
  }
  return Number(entry.gasUsed);
}

const formatGas = (value) => value.toLocaleString("en-US");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function newestMtime(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const times = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return newestMtime(entryPath);
    }
    return entry.name.endsWith(".sol") ? (await fs.stat(entryPath)).mtimeMs : 0;
  }));
  return Math.max(0, ...times);
}

// Newest metrics file of an operation, with every measured transaction in `cases`.
async function loadMetrics(operation, command, contractsChanged) {
  let names = [];
  try {
    names = (await fs.readdir(METRICS_DIR)).filter((name) => name.endsWith(`-${operation}.generated.json`));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  if (names.length === 0) {
    throw new Error(`No ${operation} metrics found. Run \`${command}\` first.`);
  }
  const file = path.join(METRICS_DIR, names.sort().at(-1));
  if ((await fs.stat(file)).mtimeMs < contractsChanged) {
    throw new Error(`${path.relative(ROOT, file)} is older than the contracts. Run \`${command}\` first.`);
  }
  const metrics = JSON.parse(await fs.readFile(file, "utf8"));
  const cases = metrics.cases ?? [...metrics.deployment, ...metrics.instance, ...metrics.policyResults];
  return { file: path.relative(ROOT, file), cases };
}

async function main() {
  const contractsChanged = await newestMtime(CONTRACTS_DIR);
  const metrics = {
    tests: await loadMetrics(SOURCES.tests, "npm run test:policies", contractsChanged),
    lifecycle: await loadMetrics(SOURCES.lifecycle, "npm run evaluate:policies", contractsChanged),
  };

  const problems = [];
  for (const figure of FIGURES) {
    const doc = await fs.readFile(path.join(ROOT, figure.doc), "utf8");
    const measured = figure.gas(metrics).map(formatGas);
    const expected = figure.text.split("{gas}").reduce((text, part, i) => text + measured[i - 1] + part);
    if (doc.includes(expected)) {
      continue;
    }
    const pattern = new RegExp(figure.text.split("{gas}").map(escapeRegExp).join("([\\d,]+)"));
    const found = doc.match(pattern);
    problems.push(found
      ? `${figure.doc}: "${found[0]}" should read "${expected}"`
      : `${figure.doc}: text "${figure.text}" not found; update the doc or FIGURES in scripts/check-gas.js`);
  }

  if (problems.length > 0) {
    console.error(`Gas figures in the docs differ from the measurements (${metrics.tests.file}, ${metrics.lifecycle.file}):\n${problems.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Gas figures in the docs match the measurements (${FIGURES.length} figures).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
