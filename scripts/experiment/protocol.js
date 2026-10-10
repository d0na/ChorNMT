// Fills the generated blocks of the experiment protocol, docs/experiment.md, from the evidence
// (decision D21), and checks the rules that keep it exact:
// - a block is <!-- evidence:<name> --> ... <!-- /evidence:<name> -->, written only by this script;
// - an outcome in the narrative is <!-- outcome:<key> -->...<!-- /outcome -->, filled from the run;
// - outside blocks and outcome placeholders there is no number and no outcome word (allowed,
//   denied, reverted), except the structural tokens of STRUCTURAL, inline code, and link targets;
// - the phase titles are blocks, in the order of the specification, each followed by its phase
//   block; every phase has one;
// - every entry of the parity checklist (parity.js) points to an existing block, narrative section,
//   or evidence file, or is dropped with a reason.
//
// node scripts/experiment/protocol.js            rewrite the blocks (evidence:update runs it)
// node scripts/experiment/protocol.js --check    fail if a block differs from the evidence (npm run check:protocol)
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { formatEther, Interface } from "ethers";
import { PARITY } from "./parity.js";

const root = process.cwd();
const evidenceDirectory = path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence"));
const protocolFile = path.join(root, "docs", "experiment.md");
const relative = (file) => path.relative(path.dirname(protocolFile), path.join(evidenceDirectory, file)).split(path.sep).join("/");
const CHECK = process.argv.includes("--check");

// Tokens with digits the narrative may use: names, not measurements.
// Phase ids, decision and claim ids of docs/decisions.md and docs/requirements.md, standard names.
const STRUCTURAL = [/\bF[1-8]\b/g, /\b[DCH]\d{1,2}\b/g, /\bERC-721\b/g, /\bEIP-170\b/g, /\bSSTORE2\b/g, /\bBPMN 2\.0\b/g, /\bXACML\b/g];
const OUTCOME_WORDS = /\b(allowed|denied|reverted|reverts|revert)\b/gi;
const GWEI_SCENARIOS = [
  [10, "Low congestion", "low demand; transactions are usually inexpensive"],
  [30, "Typical congestion", "ordinary public-network demand"],
  [100, "High congestion", "high demand; users pay more to be included sooner"]
];
// The cost of a choreography type and its first complete instance, as deploy:asset measured it:
// the six deployments of the type, the mint, the role accounts, and the licensed role link.
const TYPE_AND_INSTANCE = ["F1.deploy.master", "F1.deploy.creator", "F1.deploy.holder", "F1.deploy.renderer", "F1.deploy.model", "F1.deploy.nmt", "F2.mint", "F2.roles", "F3.link"];

