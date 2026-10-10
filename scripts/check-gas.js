import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");
const EVIDENCE_DIR = path.join(ROOT, "evaluation", "evidence");

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
    gas: ({ experiment }) => [gasOf(experiment, "F1.deploy.model")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "| Mint a paper-example instance, born with the model | {gas} |",
    gas: ({ experiment }) => [gasOf(experiment, "F2.mint")],
  },
  {
    doc: "docs/choreography-policies.md",
    text: "| Assign an account to four of its five roles (`setRoles`; the fifth takes a license) | {gas} |",
    gas: ({ experiment }) => [gasOf(experiment, "F2.roles")],
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
    gas: ({ experiment }) => [gasOf(experiment, "F5.delta")],
  },
  {
    doc: "docs/decisions.md",
    text: "costs the model contract once ({gas} gas for the paper example)",
    gas: ({ experiment }) => [gasOf(experiment, "F1.deploy.model")],
  },
  {
    doc: "docs/future-improvements.md",
    text: "Part of the paper mint ({gas} gas measured)",
    gas: ({ experiment }) => [gasOf(experiment, "F2.mint")],
  },
];

function gasOf(source, key) {
  const entry = source.cases.find((candidate) => candidate.key === key);
  if (!entry) {
    throw new Error(`No measured case "${key}" in ${source.file}; update FIGURES in scripts/check-gas.js.`);
  }
  return Number(entry.gasUsed);
}

const formatGas = (value) => value.toLocaleString("en-US");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A versioned evidence file, with every measured transaction in `cases`, keyed by `key`. The
// evidence matches the current code because `npm run check:evidence` regenerates and compares it.
async function loadEvidence(name, cases) {
  const file = path.join(EVIDENCE_DIR, name);
  const evidence = JSON.parse(await fs.readFile(file, "utf8"));
  return { file: path.relative(ROOT, file), cases: cases(evidence) };
}

async function main() {
  const metrics = {
    // The experiment transactions, by key (scripts/experiment/phases.js).
    experiment: await loadEvidence("experiment.json", (evidence) => evidence.transactions),
    // The test:policies matrix, keyed by its case label.
    tests: await loadEvidence("tests.json", (evidence) => evidence.cases.map((entry) => ({ ...entry, key: entry.label }))),
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
    console.error(`Gas figures in the docs differ from the measurements (${metrics.experiment.file}, ${metrics.tests.file}):\n${problems.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Gas figures in the docs match the measurements (${FIGURES.length} figures).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
