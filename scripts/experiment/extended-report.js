// Fills the generated blocks of docs/extended-evaluation.md from the evidence of the extended
// evaluation (decision D28). A block is <!-- extended:<name> --> ... <!-- /extended:<name> -->,
// written only by this script; the text around the blocks is hand-written and holds no measured
// value. Every number of the document is in a block.
//
// node scripts/experiment/extended-report.js            rewrite the blocks (evidence:update runs it)
// node scripts/experiment/extended-report.js --check    fail if a block differs from the evidence (npm run check:protocol)
import fs from "node:fs/promises";
import path from "node:path";
import { GAS_STATION_READING_GWEI, REFERENCE_GWEI, usdAt } from "./costs.js";

const root = process.cwd();
const evidenceDirectory = path.join(path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence")), "extended");
const reportFile = path.join(root, "docs", "extended-evaluation.md");
const CHECK = process.argv.includes("--check");
// EIP-7825: the gas a single transaction may use on the networks that adopt it.
const TRANSACTION_GAS_CAP = 2 ** 24;

const number = (value) => Number(value).toLocaleString("en-US");
const code = (value) => `\`${value}\``;
const ms = (value) => value.toFixed(1);
const table = (header, rows) => [
  `| ${header.join(" | ")} |`,
  `| ${header.map((cell) => /^(Gas|USD|Nodes|Tasks|Edges|Messages|Bytes|Calldata|Model bytes|Position|Median|tokenURI|Mint|Deploy|Update|Insert|Append|Link|Render|Read)/.test(cell) ? "---:" : "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`)
];
const outcome = (item) => item.outcome === "denied" ? `denied, ${code(item.reason)}` : "allowed";
const relative = (file) => path.relative(path.dirname(reportFile), path.join(evidenceDirectory, file)).split(path.sep).join("/");

async function listFiles(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name !== ".DS_Store") files.push(`${prefix}${entry.name}`);
  }
  return files;
}

