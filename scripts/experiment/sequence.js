// Generates one sequence diagram per phase from the evidence (decision D19): the call trace of
// every transaction, the tokenURI reads, and the off-chain steps the run recorded. Nothing in a
// diagram is written by hand.
//
// Two views per phase, in <evidence>/uml/:
// - F<n>-full.puml: every call of every trace, nothing grouped.
// - F<n>.puml: the filtered view, derived from the same calls by two rules only:
//   1. consecutive read-only calls (STATICCALL of a non-policy function) between the same two
//      contracts become one "reads:" message with the count of each function; the calls those
//      reads make become one "reads:" message per pair of contracts;
//   2. consecutive policy calls asking the same check are wrapped in a group named by CHECKS.
// After writing, the generator parses both views back and fails unless the filtered view lists
// the phase transactions in order with their outcomes, holds the same calls as the full view,
// and shows the phase actors and the contracts the traces touch.
import fs from "node:fs/promises";
import path from "node:path";
import { loadArtifacts } from "./contracts.js";

const root = process.cwd();
const evidenceDirectory = path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence"));
// The shared style is copied into each diagram, not included, so the output does not depend on
// the directory it is written to.
const STYLE_FILE = path.join(root, "docs", "uml", "style.iuml");

// Policy functions and the check each one answers (rule 2).
const CHECKS = {
  evaluate: "Action check",
  evaluateNodeUpdate: "Domain check",
  evaluateRoleUpdate: "Domain check",
  evaluateMessagesUpdate: "Domain check"
};
// The asset half of a transfer: the NMT asks the asset, whose Creator policy decides.
const TRANSFER_CHECK = "Transfer check";
const ASSETS = new Set(["ChoreographyMutableAsset", "ParticipantMutableAsset"]);
const ZERO = "0x0000000000000000000000000000000000000000";

const gas = (value) => Number(value).toLocaleString("en-US");