const number = (value) => Number(value).toLocaleString("en-US");
const table = (header, rows) => [`| ${header.join(" | ")} |`, `| ${header.map((cell) => /^(Gas|Cost|USD|Median|Min|Max|Std|Count|Nodes|Tasks|Gateways|Edges|Messages|Roles|Bytes|Transactions|Index|Relative)/.test(cell) ? "---:" : "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
const code = (value) => `\`${value}\``;
const ms = (value) => value.toFixed(3);

async function load() {
  const read = async (file) => JSON.parse(await fs.readFile(path.join(evidenceDirectory, file), "utf8"));
  const evidence = await read("experiment.json");
  return {
    evidence,
    timings: await read("timings.json"),
    traces: await read("traces.json"),
    tests: await read("tests.json"),
    images: await read("bpmn/images.json"),
    delta: JSON.parse(await fs.readFile(path.join(root, evidence.inputs.delta.path), "utf8")),
    records: new Map(evidence.transactions.map((record) => [record.key, record])),
    phases: new Map(evidence.phases.map((phase) => [phase.id, phase])),
    files: await listFiles(evidenceDirectory)
  };
}

async function listFiles(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`));
    else files.push(`${prefix}${entry.name}`);
  }
  return files;
}

function usd(gas, price) {
  return GWEI_SCENARIOS.map(([gwei]) => `$${(Number(gas) * gwei / 1e9 * price).toFixed(4)}`);
}

function gasSum(records) {
  return records.reduce((sum, record) => sum + BigInt(record.gasUsed), 0n);
}

function costSum(records) {
  return records.reduce((sum, record) => sum + BigInt(record.costWei), 0n);
}

function blocks(ctx) {
  const { evidence, timings, traces, tests, images, delta, records, phases } = ctx;
  const price = evidence.provenance.ethUsdPrice;
  const account = (name) => evidence.accounts.find((item) => item.name === name);
  const phaseRecords = (id) => evidence.transactions.filter((record) => record.phase === id);
  const generated = {};

  generated.provenance = [
    ...table(["Item", "Value"], [
      ["Solidity compiler", code(evidence.provenance.solc)],
      ["Optimizer", `${evidence.provenance.optimizer.enabled ? "enabled" : "disabled"}, ${number(evidence.provenance.optimizer.runs)} runs`],
      ["Node.js", code(timings.machine.node)],
      ["Hardhat", code(evidence.provenance.hardhat)],
      ["Network", evidence.provenance.network],
      ["ETH/USD price of the USD columns", `$${number(price)} (fixed, ${code("ETH_USD_PRICE")})`],
      ["Measured runs (timings)", `${number(timings.repetitions)} after ${number(timings.warmUpRuns)} warm-up run, each on a fresh network; all gave the same evidence`],
      ["Machine of the timings", `${timings.machine.cpu}, ${number(timings.machine.cores)} cores, ${number(timings.machine.memoryGiB)} GiB, ${timings.machine.platform} ${timings.machine.arch}`]
    ]),
    "",
    "Gas and costs are local Hardhat measurements with the compiler and optimizer above. The USD columns price the measured gas at the public-network gas prices of the scenarios, not at the local gas price; the cost columns in ETH use the local gas price of each receipt."
  ];

  generated.reproduction = [
    "```bash",
    "nvm use && npm install && (cd bpmn-builder-js && npm install) && npm run setup:evaluation",
    "npm run compile",
    "npm run evidence:update                       # the experiment, its traces, timings, diagrams, charts, and this document",
    `EXPERIMENT_REPETITIONS=${timings.repetitions} npm run evidence:update     # the repetitions of these timings`,
    "npm run evidence:update -- --out /tmp/run     # an exploratory run, elsewhere",
    "npm run check:protocol                        # this document against the evidence",
    "```",
    "",
    "Prerequisites: Node.js 22, gnuplot, the Chromium of setup:evaluation, Java, and Graphviz."
  ];

  generated.accounts = table(["Account", "Index", "Address", "Plays"],
    evidence.accounts.map((item) => [item.name, number(item.index), code(item.address), item.plays]));

  generated.inputs = table(["Input", "File", "SHA-256"],
    Object.entries(evidence.inputs).map(([name, input]) => [name, `[${input.path}](../${input.path})`, code(input.sha256)]));

  const totalRecords = evidence.transactions;
  generated["phases-overview"] = [
    ...table(["Phase", "Title", "Transactions", "Allowed", "Denied", "Gas allowed", "Gas denied", "Cost (ETH)", "Median (ms)", "Nodes", "Tasks", "Edges", "Gateways", "Messages"],
      evidence.phases.map((phase) => {
        const list = phaseRecords(phase.id);
        const allowed = list.filter((record) => record.outcome === "allowed");
        const denied = list.filter((record) => record.outcome === "denied");
        const instance = phase.instance;
        return [`[${phase.id}](#${phase.id.toLowerCase()})`, phase.title, number(list.length), number(allowed.length), number(denied.length), number(gasSum(allowed)), number(gasSum(denied)), formatEther(costSum(list)), ms(timings.phases[phase.id].medianMs),
          ...(instance ? [instance.nodes, instance.tasks, instance.sequenceEdges, instance.gateways, instance.messages].map(number) : ["—", "—", "—", "—", "—"])];
      })),
    "",
    ...table(["Whole experiment", "Value"], [
      ["Transactions", number(totalRecords.length)],
      ["Allowed transactions, gas", `${number(totalRecords.filter((record) => record.outcome === "allowed").length)}, ${number(gasSum(totalRecords.filter((record) => record.outcome === "allowed")))}`],
      ["Denied transactions, gas", `${number(totalRecords.filter((record) => record.outcome === "denied").length)}, ${number(gasSum(totalRecords.filter((record) => record.outcome === "denied")))}`],
      ["Duration of a run, median (min–max), ms", `${ms(timings.total.medianMs)} (${ms(timings.total.minMs)}–${ms(timings.total.maxMs)})`]
    ]),
    "",
    "Nodes to messages: the main instance at the end of the phase (F7 works on a second instance). Durations leave out the time the run spends tracing and checking."
  ];

  for (const phase of evidence.phases) {
    generated[`phase-title:${phase.id}`] = [`### ${phase.id}`, "", `**${phase.title}**`];
    generated[`phase:${phase.id}`] = phaseBlock(phase);
  }

  function phaseBlock(phase) {
    const list = phaseRecords(phase.id);
    const lines = [];
    const section = (title, content) => { if (content.length) lines.push(`**${title}**`, "", ...content, ""); };
    section("Actors", table(["Account", "Index", "Address", "Plays"], phase.actors.map((name) => account(name)).map((item) => [item.name, number(item.index), code(item.address), item.plays])));
    section("Inputs", phase.inputs.length ? table(["File", "SHA-256"], phase.inputs.map((input) => [`[${input.path}](../${input.path})`, code(input.sha256)])) : []);
    if (phase.id === "F5") section("The delta", [`${delta.description} Nodes it writes, each in its final state: ${delta.nodes.map((node) => code(node.name)).join(", ")}.`]);
    section("Off-chain steps", phase.offchain ? table(["Step", "Function", "Output", "SHA-256"], phase.offchain.map((step) => [step.step, code(step.function), step.output + (step.hashedWithout ? ` (hashed without ${step.hashedWithout.map(code).join(", ")})` : ""), code(step.sha256)])) : []);
    section("Reads", phase.reads ? table(["Key", "Call", "By", "Gas"], phase.reads.map((read) => [code(read.key), code(read.call), read.by, number(BigInt(traces[read.key].gasUsed))])) : []);
    section("Transactions", list.length ? table(["Key", "Operation", "From", "Call", "Contract", "Outcome", "Reason", "Gas"],
      list.map((record) => {
        const target = record.created || record.to;
        return [code(record.key), record.label, record.from.account, code(record.call), `${target.contract} ${code(target.address)}`, record.outcome, record.reason ? code(record.reason) : "—", number(record.gasUsed)];
      })) : []);
    section("Costs", list.length ? table(["Key", "Gas", "Cost (ETH)", "USD @10 gwei", "USD @30 gwei", "USD @100 gwei"],
      [...list.map((record) => [code(record.key), number(record.gasUsed), formatEther(record.costWei), ...usd(record.gasUsed, price)]),
        ["**phase total**", number(gasSum(list)), formatEther(costSum(list)), ...usd(gasSum(list), price)]]) : []);
    section("Trust-table rows", list.some((record) => record.trust) ? table(["Key", "Table", "Row of docs/choreography-policies.md"],
      list.filter((record) => record.trust).map((record) => [code(record.key), record.trust.table, record.trust.action])) : []);
    if (phase.id === "F1") {
      section("The model of the type", table(["Roles", "Nodes", "Tasks", "Gateways", "Edges", "Messages", "Bytes of the model contract"],
        [[phase.model.roles, phase.model.nodes, phase.model.tasks, phase.model.gateways, phase.model.sequenceEdges, phase.model.messages, phase.model.modelBytes].map(number)]));
      lines.push(`Role names: ${phase.model.roleNames.map(code).join(", ")}.`, "");
    }
    const transfers = list.filter((record) => record.call.endsWith(".transferFrom"));
    if (transfers.length) {
      const transfer = new Interface(["function transferFrom(address,address,uint256)"]);
      section("Transfers", table(["Key", "From", "To", "Sent by", "Outcome"], transfers.map((record) => {
        const [from, to] = transfer.decodeFunctionData("transferFrom", traces[record.key].input);
        const name = (address) => evidence.accounts.find((item) => item.address.toLowerCase() === address.toLowerCase())?.name ?? code(address);
        return [code(record.key), name(from), name(to), record.from.account, record.outcome];
      })));
    }
    if (phase.checks) {
      const fields = Object.keys(phase.checks.beforeSale);
      section("The license before and after the sale", table(["Field", "Before the sale", "After the sale", "After the buyer's updates"],
        fields.map((field) => [field, ...["beforeSale", "afterSale", "afterBuyerUpdates"].map((moment) => {
          const value = phase.checks[moment][field];
          return value === "" ? "(empty)" : /^0x/.test(value) ? code(value) : value;
        })])));
      lines.push(`Tasks of ${code("Special Carrier")}, which keep the role through the sale: ${phase.roleTasks.map(code).join(", ")}.`, "",
        `Messages declared on the license: ${phase.messages.map(code).join(", ")}.`, "");
    }
    const state = phase.instance || phase.restrictedInstance;
    if (state) {
      section(phase.restrictedInstance ? "The second instance at the end of the phase" : "The instance at the end of the phase",
        [...table(["Address", "Nodes", "Tasks", "Gateways", "Edges", "Messages", "Roles"], [[code(state.address), ...[state.nodes, state.tasks, state.gateways, state.sequenceEdges, state.messages, state.roles].map(number)]]),
          "", ...table(["Role", "Played by", "Address"], state.roleAssignments.map((role) => [role.role, role.account ?? role.contract, code(role.address)])),
          ...(state.holder ? ["", `Holder: ${state.holder}.`] : [])]);
    }
    if (phase.newInstance) {
      const fresh = phase.newInstance;
      section("The new instance", table(["Address", "Nodes", "Tasks", "Gateways", "Edges", "Messages", "Roles"], [[code(fresh.address), ...[fresh.nodes, fresh.tasks, fresh.gateways, fresh.sequenceEdges, fresh.messages, fresh.roles].map(number)]]));
    }
    section("Policies in force at the end of the phase", table(["Resource", "Layer", "Contract", "Address", "Source", "Bytecode keccak256"],
      phase.policies.map((policy) => [policy.resource, policy.layer, policy.contract, code(policy.address), policy.source ? `[${path.basename(policy.source)}](../${policy.source})` : "—", policy.bytecodeKeccak256 ? code(policy.bytecodeKeccak256) : "—"])));
    const steps = Object.entries(timings.steps).filter(([key]) => key.startsWith(`${phase.id}.`));
    section("Duration (ms)", table(["Measured", "Median", "Min", "Max", "Std dev"],
      [[`phase ${phase.id}`, timings.phases[phase.id]], ...steps.map(([key, value]) => [`step ${code(key)}`, value])]
        .map(([name, value]) => [name, ms(value.medianMs), ms(value.minMs), ms(value.maxMs), ms(value.stddevMs)])));
    if (phase.render) lines.push(`The drawing of this model, checked against its XML and the chain, is in [BPMN models](#bpmn-models).`, "");
    lines.push(`**Sequence diagram** (filtered; [complete](${relative(`uml/${phase.id}-full.svg`)}))`, "", `![${phase.id} sequence diagram](${relative(`uml/${phase.id}.svg`)})`);
    return lines;
  }

  const deltaRecord = records.get("F5.delta");
  const freshRecords = ["F8.new-instance.mint", "F8.new-instance.roles", "F8.new-instance.link"].map((key) => records.get(key));
  const freshGas = gasSum(freshRecords);
  const saving = (1 - Number(deltaRecord.gasUsed) / Number(freshGas)) * 100;
  generated.comparison = table(["Strategy", "Transactions", "Gas", "Cost (ETH)", "USD @10 gwei", "USD @30 gwei", "USD @100 gwei", "Relative gas saving"], [
    [`Delta update, ${number(delta.nodes.length)} nodes written`, code(deltaRecord.key), number(deltaRecord.gasUsed), formatEther(deltaRecord.costWei), ...usd(deltaRecord.gasUsed, price), `${saving.toFixed(2)}%`],
    [`New instance, ${number(phases.get("F8").newInstance.nodes)} nodes`, freshRecords.map((record) => code(record.key)).join(", "), number(freshGas), formatEther(costSum(freshRecords)), ...usd(freshGas, price), "0.00%"]
  ]);

  const typeRecords = TYPE_AND_INSTANCE.map((key) => records.get(key));
  const typeGas = gasSum(typeRecords);
  generated.scenarios = [
    `The gas of a choreography type and its first complete instance: ${typeRecords.map((record) => code(record.key)).join(", ")}, ${number(typeGas)} gas in all, ${formatEther(costSum(typeRecords))} ETH at the local gas price of the receipts.`,
    "",
    ...table(["Network condition", "Gas price", "Meaning", "Gas", "Estimated ETH cost", "Estimated USD cost"],
      GWEI_SCENARIOS.map(([gwei, condition, meaning]) => {
        const eth = Number(typeGas) * gwei / 1e9;
        return [condition, `${number(gwei)} gwei`, meaning, number(typeGas), eth.toFixed(6), `$${(eth * price).toFixed(2)}`];
      }))
  ];

  const chart = (name, caption) => [`![${caption}](${relative(`charts/${name}.svg`)})`, "", `*${caption}* Data: [${name}.dat](${relative(`charts/${name}.dat`)}).`, ""];
  generated.charts = [
    ...chart("phase-gas", "Gas by phase, allowed and denied transactions stacked."),
    ...chart("phase-duration", `Median duration by phase over ${number(timings.repetitions)} runs, with min–max bars.`),
    ...chart("model-comparison", "Model structure read from the chain: baseline (F4) and after the delta (F5)."),
    ...chart("gas-by-changed-nodes", "Gas of every setNodes by the number of nodes it writes.")
  ];

  generated.bpmn = Object.entries(images).flatMap(([name, image]) => [
    `**${name === "baseline" ? "Baseline (F4)" : "After the delta (F8)"}**: [XML](${relative(`bpmn/${image.xml}`)}), SHA-256 ${code(image.xmlSha256)}, ${number(image.names)} names drawn.`,
    "",
    `![${name} model](${relative(`bpmn/${image.svg}`)})`,
    ""
  ]).concat(["Checked before drawing: the baseline XML is equivalent to the source BPMN, the final XML is the baseline with the delta written over it, both equal the model the chain returned to their render, and each drawing shows exactly the names of its XML."]);

  generated["uml-guide"] = table(["Diagram", "Shows"], [
    ["[Choreography use cases](uml/use-case-choreography.svg)", "who may mint, transfer, edit the model, assign and link roles, and install a Holder policy; checked against the trust table, the tests, and this evidence"],
    ["[Participant license use cases](uml/use-case-participant-license.svg)", "issuing, declaring messages, updating organization data, selling, and linking a role to a license"],
    ...evidence.phases.map((phase) => [`[${phase.id}](${relative(`uml/${phase.id}.svg`)}) · [complete](${relative(`uml/${phase.id}-full.svg`)})`, phase.title])
  ]);

  generated.tests = [
    ...table(["Test matrix", "Value"], [
      ["Cases", number(tests.summary.caseCount)],
      ["Gas of the allowed cases", number(tests.summary.allowedGas)],
      ["Gas of the denied cases", number(tests.summary.deniedGas)]
    ]),
    "",
    ...table(["Case", "Outcome", "Gas", "Cost (wei)", "USD @10 gwei", "USD @30 gwei", "USD @100 gwei"],
      tests.cases.map((item) => [item.label, item.outcome, number(item.gasUsed), number(item.costWei), ...usd(item.gasUsed, price)]))
  ];

  generated.artifacts = ctx.files.map((file) => `- [${file}](${relative(file)})`);

  // Consistency: the overview totals are the sums of the phase tables; the comparison uses the
  // transactions it names.
  const phaseTotal = evidence.phases.reduce((sum, phase) => sum + gasSum(phaseRecords(phase.id)), 0n);
  assert.equal(phaseTotal, gasSum(evidence.transactions), "the phase totals do not add up to the experiment total");
  assert.equal(freshRecords.every((record) => record.outcome === "allowed") && deltaRecord.outcome === "allowed", true, "the comparison uses a denied transaction");
  return generated;
}