function blocks(evidence, timings, files) {
  const price = evidence.provenance.polUsdPrice;
  const usd = (gas) => `$${usdAt(gas, REFERENCE_GWEI, price).toFixed(4)}`;
  const { updates, scalability, conflicts, concurrency } = evidence;
  const generated = {};

  generated.provenance = [
    ...table(["Item", "Value"], [
      ["Specification", `[extended-spec.js](../${evidence.specification})`],
      ["Compiler", `solc ${evidence.provenance.solc}, optimizer ${evidence.provenance.optimizer.enabled ? `on, ${evidence.provenance.optimizer.runs} runs` : "off"}`],
      ["Network", evidence.provenance.network],
      ["Hardhat, Node", `${evidence.provenance.hardhat}, ${evidence.provenance.node}`],
      ["Block gas limit of the local network", number(scalability.blockGasLimit)],
      ["Runs", `${timings.warmUpRuns} warm-up and ${timings.repetitions} measured, all with the same evidence`],
      ["USD column", `Polygon, ${REFERENCE_GWEI} gwei (the reference scenario of the experiment, a Polygon Gas Station reading of about ${GAS_STATION_READING_GWEI} gwei rounded up) and $${price.toFixed(3)} per POL, both calculation assumptions: USD = gas × gas price in gwei × 10⁻⁹ × POL/USD`],
      ["Timings", `${timings.machine.cpu}, ${timings.machine.cores} cores, ${timings.machine.memoryGiB} GiB, ${timings.machine.platform}; local, not compared`]
    ])
  ];

  const allowedUpdates = updates.series.filter((item) => item.outcome === "allowed");
  const gasOf = (list) => list.map((item) => Number(item.gasUsed));
  generated.updates = [
    `Model: ${code(updates.model)}, Creator policy ${code(updates.policy)}. Baseline: ${number(updates.baseline.nodes)} nodes, ${number(updates.baseline.tasks)} tasks, ${number(updates.baseline.sequenceEdges)} sequence flows, ${number(updates.baseline.messages)} messages.`,
    "",
    ...table(["Key", "Kind of update", "Nodes written", "Calldata bytes", "Outcome", "Gas", `USD @${REFERENCE_GWEI} gwei`, "Tasks after", "Edges after"],
      updates.series.map((item) => [code(item.key), item.kind, number(item.nodesWritten), number(item.calldataBytes), outcome(item), number(item.gasUsed), usd(item.gasUsed), number(item.after.tasks), number(item.after.sequenceEdges)])),
    "",
    ...updates.series.map((item) => `- ${code(item.key)}: ${item.description}. Nodes written: ${item.written.map(code).join(", ")}.`),
    "",
    `The ${number(allowedUpdates.length)} accepted updates use between ${number(Math.min(...gasOf(allowedUpdates)))} and ${number(Math.max(...gasOf(allowedUpdates)))} gas, ${number(allowedUpdates.reduce((sum, item) => sum + Number(item.gasUsed), 0))} in all. Check of the run: ${updates.rendered}.`
  ];

  const { modelLimit, sizes, growth } = scalability;
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  const perTask = (from, to, read) => Math.round((Number(read(to)) - Number(read(from))) / (to.tasks - from.tasks));
  generated["scale-limit"] = [
    `Shape: ${scalability.shape}, over ${number(scalability.roles)} roles. Policies: ${code(scalability.policies.default)} (default) and ${code(scalability.policies.constrained)} (constrained).`,
    "",
    ...table(["Limit", "Tasks", "Model bytes", "Result"], [
      ["Largest chain that fits in a model contract", number(modelLimit.largest.tasks), number(modelLimit.largest.modelBytes), `deployed and minted (limit: ${number(modelLimit.bytes)} bytes)`],
      ["First chain that does not fit", number(modelLimit.firstTooLarge.tasks), number(modelLimit.firstTooLarge.modelBytes), "above the limit of a contract, so it cannot be deployed: the run computes its encoding and does not send it"],
      ["Largest model reached by updates", number(growth[growth.length - 1].tasks), "—", "updated, read, and rendered; where the study stops, not a limit it found"]
    ])
  ];
  generated["scale-mint"] = [
    ...table(["Tasks", "Nodes", "Model bytes", "Deploy model (gas)", "Deploy type NMT (gas)", "Mint (gas)", `Mint USD @${REFERENCE_GWEI} gwei`, "Link roles (gas)"],
      sizes.map((size) => [number(size.tasks), number(size.nodes), number(size.modelBytes), number(size.gas.model), number(size.gas.nmt), number(size.gas.mint.default), usd(size.gas.mint.default), number(size.gas.setRoles.default)])),
    "",
    `Each task more adds about ${number(perTask(first, last, (size) => size.gas.mint.default))} gas to a mint and about ${number(perTask(first, last, (size) => size.gas.model))} gas to the model contract (from ${number(first.tasks)} to ${number(last.tasks)} tasks). The type NMT and the link of the roles do not depend on the size. The largest mint, ${number(last.gas.mint.default)} gas, is below ${number(TRANSACTION_GAS_CAP)} gas, the per-transaction cap introduced by EIP-7825. ${mintGap(sizes)}`,
    "",
    `![Deploying and minting a model by its size](${relative("charts/scale-mint.svg")})`
  ];
  const points = [...sizes.map((size) => ({ ...size, origin: "minted" })), ...growth.map((size) => ({ ...size, origin: "grown by updates" }))];
  const firstGrown = growth[0];
  const lastGrown = growth[growth.length - 1];
  generated["scale-update"] = [
    ...table(["Tasks", "Model", "Update one task, default (gas)", "Update one task, constrained (gas)", "Update constrained USD"],
      points.map((point) => [number(point.tasks), point.origin, number(point.gas.updateOne.default), number(point.gas.updateOne.constrained), usd(point.gas.updateOne.constrained)])),
    "",
    `${defaultSpread(points)} Under the constrained policy each node of the model adds about ${number(perTask(first, lastGrown, (size) => size.gas.updateOne.constrained))} gas to it (from ${number(first.tasks)} to ${number(lastGrown.tasks)} tasks; in a chain, tasks, nodes, and flows grow together): the policy reads every node of the model, to count its tasks and its flows, at every update.`,
    "",
    ...table(["Tasks", `Update ${sizes[0].gas.updateBatch.nodes} tasks, default (gas)`, `Update ${sizes[0].gas.updateBatch.nodes} tasks, constrained (gas)`, "Insert a task on a flow, default (gas)", "Insert a task on a flow, constrained (gas)"],
      sizes.map((size) => [number(size.tasks), number(size.gas.updateBatch.default), number(size.gas.updateBatch.constrained), number(size.gas.insertTask.default), number(size.gas.insertTask.constrained)])),
    "",
    ...table(["Tasks after", "Nodes written", "Append tasks, default (gas)", "Append tasks, constrained (gas)", "Append constrained USD"],
      growth.map((size) => [number(size.tasks), number(size.nodesWritten), number(size.gas.append.default), number(size.gas.append.constrained), usd(size.gas.append.constrained)])),
    "",
    `An update that appends ${number(firstGrown.appended)} tasks writes ${number(firstGrown.nodesWritten)} nodes: the new tasks and the two nodes whose flows change.`,
    "",
    `![Updating one task by the size of the model](${relative("charts/scale-update.svg")})`
  ];
  const step = (key, name) => timings.steps[`${key}.${name}`];
  const timing = (stats) => stats ? `${ms(stats.medianMs)} (${ms(stats.minMs)}–${ms(stats.maxMs)})` : "—";
  const keyOf = (point) => `${point.origin === "minted" ? "size" : "grown"}-${String(point.tasks).padStart(3, "0")}`;
  generated["scale-read"] = [
    ...table(["Tasks", "Model", "tokenURI gas", "Bytes returned", "Read tokenURI (ms)", "Render BPMN (ms)", "Mint and link roles (ms)"],
      points.map((point) => [number(point.tasks), point.origin, number(point.read.gas), number(point.read.bytes), timing(step(keyOf(point), "tokenURI")), timing(step(keyOf(point), "render")), timing(step(keyOf(point), "mintAndLink"))])),
    "",
    `The read is an ${code("eth_call")}: its gas is not paid, but an RPC provider caps the gas of a call. ${readGrowth(points)} The milliseconds are the median and the range over ${number(timings.repetitions)} measured runs on the local network: the render column is the whole ${code("render:asset")} function (read, normalization, validation, BPMN generation), the last column the mint and the link of the roles as the local network executes them. They are not the latency of a public network.`,
    "",
    `![Reading the whole model by its size](${relative("charts/scale-read.svg")})`
  ];

  generated.conflicts = [
    `Licensed role: ${code(conflicts.licensedRole)}, linked to ${conflicts.before.roleLinkedTo} and played by ${conflicts.before.playedBy} when the study starts. The model: ${conflicts.model}.`,
    "",
    ...table(["Key", "Between", "What one party does", "Outcome", "Prevails", "Rule", "Gas"],
      conflicts.cases.map((item) => [code(item.key), item.parties.join(" and "), item.intent, outcome(item), item.prevails, item.rule, number(item.gasUsed)])),
    "",
    ...table(["After", `${conflicts.licensedRole} linked to`, "Played by"],
      conflicts.cases.filter((item, index, list) => index === 0 || JSON.stringify(item.licensedRole) !== JSON.stringify(list[index - 1].licensedRole))
        .map((item, index) => [index === 0 ? `the start, until ${code(item.key)}` : code(item.key), item.licensedRole.roleLinkedTo, item.licensedRole.playedBy]))
  ];

  generated.concurrency = [
    `Mining: ${concurrency.mining}.`,
    "",
    ...concurrency.cases.flatMap((item) => [
      `**${code(item.key)}**: ${item.description}.`,
      "",
      ...table(["Position", "Transaction", "Sender", "Outcome", "Gas"], item.transactions.map((transaction) => [number(transaction.position), transaction.label, transaction.from, outcome(transaction), number(transaction.gasUsed)])),
      "",
      `Result: ${item.finding}.${observation(item)}`,
      ""
    ])
  ].slice(0, -1);

  generated.artifacts = files.map((file) => `- [${file}](${relative(file)})`);
  return generated;
}

