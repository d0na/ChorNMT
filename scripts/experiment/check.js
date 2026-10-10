// npm run check:evidence: reruns the experiment into a temporary directory (evidence:update --out)
// and compares it with the versioned evaluation/evidence/ (decision D18). Every data file is compared
// byte for byte except the measurements (timings.json and the phase-duration chart data). The SVG
// images are not compared, since their bytes depend on the gnuplot, PlantUML, Chromium, and font
// versions of the machine (D20); each one carries the SHA-256 of the versioned file it is drawn
// from, which is checked instead (the UML ones by check:uml). It fails on a missing, extra, or
// different file or a stale image, lists the transactions and test cases whose outcome or gas
// changed, and keeps the regenerated evidence for inspection; `npm run evidence:update` accepts it.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const EVIDENCE = path.resolve("evaluation", "evidence");
const NOT_COMPARED = [/^timings\.json$/, /^charts\/phase-duration\.dat$/, /\.svg$/];
// The source of each image and the marker of its hash; the UML sources are checked by check:uml.
const IMAGE_SOURCES = [
  { image: /^bpmn\/(.+)\.svg$/, source: "bpmn/$1.bpmn.xml", marker: "chornmt-bpmn-xml-sha256" },
  { image: /^charts\/(.+)\.svg$/, source: "charts/$1.dat", marker: "chornmt-chart-data-sha256" }
];

async function files(directory, prefix = "") {
  const entries = await fs.readdir(path.join(directory, prefix), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? files(directory, relative) : [relative];
  }));
  return nested.flat().filter((name) => !name.endsWith(".DS_Store")).sort();
}

// Outcome and gas changes between two lists of measured cases, by key.
function caseChanges(name, before, after, key) {
  const old = new Map(before.map((entry) => [key(entry), entry]));
  const lines = [];
  for (const entry of after) {
    const previous = old.get(key(entry));
    old.delete(key(entry));
    if (!previous) {
      lines.push(`  ${name} ${key(entry)}: new, ${entry.outcome}, gas ${entry.gasUsed}`);
    } else if (previous.outcome !== entry.outcome) {
      lines.push(`  ${name} ${key(entry)}: OUTCOME ${previous.outcome} -> ${entry.outcome}`);
    } else if (previous.gasUsed !== entry.gasUsed) {
      const delta = Number(entry.gasUsed) - Number(previous.gasUsed);
      lines.push(`  ${name} ${key(entry)}: gas ${previous.gasUsed} -> ${entry.gasUsed} (${delta > 0 ? "+" : ""}${delta})`);
    }
  }
  for (const missing of old.keys()) lines.push(`  ${name} ${missing}: removed`);
  return lines.sort((a, b) => b.includes("OUTCOME") - a.includes("OUTCOME"));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "chornmt-evidence-"));
  const run = spawnSync("node", ["scripts/experiment/update.js", "--out", out], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(`${run.stdout}${run.stderr}\nThe experiment run failed; partial evidence in ${out}.`);
    process.exit(run.status ?? 1);
  }

  const [versioned, regenerated] = await Promise.all([files(EVIDENCE), files(out)]);
  const compared = (name) => !NOT_COMPARED.some((pattern) => pattern.test(name));
  const problems = [
    ...versioned.filter((name) => !regenerated.includes(name)).map((name) => `missing from the run: ${name}`),
    ...regenerated.filter((name) => !versioned.includes(name)).map((name) => `not versioned: ${name}`)
  ];
  for (const name of versioned.filter((name) => regenerated.includes(name) && compared(name))) {
    const [a, b] = await Promise.all([fs.readFile(path.join(EVIDENCE, name)), fs.readFile(path.join(out, name))]);
    if (!a.equals(b)) problems.push(`differs: ${name}`);
  }
  for (const name of versioned) {
    const rule = IMAGE_SOURCES.find(({ image }) => image.test(name));
    if (!rule) continue;
    const source = name.replace(rule.image, rule.source);
    const svg = await fs.readFile(path.join(EVIDENCE, name), "utf8");
    const recorded = svg.match(new RegExp(`${rule.marker}: ([0-9a-f]+)`))?.[1];
    const actual = versioned.includes(source) ? createHash("sha256").update(await fs.readFile(path.join(EVIDENCE, source))).digest("hex") : null;
    if (!recorded || recorded !== actual) problems.push(`image not drawn from the versioned ${source}: ${name}`);
  }

  if (problems.length === 0) {
    await fs.rm(out, { recursive: true, force: true });
    console.log(`Evidence matches the run (${versioned.filter(compared).length} files compared, ${versioned.filter((name) => !compared(name)).length} measurements and images not compared byte for byte).`);
    return;
  }

  const details = [];
  if (problems.includes("differs: experiment.json")) {
    const [a, b] = await Promise.all([readJson(path.join(EVIDENCE, "experiment.json")), readJson(path.join(out, "experiment.json"))]);
    details.push(...caseChanges("transaction", a.transactions, b.transactions, (entry) => entry.key));
  }
  if (problems.includes("differs: tests.json")) {
    const [a, b] = await Promise.all([readJson(path.join(EVIDENCE, "tests.json")), readJson(path.join(out, "tests.json"))]);
    details.push(...caseChanges("test", a.cases, b.cases, (entry) => entry.label));
  }
  console.error([
    "The versioned evidence differs from a run of the current code:",
    ...problems.map((problem) => `  ${problem}`),
    ...(details.length ? ["Outcome and gas changes:", ...details] : []),
    `Regenerated evidence: ${out} (compare with \`diff -r evaluation/evidence ${out}\`).`,
    "If the change is intended, run `npm run evidence:update` and commit evaluation/evidence/ and docs/experiment.md."
  ].join("\n"));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
