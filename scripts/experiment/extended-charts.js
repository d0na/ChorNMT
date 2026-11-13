// Generates the gnuplot charts of the extended evaluation (decision D28) from its evidence: one
// data file per chart in <evidence>/extended/charts/, compared like the rest of the evidence, and
// its SVG, versioned but not compared: it carries the SHA-256 of its data file, which
// check:evidence matches against the versioned data (as for the experiment charts, D20).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const evidenceDirectory = path.join(path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence")), "extended");
const chartsDirectory = path.join(evidenceDirectory, "charts");
const templates = path.join(root, "evaluation", "gnuplot", "extended");
const HASH_MARKER = "chornmt-chart-data-sha256";

async function chart(name, header, rows) {
  const dataFile = path.join(chartsDirectory, `${name}.dat`);
  await fs.writeFile(dataFile, `# ${header}\n${rows.map((row) => row.join(",")).join("\n")}\n`);
  await run("gnuplot", ["-e", `datafile='${dataFile}'; outbase='${path.join(chartsDirectory, name)}'`, path.join(templates, `${name}.gp`)]);
  const svgPath = path.join(chartsDirectory, `${name}.svg`);
  const dataHash = createHash("sha256").update(await fs.readFile(dataFile)).digest("hex");
  const svg = await fs.readFile(svgPath, "utf8");
  await fs.writeFile(svgPath, svg.replace(/(<svg[^>]*>)/, `$1<!-- ${HASH_MARKER}: ${dataHash} -->`));
}

async function main() {
  const { scalability } = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "extended.json"), "utf8"));
  await fs.rm(chartsDirectory, { recursive: true, force: true });
  await fs.mkdir(chartsDirectory, { recursive: true });
  // Every model size, minted from a model contract or grown from the largest one by updates.
  const points = [
    ...scalability.sizes.map((size) => ({ tasks: size.tasks, origin: "minted", updateOne: size.gas.updateOne, read: size.read })),
    ...scalability.growth.map((size) => ({ tasks: size.tasks, origin: "grown", updateOne: size.gas.updateOne, read: size.read }))
  ];
  await chart("scale-mint", "tasks,modelGas,mintGas", scalability.sizes.map((size) => [size.tasks, size.gas.model, size.gas.mint.default]));
  await chart("scale-update", "tasks,origin,defaultGas,constrainedGas", points.map((point) => [point.tasks, point.origin, point.updateOne.default, point.updateOne.constrained]));
  await chart("scale-read", "tasks,origin,tokenUriGas,tokenUriBytes", points.map((point) => [point.tasks, point.origin, point.read.gas, point.read.bytes]));
  console.log(`Extended charts: ${path.relative(root, chartsDirectory)} (3 charts)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