// The gap between a mint under the constrained and under the default policy, read from every size.
function mintGap(sizes) {
  const gaps = [...new Set(sizes.map((size) => Number(size.gas.mint.constrained) - Number(size.gas.mint.default)))];
  return gaps.length === 1
    ? `A mint under the constrained policy costs ${number(gaps[0])} gas more than under the default one, the same at every size.`
    : `A mint under the constrained policy costs between ${number(Math.min(...gaps))} and ${number(Math.max(...gaps))} gas more than under the default one.`;
}

// How much the update of one task under the default policy varies over all the sizes.
function defaultSpread(points) {
  const values = points.map((point) => Number(point.gas.updateOne.default));
  const [low, high] = [Math.min(...values), Math.max(...values)];
  return low === high
    ? `Under the default policy an update of one task costs ${number(low)} gas at every size.`
    : `Under the default policy an update of one task stays between ${number(low)} and ${number(high)} gas at every size: it does not grow with the model.`;
}

// The gas of the read per task added, at the start and at the end of the series, against its bytes.
function readGrowth(points) {
  const slope = (from, to, field) => Math.round((Number(to.read[field]) - Number(from.read[field])) / (to.tasks - from.tasks));
  const [a, b] = points.slice(0, 2);
  const [y, z] = points.slice(-2);
  return `Its gas grows faster than linearly: each task more adds about ${number(slope(a, b, "gas"))} gas between ${number(a.tasks)} and ${number(b.tasks)} tasks, and about ${number(slope(y, z, "gas"))} between ${number(y.tasks)} and ${number(z.tasks)}, while the bytes it returns grow by about ${number(slope(a, b, "bytes"))} and ${number(slope(y, z, "bytes"))} per task.`;
}