// The protocol without generated blocks, outcome placeholders, code, link targets, and comments:
// the text a person or an LLM wrote.
function narrativeText(text) {
  return text
    .replace(/<!-- evidence:([\w:.-]+) -->[\s\S]*?<!-- \/evidence:\1 -->/g, " ")
    .replace(/<!-- outcome:[\w.-]+ -->[\s\S]*?<!-- \/outcome -->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

async function main() {
  const ctx = await load();
  const generated = blocks(ctx);
  const original = await fs.readFile(protocolFile, "utf8");
  const errors = [];
  const found = new Set();
  let text = original.replace(/<!-- evidence:([\w:.-]+) -->[\s\S]*?<!-- \/evidence:\1 -->/g, (block, name) => {
    found.add(name);
    if (!generated[name]) {
      errors.push(`unknown block evidence:${name}`);
      return block;
    }
    return `<!-- evidence:${name} -->\n${generated[name].join("\n")}\n<!-- /evidence:${name} -->`;
  });
  text = text.replace(/<!-- outcome:([\w.-]+) -->[\s\S]*?<!-- \/outcome -->/g, (placeholder, key) => {
    const record = ctx.records.get(key);
    if (!record) {
      errors.push(`outcome:${key} is not a transaction of the evidence`);
      return placeholder;
    }
    return `<!-- outcome:${key} -->${record.outcome}<!-- /outcome -->`;
  });

  for (const phase of ctx.evidence.phases) {
    for (const name of [`phase-title:${phase.id}`, `phase:${phase.id}`]) if (!found.has(name)) errors.push(`block evidence:${name} is missing`);
  }
  const order = [...text.matchAll(/<!-- evidence:(phase-title|phase):(F\d) -->/g)].map(([, kind, id]) => `${kind}:${id}`);
  const expectedOrder = ctx.evidence.phases.flatMap((phase) => [`phase-title:${phase.id}`, `phase:${phase.id}`]);
  if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) errors.push(`the phases are not in the order of the specification, each title followed by its block: ${order.join(", ")}`);

  const narrative = narrativeText(text);
  let numbers = narrative;
  for (const pattern of STRUCTURAL) numbers = numbers.replace(pattern, " ");
  for (const match of numbers.matchAll(/[^\s]*\d[^\s]*/g)) errors.push(`a number outside the generated blocks: "${match[0]}"`);
  for (const match of narrative.matchAll(OUTCOME_WORDS)) errors.push(`an outcome word outside the generated blocks and outcome placeholders: "${match[0]}"`);

  const narratives = new Set([...text.matchAll(/<!-- narrative:([\w-]+) -->/g)].map(([, name]) => name));
  for (const entry of PARITY) {
    const [kind, ...rest] = entry.destination.split(":");
    const target = rest.join(":");
    const where = `parity "${entry.source}: ${entry.item}"`;
    if (kind === "block" && !found.has(target)) errors.push(`${where}: no block evidence:${target}`);
    else if (kind === "narrative" && !narratives.has(target)) errors.push(`${where}: no narrative:${target} section`);
    else if (kind === "artifact" && !ctx.files.includes(target)) errors.push(`${where}: no evidence file ${target}`);
    else if (kind === "dropped" && !entry.reason) errors.push(`${where}: dropped without a reason`);
    else if (!["block", "narrative", "artifact", "readme", "dropped"].includes(kind)) errors.push(`${where}: unknown destination ${entry.destination}`);
  }

  if (CHECK && text !== original) errors.push("the generated blocks differ from the evidence: run npm run evidence:update");
  if (errors.length) {
    console.error(`docs/experiment.md:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  if (!CHECK) await fs.writeFile(protocolFile, text);
  console.log(`docs/experiment.md ${CHECK ? "matches" : "written from"} the evidence (${found.size} blocks, ${PARITY.length} parity entries).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