async function main() {
  const evidence = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "experiment.json"), "utf8"));
  const style = (await fs.readFile(STYLE_FILE, "utf8")).trimEnd();
  const artifacts = await loadArtifacts();
  const book = new Map(evidence.contracts.map((entry, index) => [entry.address.toLowerCase(), { ...entry, alias: `C${index}` }]));
  const accounts = new Map(evidence.accounts.map((account) => [account.address.toLowerCase(), account]));
  const records = new Map(evidence.transactions.map((record) => [record.key, record]));
  const trace = async (key) => JSON.parse(await fs.readFile(path.join(evidenceDirectory, "traces", `${key}.json`), "utf8"));

  const party = (address) => {
    if (address === "offchain") return { alias: "OffChain", kind: "offchain" };
    const key = address.toLowerCase();
    if (key === ZERO) return { alias: "Reader", declaration: 'actor "Reader\\n(eth_call)" as Reader', kind: "reader" };
    const account = accounts.get(key);
    if (account) return { alias: `A${account.index}`, declaration: `actor "${account.name}\\n(account ${account.index})" as A${account.index}`, kind: "account", name: account.name };
    const contract = book.get(key);
    if (!contract) throw new Error(`no account or contract in the evidence has address ${address}`);
    const label = contract.label === contract.contract ? contract.label : `${contract.label}\\n<<${contract.contract}>>`;
    return { alias: contract.alias, declaration: `participant "${label}" as ${contract.alias}`, kind: "contract", name: contract.label };
  };
  const functionName = (node) => {
    if (node.type === "CREATE" || node.type === "CREATE2") return "constructor";
    const contract = book.get(node.to.toLowerCase())?.contract;
    try {
      return artifacts[contract]?.iface.parseTransaction({ data: node.input })?.name ?? node.input.slice(0, 10);
    } catch {
      return node.input.slice(0, 10);
    }
  };
  const checkOf = (node) => {
    const name = functionName(node);
    if (Object.hasOwn(CHECKS, name)) return CHECKS[name];
    if (name === "transferFrom" && ASSETS.has(book.get(node.to.toLowerCase())?.contract)) return TRANSFER_CHECK;
    return null;
  };
  const isRead = (node) => node.type === "STATICCALL" && !checkOf(node);
  const decision = (node) => {
    if (node.error) return "revert";
    const output = node.output || "0x";
    return output.length === 66 ? (BigInt(output) === 0n ? "false" : "true") : "ok";
  };
  const descendants = (node) => (node.calls || []).flatMap((child) => [child, ...descendants(child)]);

  // Full view: every call, depth first, with the answer of every policy call.
  const fullCalls = (node, lines, use) => {
    use(node.from); use(node.to);
    lines.push(`${party(node.from).alias} -> ${party(node.to).alias} : ${functionName(node)}`);
    for (const child of node.calls || []) fullCalls(child, lines, use);
    if (checkOf(node)) lines.push(`${party(node.to).alias} --> ${party(node.from).alias} : ${decision(node)}`);
  };

  // Filtered view of the calls a node makes (rules 1 and 2).
  const readsMessage = (pairCalls) => {
    const counts = new Map();
    for (const call of pairCalls) counts.set(functionName(call), (counts.get(functionName(call)) || 0) + 1);
    return `reads: ${[...counts].map(([name, count]) => `${name} ×${count}`).join(", ")}`;
  };
  const filteredChildren = (children, lines, use) => {
    for (let index = 0; index < children.length;) {
      const child = children[index];
      if (isRead(child)) {
        const group = [];
        while (index < children.length && isRead(children[index]) &&
          children[index].from === child.from && children[index].to === child.to) group.push(children[index++]);
        use(child.from); use(child.to);
        lines.push(`${party(child.from).alias} -> ${party(child.to).alias} : ${readsMessage(group)}`);
        const nested = new Map();
        for (const call of group.flatMap(descendants)) {
          const pair = `${call.from}|${call.to}`;
          if (!nested.has(pair)) nested.set(pair, []);
          nested.get(pair).push(call);
        }
        for (const calls of nested.values()) {
          use(calls[0].from); use(calls[0].to);
          lines.push(`${party(calls[0].from).alias} -> ${party(calls[0].to).alias} : ${readsMessage(calls)}`);
        }
        continue;
      }
      const check = checkOf(child);
      if (check) {
        lines.push(`group ${check}`);
        while (index < children.length && checkOf(children[index]) === check) {
          const call = children[index++];
          use(call.from); use(call.to);
          lines.push(`${party(call.from).alias} -> ${party(call.to).alias} : ${functionName(call)}`);
          filteredChildren(call.calls || [], lines, use);
          lines.push(`${party(call.to).alias} --> ${party(call.from).alias} : ${decision(call)}`);
        }
        lines.push("end");
        continue;
      }
      use(child.from); use(child.to);
      lines.push(`${party(child.from).alias} -> ${party(child.to).alias} : ${functionName(child)}`);
      filteredChildren(child.calls || [], lines, use);
      index++;
    }
  };

  const outDirectory = path.join(evidenceDirectory, "uml");
  await fs.rm(outDirectory, { recursive: true, force: true });
  await fs.mkdir(outDirectory, { recursive: true });
  const offchainAlias = "OffChain";
  for (const phase of evidence.phases) {
    const views = { full: [], filtered: [] };
    const used = { full: [], filtered: [] };
    const user = (view) => (address) => {
      const entry = party(address);
      if (!used[view].some((item) => item.alias === entry.alias)) used[view].push(entry);
    };
    const both = (line) => { views.full.push(line); views.filtered.push(line); };
    const steps = [];
    // The run executes the off-chain steps first in a phase, then its transactions. The export
    // step reads the asset with tokenURI, so that read sits between its request and its answer.
    for (const step of phase.offchain || []) {
      const from = step.step === "import" ? evidence.accounts.find((account) => account.name === "Administrator").address : ZERO;
      steps.push({ kind: "request", step, from });
      if (step.step === "export") for (const read of phase.reads || []) steps.push({ kind: "read", read });
      steps.push({ kind: "answer", step, from });
    }
    for (const key of phase.transactions) steps.push({ kind: "transaction", record: records.get(key) });
    let offchainUsed = false;
    for (const step of steps) {
      if (step.kind === "request") {
        user("full")(step.from); user("filtered")(step.from);
        offchainUsed = true;
        if (step.step.step === "import" || step.step.step === "export") both(`== off-chain: ${step.step.step === "import" ? "import" : "render"} ==`);
        both(`${party(step.from).alias} -> ${offchainAlias} : ${step.step.function}${step.step.input ? `(${step.step.input})` : ""}`);
        continue;
      }
      if (step.kind === "answer") {
        const hash = `sha256 ${step.step.sha256.slice(0, 12)}…${step.step.hashedWithout ? " (without export time)" : ""}`;
        both(`${offchainAlias} --> ${party(step.from).alias} : ${step.step.output}, ${hash}`);
        continue;
      }
      if (step.kind === "read") {
        const node = await trace(step.read.key);
        both(`== ${step.read.key} · eth_call, traced with debug_traceCall ==`);
        // The export step makes this call: the off-chain pipeline asks the asset.
        const asked = { ...node, from: "offchain" };
        fullCalls(asked, views.full, user("full"));
        views.filtered.push(`${offchainAlias} -> ${party(node.to).alias} : ${functionName(node)}`);
        user("filtered")("offchain"); user("filtered")(node.to);
        filteredChildren(node.calls || [], views.filtered, user("filtered"));
        both(`${party(node.to).alias} --> ${offchainAlias} : metadata JSON (gas ${gas(BigInt(node.gasUsed))})`);
        continue;
      }
      const { record } = step;
      const node = await trace(record.key);
      const target = record.created ? record.created.address : record.to.address;
      const result = record.outcome === "allowed" ? "allowed" : `denied: ${record.reason}`;
      both(`== ${record.key} · ${record.outcome} ==`);
      fullCalls({ ...node, to: target }, views.full, user("full"));
      user("filtered")(node.from); user("filtered")(target);
      views.filtered.push(`${party(node.from).alias} -> ${party(target).alias} : ${functionName({ ...node, to: target })}`);
      filteredChildren(node.calls || [], views.filtered, user("filtered"));
      both(`${party(target).alias} --> ${party(node.from).alias} : ${result} · ${gas(record.gasUsed)} gas`);
    }
    for (const view of ["full", "filtered"]) {
      const name = view === "full" ? `${phase.id}-full` : phase.id;
      const declarations = used[view].filter((entry) => entry.declaration).map((entry) => entry.declaration);
      if (offchainUsed) declarations.push(`participant "Off-chain pipeline\\n(bpmn-builder-js)" as ${offchainAlias}`);
      const text = [
        `@startuml ${name}`,
        style,
        `title ${phase.id} — ${phase.title}${view === "full" ? " (complete trace)" : ""}`,
        `caption Generated by scripts/experiment/sequence.js from evaluation/evidence/ — do not edit`,
        ...declarations,
        ...views[view],
        "@enduml",
        ""
      ].join("\n");
      await fs.writeFile(path.join(outDirectory, `${name}.puml`), text);
    }
    await verify(phase, records, outDirectory, used);
  }
  console.log(`Sequence diagrams: ${path.relative(root, outDirectory)} (${evidence.phases.length} phases, filtered and full)`);
}