// What a same-block case read from the chain after its block, as a sentence.
function observation(item) {
  const read = item.observed;
  if (!read) return "";
  if (read.lost) {
    return ` ${code(read.task)} had the initiating message ${code(read.before.initiatingMessage)} and the return message ${code(read.before.returnMessage)}; after the block it has ${code(read.after.initiatingMessage)} and ${code(read.after.returnMessage)}: ${read.lost} is lost, and both transactions succeeded.`;
  }
  if (read.gasAlone) return ` The same delta alone in its block uses ${number(read.gasAlone)} gas.`;
  if (read.tasksAfter) return ` Each update is within the limit when evaluated alone on the state before the block; after the block the model has ${number(read.tasksAfter)} tasks.`;
  if (read.licenseHolder) return ` After the block the license is held by ${read.licenseHolder} and the model has the delta.`;
  return "";
}

async function main() {
  const read = async (file) => JSON.parse(await fs.readFile(path.join(evidenceDirectory, file), "utf8"));
  const generated = blocks(await read("extended.json"), await read("timings.json"), await listFiles(evidenceDirectory));
  const original = await fs.readFile(reportFile, "utf8");
  const errors = [];
  const found = new Set();
  const text = original.replace(/<!-- extended:([\w-]+) -->[\s\S]*?<!-- \/extended:\1 -->/g, (block, name) => {
    found.add(name);
    if (!generated[name]) {
      errors.push(`unknown block extended:${name}`);
      return block;
    }
    return `<!-- extended:${name} -->\n${generated[name].join("\n")}\n<!-- /extended:${name} -->`;
  });
  for (const name of Object.keys(generated)) if (!found.has(name)) errors.push(`block extended:${name} is missing`);
  if (CHECK && text !== original) errors.push("the generated blocks differ from the evidence: run npm run evidence:update");
  if (errors.length) {
    console.error(`docs/extended-evaluation.md:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  if (!CHECK) await fs.writeFile(reportFile, text);
  console.log(`docs/extended-evaluation.md ${CHECK ? "matches" : "written from"} the evidence (${found.size} blocks).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
