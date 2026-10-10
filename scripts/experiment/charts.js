// Generates the gnuplot charts of the experiment (decision D20) from the evidence: one data file
// per chart in <evidence>/charts/, compared like the rest of the evidence (phase-duration.dat
// excepted: timings are not compared), and its SVG, versioned but not compared: it carries the
// SHA-256 of its data file, which check:evidence matches against the versioned data.
//
// Every data point is recomputed from its primary source before the chart is drawn: gas from the
// call traces (their gasUsed is the receipt's) against experiment.json, timing statistics from
// their samples, model counts from the BPMN XML. The script fails on any difference.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Interface } from "ethers";

const run = promisify(execFile);
const root = process.cwd();
const evidenceDirectory = path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence"));
const chartsDirectory = path.join(evidenceDirectory, "charts");
const templates = path.join(root, "evaluation", "gnuplot", "experiment");
const HASH_MARKER = "chornmt-chart-data-sha256";
const SET_NODES = new Interface(["function setNodes(string[],uint8[],string[][],string[][],string[][],string[],string[],string[],string[])"]);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Counts of a BPMN choreography XML: flow nodes, sequence flows, gateways, messages.
function xmlCounts(xml) {
  const count = (pattern) => (xml.match(pattern) || []).length;
  const gateways = count(/<bpmn2?:(exclusiveGateway|parallelGateway|eventBasedGateway)\b/g);
  return {
    nodes: count(/<bpmn2?:(startEvent|endEvent|choreographyTask|exclusiveGateway|parallelGateway|eventBasedGateway)\b/g),
    sequenceEdges: count(/<bpmn2?:sequenceFlow\b/g),
    gateways,
    messages: count(/<bpmn2?:message\b/g)
  };
}

async function writeData(name, header, rows) {
  await fs.writeFile(path.join(chartsDirectory, `${name}.dat`), `# ${header}\n${rows.map((row) => row.join(",")).join("\n")}\n`);
}

async function plot(name, variables) {
  const assignments = Object.entries({ datafile: path.join(chartsDirectory, `${name}.dat`), outbase: path.join(chartsDirectory, name), ...variables })
    .map(([key, value]) => `${key}=${typeof value === "number" ? value : `'${value}'`}`).join("; ");
  await run("gnuplot", ["-e", assignments, path.join(templates, `${name}.gp`)]);
  const svgPath = path.join(chartsDirectory, `${name}.svg`);
  const dataHash = createHash("sha256").update(await fs.readFile(path.join(chartsDirectory, `${name}.dat`))).digest("hex");
  const svg = await fs.readFile(svgPath, "utf8");
  await fs.writeFile(svgPath, svg.replace(/(<svg[^>]*>)/, `$1<!-- ${HASH_MARKER}: ${dataHash} -->`));
}

async function main() {
  const evidence = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "experiment.json"), "utf8"));
  const timings = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "timings.json"), "utf8"));
  const traces = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "traces.json"), "utf8"));
  // The gas of each transaction as its call trace records it.
  const traced = evidence.transactions.map((record) => {
    assert.ok(traces[record.key], `traces.json has no trace for ${record.key}`);
    return { ...record, gasUsed: BigInt(traces[record.key].gasUsed).toString() };
  });
  await fs.rm(chartsDirectory, { recursive: true, force: true });
  await fs.mkdir(chartsDirectory, { recursive: true });
  const phases = evidence.phases.map((phase) => phase.id);

  // phase-gas: gas of the allowed and of the denied transactions of each phase.
  const gasOf = (records, phase, outcome) => records.filter((record) => record.phase === phase && record.outcome === outcome)
    .reduce((sum, record) => sum + BigInt(record.gasUsed), 0n);
  const phaseGas = phases.map((phase) => [phase, gasOf(evidence.transactions, phase, "allowed"), gasOf(evidence.transactions, phase, "denied")]);
  for (const [phase, allowed, denied] of phaseGas) {
    assert.equal(gasOf(traced, phase, "allowed"), allowed, `phase-gas ${phase}: the traces and experiment.json disagree on the allowed gas`);
    assert.equal(gasOf(traced, phase, "denied"), denied, `phase-gas ${phase}: the traces and experiment.json disagree on the denied gas`);
  }
  await writeData("phase-gas", "phase,allowedGas,deniedGas", phaseGas);

  // phase-duration: median, min, and max of each phase over the measured runs.
  const durations = phases.map((phase) => {
    const stats = timings.phases[phase];
    assert.equal(stats.samplesMs.length, timings.repetitions, `phase-duration ${phase}: ${stats.samplesMs.length} samples for ${timings.repetitions} runs`);
    assert.ok(Math.abs(median(stats.samplesMs) - stats.medianMs) < 0.002, `phase-duration ${phase}: the median does not match its samples`);
    assert.equal(Math.min(...stats.samplesMs), stats.minMs, `phase-duration ${phase}: the minimum does not match its samples`);
    assert.equal(Math.max(...stats.samplesMs), stats.maxMs, `phase-duration ${phase}: the maximum does not match its samples`);
    return [phase, stats.medianMs, stats.minMs, stats.maxMs];
  });
  await writeData("phase-duration", "phase,medianMs,minMs,maxMs", durations);

  // model-comparison: the instance read from the chain after F4 and after F5, checked against the XML.
  const state = (id) => evidence.phases.find((phase) => phase.id === id).instance;
  const models = [["baseline", state("F4"), "baseline.bpmn.xml"], ["after-delta", state("F5"), "final.bpmn.xml"]];
  const modelRows = [];
  for (const [name, instance, file] of models) {
    const counts = xmlCounts(await fs.readFile(path.join(evidenceDirectory, "bpmn", file), "utf8"));
    for (const field of ["nodes", "sequenceEdges", "gateways", "messages"]) {
      assert.equal(counts[field], instance[field], `model-comparison ${name}: ${field} is ${instance[field]} on the chain and ${counts[field]} in ${file}`);
    }
    modelRows.push([name, instance.nodes, instance.sequenceEdges, instance.gateways, instance.messages]);
  }
  await writeData("model-comparison", "model,nodes,edges,gateways,messages", modelRows);

  // gas-by-changed-nodes: every setNodes, by the number of nodes its calldata writes.
  const setNodes = [];
  for (const record of evidence.transactions.filter((item) => item.call.endsWith(".setNodes"))) {
    const trace = traces[record.key];
    const [names] = SET_NODES.decodeFunctionData("setNodes", trace.input);
    assert.equal(BigInt(trace.gasUsed).toString(), record.gasUsed, `gas-by-changed-nodes ${record.key}: the trace and experiment.json disagree on the gas`);
    setNodes.push([record.key, names.length, record.outcome === "allowed" ? record.gasUsed : "NaN", record.outcome === "denied" ? record.gasUsed : "NaN"]);
  }
  await writeData("gas-by-changed-nodes", "key,nodes,allowedGas,deniedGas", setNodes);

  await plot("phase-gas");
  await plot("phase-duration", { runs: timings.repetitions });
  await plot("model-comparison");
  await plot("gas-by-changed-nodes");
  console.log(`Charts: ${path.relative(root, chartsDirectory)} (4 charts, data recomputed and checked)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