// Parses the written views back and checks them against the evidence.
async function verify(phase, records, outDirectory, used) {
  const read = async (name) => (await fs.readFile(path.join(outDirectory, `${name}.puml`), "utf8")).split("\n");
  const filtered = await read(phase.id);
  const full = await read(`${phase.id}-full`);
  const fail = (message) => { throw new Error(`${phase.id} sequence diagram: ${message}`); };

  // The transactions of the phase, in order, with their outcomes.
  const dividers = (lines) => lines.filter((line) => /^== .* · (allowed|denied) ==$/.test(line))
    .map((line) => line.match(/^== (.*) · (allowed|denied) ==$/).slice(1, 3).join(" "));
  const expected = phase.transactions.map((key) => `${key} ${records.get(key).outcome}`);
  for (const [view, lines] of [["filtered", filtered], ["full", full]]) {
    if (JSON.stringify(dividers(lines)) !== JSON.stringify(expected)) fail(`the ${view} view lists ${dividers(lines).join(", ")}, the phase ${expected.join(", ")}`);
  }
  for (const key of phase.transactions) {
    const record = records.get(key);
    const result = record.outcome === "allowed" ? "allowed" : `denied: ${record.reason}`;
    if (!filtered.some((line) => line.endsWith(`: ${result} · ${gas(record.gasUsed)} gas`))) fail(`${key} has no "${result}" answer with its gas`);
  }

  // The filtered view holds exactly the calls of the full view.
  const callCounts = (lines) => {
    const counts = new Map();
    for (const line of lines) {
      const match = line.match(/^(\S+) -> (\S+) : (.*)$/);
      if (!match || match[2] === "OffChain") continue;
      const [, from, to, text] = match;
      const items = text.startsWith("reads: ")
        ? text.slice(7).split(", ").map((item) => item.split(" ×")).map(([name, count]) => [name, Number(count)])
        : [[text, 1]];
      for (const [name, count] of items) counts.set(`${from}->${to}:${name}`, (counts.get(`${from}->${to}:${name}`) || 0) + count);
    }
    return counts;
  };
  const fullCounts = callCounts(full);
  const filteredCounts = callCounts(filtered);
  for (const key of new Set([...fullCounts.keys(), ...filteredCounts.keys()])) {
    if (fullCounts.get(key) !== filteredCounts.get(key)) fail(`${key}: ${fullCounts.get(key) ?? 0} calls in the full view, ${filteredCounts.get(key) ?? 0} in the filtered one`);
  }

  // The actors are those of the phase; both views show the same participants.
  const actors = used.filtered.filter((entry) => entry.kind === "account").map((entry) => entry.name).sort();
  const phaseActors = [...new Set([...phase.actors, ...(phase.offchain?.some((step) => step.step === "import") ? ["Administrator"] : [])])].sort();
  if (JSON.stringify(actors) !== JSON.stringify(phaseActors)) fail(`actors ${actors.join(", ")}, the phase lists ${phaseActors.join(", ")}`);
  const aliases = (view) => used[view].map((entry) => entry.alias).sort().join(",");
  if (aliases("full") !== aliases("filtered")) fail("the filtered and the full view show different participants");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
