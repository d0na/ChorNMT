// Draws the BPMN models of the experiment and checks them (decision D20). The BPMN XML is the
// compared evidence; the SVG drawn by chor-js is versioned but not compared. The script
// fails unless:
// - the baseline XML is equivalent to the source BPMN (same nodes by name and type, flows, roles,
//   messages), through the same importer;
// - the final XML equals the baseline with the delta nodes written over it, recomputed here from
//   the delta file;
// - each XML equals the model the chain returned to its render (the tokenURI output in its trace);
// - each SVG shows exactly the names of the elements of its XML.
// Each SVG carries the SHA-256 of the XML it was drawn from, and bpmn/images.json lists them. Only
// the SVG is kept: it is vector, and GitHub and the reports show it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AbiCoder } from "ethers";
import { importBpmnToNmt } from "../../bpmn-builder-js/scripts/import-bpmn.js";
import { choreographyFromTokenURI } from "../../bpmn-builder-js/scripts/web3.js";
import { renderBpmnImages } from "../evaluation/render-bpmn-images.js";
import { INPUTS } from "./phases.js";

const root = process.cwd();
const evidenceDirectory = path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence"));
const bpmnDirectory = path.join(evidenceDirectory, "bpmn");
const HASH_MARKER = "chornmt-bpmn-xml-sha256";
const sha256 = (content) => createHash("sha256").update(content).digest("hex");

// A model as a sorted list of nodes with the fields the chain stores, and its roles. Two
// normalizations, and only these: incoming flows are a set, and conditions are one per outgoing
// flow, empty when missing (the chain keeps what a delta wrote, [] or [""]; the importer always
// writes one per flow, so both mean "no condition").
const NODE_FIELDS = ["name", "nodeType", "incoming", "outgoing", "conditions", "initiatorRole", "participantRole", "initiatingMessage", "returnMessage"];
function canonical(roles, nodes) {
  const field = (node, name) => {
    if (name === "incoming") return [...node.incoming].sort();
    if (name === "conditions") return node.outgoing.map((_, index) => node.conditions[index] ?? "");
    return node[name];
  };
  return {
    roles: [...roles].sort(),
    nodes: nodes.map((node) => Object.fromEntries(NODE_FIELDS.map((name) => [name, field(node, name)])))
      .sort((left, right) => left.name.localeCompare(right.name))
  };
}

function assertSameModel(actual, expected, message) {
  const left = canonical(actual.roles, actual.nodes);
  const right = canonical(expected.roles, expected.nodes);
  assert.deepEqual(left.roles, right.roles, `${message}: the roles differ`);
  assert.deepEqual(left.nodes.map((node) => node.name), right.nodes.map((node) => node.name), `${message}: the node names differ`);
  for (const [index, node] of left.nodes.entries()) assert.deepEqual(node, right.nodes[index], `${message}: node ${node.name} differs`);
}

// The names chor-js draws: events, tasks, gateways, participants, and messages of the XML.
function drawableNames(xml) {
  const names = new Set();
  for (const match of xml.matchAll(/<bpmn:(startEvent|endEvent|choreographyTask|exclusiveGateway|parallelGateway|eventBasedGateway|participant|message)\b[^>]*\bname="([^"]*)"/g)) {
    names.add(match[2].replaceAll("&amp;", "&").replace(/\s+/g, " ").trim());
  }
  return names;
}

// Every text of the SVG, its lines joined both with and without a space (chor-js wraps names).
function svgTexts(svg) {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(([, body]) => {
    const lines = [...body.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map(([, line]) => line.trim());
    const parts = lines.length > 0 ? lines : [body.trim()];
    return { spaced: parts.join(" ").replace(/\s+/g, " "), joined: parts.join("") };
  });
}

async function main() {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "chornmt-bpmn-"));
  const evidence = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "experiment.json"), "utf8"));
  const traces = JSON.parse(await fs.readFile(path.join(evidenceDirectory, "traces.json"), "utf8"));
  const imported = async (file, name) => (await importBpmnToNmt(file, path.join(work, `${name}.nmt.json`))).dataset;
  const source = await imported(path.join(root, INPUTS.bpmn), "source");
  const models = {
    baseline: { xml: path.join(bpmnDirectory, "baseline.bpmn.xml"), read: "F4.tokenURI" },
    final: { xml: path.join(bpmnDirectory, "final.bpmn.xml"), read: "F8.tokenURI" }
  };
  for (const [name, model] of Object.entries(models)) model.dataset = await imported(model.xml, name);

  assertSameModel(models.baseline.dataset, source, `the baseline XML and ${INPUTS.bpmn}`);
  const delta = JSON.parse(await fs.readFile(path.join(root, INPUTS.delta), "utf8"));
  const expectedFinal = [...new Map([...models.baseline.dataset.nodes, ...delta.nodes].map((node) => [node.name, node])).values()];
  assertSameModel(models.final.dataset, { roles: models.baseline.dataset.roles, nodes: expectedFinal }, "the final XML and the baseline with the delta written over it");
  for (const [name, model] of Object.entries(models)) {
    assert.ok(evidence.phases.some((phase) => (phase.reads || []).some((read) => read.key === model.read)), `${model.read} is not a read of the evidence`);
    const trace = traces[model.read];
    assert.ok(trace, `traces.json has no trace for ${model.read}`);
    const [tokenURI] = AbiCoder.defaultAbiCoder().decode(["string"], trace.output);
    const chain = choreographyFromTokenURI(tokenURI);
    assertSameModel(model.dataset, { roles: chain.roles.map((role) => role.name), nodes: chain.nodes }, `the ${name} XML and the model the chain returned (${model.read})`);
  }

  const images = {};
  for (const [name, model] of Object.entries(models)) {
    const xml = await fs.readFile(model.xml, "utf8");
    const { svgPath } = await renderBpmnImages({ xmlPath: model.xml, outputBaseName: name, outputDirectory: bpmnDirectory });
    const svg = await fs.readFile(svgPath, "utf8");
    const expected = drawableNames(xml);
    const shown = new Set();
    for (const text of svgTexts(svg)) {
      const match = [text.spaced, text.joined].find((candidate) => expected.has(candidate));
      assert.ok(match, `${name}.svg shows "${text.spaced}", which is not the name of an element of ${path.basename(model.xml)}`);
      shown.add(match);
    }
    for (const element of expected) assert.ok(shown.has(element), `${name}.svg does not show "${element}" of ${path.basename(model.xml)}`);
    const xmlHash = sha256(xml);
    // chor-js names its arrow markers with random ids; numbering them in order of appearance
    // makes the SVG change only when the model does.
    const markerIds = [...new Set([...svg.matchAll(/<marker id="([^"]+)"/g)].map(([, id]) => id))];
    let stable = svg;
    markerIds.forEach((id, index) => { stable = stable.replaceAll(id, `marker-${index}`); });
    await fs.writeFile(svgPath, stable.replace(/(<svg[^>]*>)/, `$1<!-- ${HASH_MARKER}: ${xmlHash} -->`));
    images[name] = { xml: path.basename(model.xml), xmlSha256: xmlHash, svg: path.basename(svgPath), names: expected.size };
  }
  await fs.writeFile(path.join(bpmnDirectory, "images.json"), `${JSON.stringify(images, null, 2)}\n`);
  await fs.rm(work, { recursive: true, force: true });
  console.log(`BPMN images: ${path.relative(root, bpmnDirectory)} (baseline equivalent to the source, final = baseline + delta, both equal to the chain, every name drawn)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
