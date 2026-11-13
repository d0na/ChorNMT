// The extended evaluation (decision D28): the four studies of extended-spec.js, each on its own
// ephemeral Hardhat network, through the same functions as the CLI commands. It runs once as
// warm-up and EXTENDED_REPETITIONS more times (default 3) and fails unless every run gives the same
// evidence. Every value comes from a receipt, a call trace, or a chain read, and every transaction
// is checked against the outcome the specification expects. It writes <evidence>/extended/
// extended.json (compared by check:evidence) and timings.json (measurements, not compared).
//
// Run by npm run evidence:update, after the experiment (which empties the evidence directory).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import hre from "hardhat";
import { importBpmnToNmt } from "../../bpmn-builder-js/scripts/import-bpmn.js";
import { choreographyFromTokenURI } from "../../bpmn-builder-js/scripts/web3.js";
import { deployChoreographyModel, encodeModel, modelFromDataset } from "../choreography-model.js";
import { deployChoreographyType, deployContract, mintAsset } from "../deploy-local.js";
import { renderAsset } from "../render-asset.js";
import { summarizeNodes } from "../evaluation/metrics.js";
import { ARTIFACTS, loadArtifacts } from "./contracts.js";
import { ACCOUNTS, CERTIFIERS, EXTRA_LICENSE, INPUTS, LICENSED_ROLE, LICENSES, ROLE_LICENSES } from "./phases.js";
import { CONCURRENCY, CONFLICTS, SCALE, UPDATES } from "./extended-spec.js";

const root = process.cwd();
const outDirectory = path.join(path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence")), "extended");
const POL_USD_PRICE = Number(process.env.POL_USD_PRICE) > 0 ? Number(process.env.POL_USD_PRICE) : 0.09;
const MODEL_LIMIT_BYTES = 24_576;
const POLICY_LAYERS = ["CREATOR", "HOLDER"];
// Gas limit of a transaction that shares its block with others: a block takes a transaction only
// if its limit fits in the gas left.
const SHARED_BLOCK_GAS_LIMIT = 6_000_000n;
const TOKEN_URI = "function tokenURI(uint256) view returns (string)";

const json = (value) => `${JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
const pad = (index) => String(index).padStart(3, "0");

function toNodeUpdate(nodes) {
  return ["name", "nodeType", "incoming", "outgoing", "conditions", "initiatorRole", "participantRole", "initiatingMessage", "returnMessage"]
    .map((field) => nodes.map((node) => node[field]));
}

// A task on the flow from -> to: the three nodes in their final state.
function insertTask(model, fromName, toName, task) {
  const from = model.get(fromName);
  const to = model.get(toName);
  return [
    { ...from, outgoing: from.outgoing.map((name) => name === toName ? task.name : name) },
    { ...task, incoming: [fromName], outgoing: [toName], conditions: [""] },
    { ...to, incoming: to.incoming.map((name) => name === fromName ? task.name : name) }
  ];
}

// A network of its own, with the named accounts of the experiment and the helpers every study uses.
async function connect() {
  const { ethers } = await hre.network.connect("hardhat");
  const provider = ethers.provider;
  const signers = await ethers.getSigners();
  const signer = (name) => signers[ACCOUNTS.find((account) => account.name === name).index];
  const accountName = (address) => ACCOUNTS.find((account) => signers[account.index].address.toLowerCase() === address.toLowerCase())?.name ?? null;
  const artifacts = await loadArtifacts();
  const contract = (name, address, runner) => new ethers.Contract(address, artifacts[name].abi, runner);
  const deploy = async (from, name, args = []) => (await deployContract(from, ARTIFACTS[name], args)).contract;
  const blockGasLimit = (await provider.getBlock("latest")).gasLimit;

  const decodeRevert = (data) => {
    if (!data || data === "0x") return "revert without data";
    for (const artifact of Object.values(artifacts)) {
      try {
        const error = artifact.iface.parseError(data);
        if (!error) continue;
        if (error.name === "OperationDenied") return `OperationDenied(${POLICY_LAYERS[Number(error.args[0])]})`;
        return error.args.length ? `${error.name}(${error.args.join(", ")})` : error.name;
      } catch {
        // Not an error of this contract.
      }
    }
    return `unknown revert ${data.slice(0, 10)}`;
  };

  // Sends a transaction with a fixed gas limit, so that a denied one is mined and reverts on-chain.
  const mined = async (from, transaction) => {
    try {
      return await (await from.sendTransaction({ gasLimit: blockGasLimit, ...transaction })).wait();
    } catch (error) {
      const receipt = error.receipt || (error.transactionHash && await provider.getTransactionReceipt(error.transactionHash));
      assert.ok(receipt, `no receipt, the transaction was not mined: ${error.message}`);
      return receipt;
    }
  };

  // What a receipt shows, checked against a specification entry { from, call, expect, reason }.
  const observe = async (key, spec, receipt) => {
    const trace = await provider.send("debug_traceTransaction", [receipt.hash, { tracer: "callTracer" }]);
    const outcome = receipt.status === 1 ? "allowed" : "denied";
    const reason = outcome === "denied" ? decodeRevert(trace.output) : null;
    const [contractName, functionName] = spec.call.split(".");
    assert.equal(accountName(receipt.from), spec.from, `${key}: sent by ${accountName(receipt.from)}, the specification expects ${spec.from}`);
    assert.equal(artifacts[contractName].iface.parseTransaction({ data: trace.input })?.name, functionName, `${key}: the transaction does not call ${spec.call}`);
    assert.equal(outcome, spec.expect, `${key}: ${outcome}, the specification expects ${spec.expect}${reason ? ` (${reason})` : ""}`);
    assert.equal(reason, spec.reason ?? null, `${key}: denied with ${reason}, the specification expects ${spec.reason}`);
    return { from: spec.from, call: spec.call, outcome, reason, gasUsed: receipt.gasUsed.toString() };
  };

  // The transactions of one block, in the order given: a higher priority fee goes first, and the
  // transactions of one sender follow their nonces.
  const sameBlock = async (transactions) => {
    await provider.send("evm_setAutomine", [false]);
    const nonces = new Map();
    const hashes = [];
    try {
      for (const [index, { from, to, data }] of transactions.entries()) {
        const nonce = nonces.get(from.address) ?? await provider.getTransactionCount(from.address, "latest");
        nonces.set(from.address, nonce + 1);
        const response = await from.sendTransaction({
          to, data, nonce, gasLimit: SHARED_BLOCK_GAS_LIMIT,
          maxFeePerGas: ethers.parseUnits("1000", "gwei"),
          maxPriorityFeePerGas: ethers.parseUnits(String(100 - index), "gwei")
        });
        hashes.push(response.hash);
      }
      await provider.send("evm_mine", []);
    } finally {
      await provider.send("evm_setAutomine", [true]);
    }
    const receipts = [];
    for (const hash of hashes) receipts.push(await provider.getTransactionReceipt(hash));
    receipts.forEach((receipt, index) => {
      assert.ok(receipt, `transaction ${index + 1} of the block was not mined`);
      assert.equal(receipt.blockNumber, receipts[0].blockNumber, "the transactions were not mined in the same block");
      assert.equal(receipt.index, index, `transaction ${index + 1} of the block was executed at position ${receipt.index + 1}`);
    });
    return receipts;
  };

  // tokenURI(tokenId) on the ChoreographyNMT of an asset, with tokenId = uint160(asset).
  const nmtOf = (address) => new ethers.Contract(address, ["function nmt() view returns (address)"], provider).nmt();
  const readTokenURI = async (address) => new ethers.Contract(await nmtOf(address), [TOKEN_URI], provider).tokenURI(BigInt(address));
  const modelOf = async (address) => choreographyFromTokenURI(await readTokenURI(address));
  // The model on the chain is the one the study expects, node by node.
  const assertModel = async (address, expected, where) => {
    const { nodes } = await modelOf(address);
    assert.equal(nodes.length, expected.size, `${where}: ${nodes.length} nodes on the chain, ${expected.size} expected`);
    for (const node of nodes) {
      const local = expected.get(node.name);
      assert.ok(local, `${where}: unexpected node ${node.name} on the chain`);
      for (const field of ["nodeType", "incoming", "outgoing", "initiatorRole", "participantRole", "initiatingMessage", "returnMessage"]) {
        assert.deepEqual(node[field], local[field], `${where}: ${node.name}.${field} differs on the chain`);
      }
    }
    return summarizeNodes(nodes, []);
  };
  // The off-chain render of an asset through the render:asset function: it fails on an invalid model.
  const render = (address, configPath) => renderAsset(address, configPath, { readTokenURI });

  return { ethers, provider, signers, signer, accountName, artifacts, contract, deploy, blockGasLimit, mined, observe, sameBlock, nmtOf, readTokenURI, modelOf, assertModel, render };
}

// The paper example as phases F1-F3 leave it: the type, the license infrastructure, one instance
// with the paper-scenario Creator policy, and every role linked to the license of its type.
async function setupPaper(chain, workDirectory) {
  const { ethers, signer, contract, deploy } = chain;
  const [master, creator, holder] = ["Master", "Authorized creator", "Holder"].map(signer);
  const { dataset, outputPath } = await importBpmnToNmt(path.join(root, INPUTS.bpmn), path.join(workDirectory, "paper-example.nmt.json"));
  const type = await deployChoreographyType(master, dataset);
  const nmt = type.choreographyNmt.contract;
  const typeId = (name) => ethers.encodeBytes32String(name);
  const participantMaster = await deploy(master, "ParticipantMasterSmartPolicy");
  const participantRenderer = await deploy(master, "ParticipantTokenURIRenderer");
  const participantHolder = await deploy(master, "ParticipantHolderSmartPolicy");
  const licenseNmts = {};
  for (const license of LICENSES) {
    licenseNmts[license.type] = await deploy(signer(license.authority), "ParticipantNMT", [participantMaster.target, participantRenderer.target, typeId(license.type)]);
  }
  const certifiers = {};
  for (const certifier of CERTIFIERS) certifiers[certifier.authority] = await deploy(signer(certifier.authority), "ParticipantCreatorSmartPolicy");
  const attributeManagers = {};
  for (const license of Object.values(ROLE_LICENSES)) {
    attributeManagers[license.type] = await deploy(master, "ChoreographyParticipantAM", [licenseNmts[license.type].target, certifiers[license.authority].target]);
  }
  const paperCreator = await deploy(master, "CreatorSmartPolicyPaperScenario",
    ["BulkBuyer", "Manufacturer", "Middleman", "Supplier", "SpecialCarrier"].map((participantType) => attributeManagers[participantType].target));

  const mintInstance = async () => {
    const instance = await mintAsset(nmt.target, paperCreator.target, type.holder.contract.target, [], { signer: holder, creator });
    return contract("ChoreographyMutableAsset", instance.assetAddress, holder);
  };
  // The arguments of a license mint and the address the license will have.
  const licenseMint = async (license, to = signer(license.holder)) => {
    const args = [to.address, certifiers[license.authority].target, participantHolder.target];
    const typeNmt = licenseNmts[license.type].connect(signer(license.authority));
    const [address] = await typeNmt.mint.staticCall(...args);
    return { typeNmt, args, license: contract("ParticipantMutableAsset", address, to) };
  };
  const licenses = {};
  for (const license of LICENSES) {
    const { typeNmt, args, license: minted } = await licenseMint(license);
    await (await typeNmt.mint(...args)).wait();
    licenses[license.type] = minted;
  }
  const asset = await mintInstance();
  await (await asset.setRoles(dataset.roles, dataset.roles.map((role) => licenses[ROLE_LICENSES[role].type].target))).wait();
  const delta = JSON.parse(await fs.readFile(path.join(root, INPUTS.delta), "utf8"));
  return {
    master, creator, holder, dataset, configPath: outputPath, type, nmt, typeId, participantHolder, licenseNmts, licenses, licenseMint,
    paperCreator, mintInstance, asset, delta, model: new Map(dataset.nodes.map((node) => [node.name, node]))
  };
}

const optionalTask = (name) => ({
  name, nodeType: 2, incoming: [], outgoing: [], conditions: [],
  initiatorRole: "Manufacturer", participantRole: LICENSED_ROLE, initiatingMessage: name.replace("Optional ", ""), returnMessage: ""
});
const setNodesData = (asset, nodes) => asset.interface.encodeFunctionData("setNodes", toNodeUpdate(nodes));

// Study 1: a series of different updates on one instance of the paper example.
async function updatesStudy(workDirectory) {
  const chain = await connect();
  const paper = await setupPaper(chain, workDirectory);
  const { asset, holder, model, delta } = paper;
  const defaultCreator = paper.type.creator.contract;
  const node = (name) => model.get(name);
  const quality = optionalTask("Optional Quality Inspection");
  const split = "Parallel Transport Preparation Split";
  const join = "Parallel Transport Preparation Join";
  const changes = {
    "U1.parallel-block": () => delta.nodes,
    "U2.message": () => [{ ...node("Transport Details"), initiatingMessage: "Detailed Cargo Specification" }],
    "U3.roles": () => [{ ...node("Prepare Transport Documentation"), initiatorRole: "Supplier" }],
    "U4.gateway-type": () => [
      { ...node(split), nodeType: 3, conditions: ["Details missing", "Documents missing"] },
      { ...node(join), nodeType: 4 }
    ],
    "U5.insert-task": () => insertTask(model, "Arrival Intermediate", "Delivery of Product", quality),
    "U6.detach-task": () => [
      { ...node("Arrival Intermediate"), outgoing: ["Delivery of Product"] },
      { ...node(quality.name), incoming: [], outgoing: [], conditions: [] },
      { ...node("Delivery of Product"), incoming: ["Arrival Intermediate"] }
    ],
    "U7.insert-after-detach": () => insertTask(model, "Order Intermediate", "FWD Oder Intermediate", optionalTask("Optional Customs Inspection"))
  };
  const baseline = await chain.assertModel(asset.target, model, "baseline");
  const series = [];
  for (const spec of UPDATES) {
    const nodes = changes[spec.key]();
    // A denied update is well formed: the default Creator policy would accept it.
    assert.equal(await defaultCreator.evaluateNodeUpdate(asset.target, ...toNodeUpdate(nodes).slice(0, 4)), true, `${spec.key}: the update must be well formed`);
    const data = setNodesData(asset, nodes);
    const receipt = await chain.mined(holder, { to: asset.target, data });
    const observed = await chain.observe(spec.key, { from: "Holder", call: "ChoreographyMutableAsset.setNodes", ...spec }, receipt);
    if (observed.outcome === "allowed") for (const changed of nodes) model.set(changed.name, changed);
    const after = await chain.assertModel(asset.target, model, spec.key);
    await chain.render(asset.target, paper.configPath);
    series.push({
      key: spec.key, kind: spec.kind, description: spec.description, nodesWritten: nodes.length, written: nodes.map((changed) => changed.name),
      calldataBytes: (data.length - 2) / 2, ...observed, after: { nodes: after.nodes, tasks: after.tasks, gateways: after.gateways, sequenceEdges: after.sequenceEdges, messages: after.messages }
    });
  }
  return {
    model: INPUTS.bpmn,
    policy: "CreatorSmartPolicyPaperScenario",
    baseline: { nodes: baseline.nodes, tasks: baseline.tasks, gateways: baseline.gateways, sequenceEdges: baseline.sequenceEdges, messages: baseline.messages },
    rendered: "after every update the model on the chain equals the expected one, node by node, and the render:asset function generates its BPMN",
    series
  };
}

// A synthetic model: Start -> Task 001 -> ... -> Task n -> End, the tasks shared among the roles.
function syntheticTask(index, roles) {
  return {
    name: `Task ${pad(index)}`, nodeType: 2, incoming: [], outgoing: [], conditions: [""],
    initiatorRole: roles[(index - 1) % roles.length], participantRole: roles[index % roles.length],
    initiatingMessage: `Request ${pad(index)}`, returnMessage: `Reply ${pad(index)}`
  };
}

function syntheticDataset(tasks, roles) {
  const names = ["Start", ...Array.from({ length: tasks }, (_, index) => `Task ${pad(index + 1)}`), "End"];
  const empty = { initiatorRole: "", participantRole: "", initiatingMessage: "", returnMessage: "" };
  const nodes = names.map((name, position) => {
    const edges = { incoming: position > 0 ? [names[position - 1]] : [], outgoing: position < names.length - 1 ? [names[position + 1]] : [] };
    if (position === 0) return { name, nodeType: 0, ...edges, conditions: [""], ...empty };
    if (position === names.length - 1) return { name, nodeType: 1, ...edges, conditions: [], ...empty };
    return { ...syntheticTask(position, roles), ...edges };
  });
  return { roles, nodes };
}

const modelBytes = (dataset) => (encodeModel(modelFromDataset(dataset)).length - 2) / 2;

// Study 2: synthetic models of growing size, under the default and a constrained Creator policy.
async function scaleStudy(workDirectory, timings) {
  const chain = await connect();
  const { ethers, provider, signer, signers, contract, deploy } = chain;
  const [master, creator, holder] = ["Master", "Authorized creator", "Holder"].map(signer);
  const roles = Array.from({ length: SCALE.roles }, (_, index) => `Role ${index + 1}`);
  const roleAccounts = roles.map((_, index) => signers[5 + index].address);
  const masterPolicy = await deploy(master, "MasterSmartPolicy");
  const holderPolicy = await deploy(master, "HolderSmartPolicy");
  const renderer = await deploy(master, "ChoreographyTokenURIRenderer");
  const policies = {
    default: await deploy(master, "CreatorSmartPolicy"),
    constrained: await deploy(master, "CreatorSmartPolicyScaleScenario")
  };
  const tokenUri = new ethers.Interface([TOKEN_URI]);
  const timed = async (key, work) => {
    const start = performance.now();
    const result = await work();
    timings[key] = performance.now() - start;
    return result;
  };

  // The largest chain whose encoded model fits in a contract.
  let largest = 1;
  while (modelBytes(syntheticDataset(largest + 1, roles)) <= MODEL_LIMIT_BYTES) largest++;
  const sizes = [...new Set([...SCALE.sizes.filter((tasks) => tasks <= largest), largest])].sort((left, right) => left - right);

  const configFor = async (tasks) => {
    const file = path.join(workDirectory, `synthetic-${pad(tasks)}.nmt.json`);
    await fs.writeFile(file, json({ id: `Synthetic${pad(tasks)}`, name: `Synthetic chain of ${tasks} tasks`, sourceBpmn: `synthetic-${pad(tasks)}.bpmn`, nodes: [] }));
    return file;
  };
  // The cost and the size of the read every render makes: the traced gas of tokenURI and its bytes.
  const readOf = async (nmtAddress, assetAddress, timingKey) => {
    const data = tokenUri.encodeFunctionData("tokenURI", [BigInt(assetAddress)]);
    const trace = await provider.send("debug_traceCall", [{ from: ethers.ZeroAddress, to: nmtAddress, data }, "latest", { tracer: "callTracer" }]);
    assert.ok(!trace.error, `tokenURI failed: ${trace.error}`);
    const uri = await timed(`${timingKey}.tokenURI`, () => chain.readTokenURI(assetAddress));
    return { gas: BigInt(trace.gasUsed).toString(), bytes: Buffer.byteLength(uri) };
  };
  // The same update on the instance of each policy: its gas under each.
  const updateBoth = async (instances, model, nodes, where) => {
    const gas = {};
    for (const [name, asset] of Object.entries(instances)) {
      const receipt = await chain.mined(holder, { to: asset.target, data: setNodesData(asset, nodes) });
      assert.equal(receipt.status, 1, `${where}: the update was denied under the ${name} Creator policy`);
      gas[name] = receipt.gasUsed.toString();
    }
    for (const changed of nodes) model.set(changed.name, changed);
    for (const asset of Object.values(instances)) await chain.assertModel(asset.target, model, where);
    return gas;
  };
  const mintPair = async (nmtAddress, timingKey) => {
    const instances = {};
    const gas = { mint: {}, setRoles: {} };
    for (const [name, policy] of Object.entries(policies)) {
      const work = () => mintAsset(nmtAddress, policy.target, holderPolicy.target, roles, { signer: holder, creator, roleAccounts });
      const instance = name === "default" && timingKey ? await timed(`${timingKey}.mintAndLink`, work) : await work();
      instances[name] = contract("ChoreographyMutableAsset", instance.assetAddress, holder);
      gas.mint[name] = instance.receipts.mint.gasUsed.toString();
      gas.setRoles[name] = instance.receipts.setRoles.gasUsed.toString();
    }
    return { instances, gas };
  };
  const renewed = (model, index, label) => ({ ...model.get(`Task ${pad(index)}`), initiatingMessage: `Updated ${pad(label)}` });

  const measured = [];
  let largestNmt;
  for (const tasks of sizes) {
    const dataset = syntheticDataset(tasks, roles);
    const model = new Map(dataset.nodes.map((node) => [node.name, node]));
    const modelContract = await deployChoreographyModel(master, modelFromDataset(dataset));
    const nmt = await deployContract(master, ARTIFACTS.ChoreographyNMT, [masterPolicy.target, renderer.target, modelContract.address]);
    const key = `size-${pad(tasks)}`;
    const { instances, gas } = await mintPair(nmt.contract.target, key);
    const summary = summarizeNodes(dataset.nodes, roles);
    const read = await readOf(nmt.contract.target, instances.default.target, key);
    await timed(`${key}.render`, async () => chain.render(instances.default.target, await configFor(tasks)));
    const middle = Math.ceil(tasks / 2);
    const updateOne = await updateBoth(instances, model, [renewed(model, middle, tasks)], `${key} one task`);
    const batch = Array.from({ length: Math.min(SCALE.batchUpdate, tasks) }, (_, index) => renewed(model, index + 1, tasks + 1));
    const updateBatch = await updateBoth(instances, model, batch, `${key} batch`);
    const inserted = { ...syntheticTask(middle, roles), name: "Inserted Task", initiatingMessage: "Inserted Request", returnMessage: "Inserted Reply" };
    const next = middle === tasks ? "End" : `Task ${pad(middle + 1)}`;
    const insert = await updateBoth(instances, model, insertTask(model, `Task ${pad(middle)}`, next, inserted), `${key} insert`);
    measured.push({
      tasks, nodes: summary.nodes, sequenceEdges: summary.sequenceEdges, messages: summary.messages, modelBytes: modelBytes(dataset),
      gas: { model: modelContract.receipt.gasUsed.toString(), nmt: nmt.receipt.gasUsed.toString(), ...gas, updateOne, updateBatch: { nodes: batch.length, ...updateBatch }, insertTask: insert },
      read
    });
    largestNmt = nmt.contract.target;
  }

  // Beyond the model contract: the largest instance grows by updates that append tasks to the chain.
  const dataset = syntheticDataset(largest, roles);
  const model = new Map(dataset.nodes.map((node) => [node.name, node]));
  const { instances } = await mintPair(largestNmt);
  const growth = [];
  let tasks = largest;
  while (tasks < SCALE.growTo) {
    const count = Math.min(SCALE.appendBatch, SCALE.growTo - tasks);
    const added = Array.from({ length: count }, (_, index) => syntheticTask(tasks + index + 1, roles));
    const chainNames = [`Task ${pad(tasks)}`, ...added.map((node) => node.name), "End"];
    const nodes = [
      { ...model.get(chainNames[0]), outgoing: [chainNames[1]] },
      ...added.map((node, index) => ({ ...node, incoming: [chainNames[index]], outgoing: [chainNames[index + 2]] })),
      { ...model.get("End"), incoming: [chainNames[count]] }
    ];
    const key = `grown-${pad(tasks + count)}`;
    const append = await updateBoth(instances, model, nodes, `${key} append`);
    tasks += count;
    const updateOne = await updateBoth(instances, model, [renewed(model, 1, tasks)], `${key} one task`);
    const read = await readOf(largestNmt, instances.default.target, key);
    await timed(`${key}.render`, async () => chain.render(instances.default.target, await configFor(tasks)));
    growth.push({ tasks, nodes: model.size, appended: count, nodesWritten: nodes.length, gas: { append, updateOne }, read });
  }

  return {
    shape: "a chain Start -> Task 001 -> ... -> Task n -> End, every task with two messages",
    roles: SCALE.roles,
    policies: { default: "CreatorSmartPolicy", constrained: "CreatorSmartPolicyScaleScenario" },
    modelLimit: {
      bytes: MODEL_LIMIT_BYTES,
      largest: { tasks: largest, modelBytes: modelBytes(syntheticDataset(largest, roles)) },
      firstTooLarge: { tasks: largest + 1, modelBytes: modelBytes(syntheticDataset(largest + 1, roles)) }
    },
    blockGasLimit: chain.blockGasLimit.toString(),
    sizes: measured,
    growth
  };
}

// Study 3: two organizations want different things on the same asset.
async function conflictsStudy(workDirectory) {
  const chain = await connect();
  const { signer } = chain;
  const paper = await setupPaper(chain, workDirectory);
  const { asset, model, typeId, licenses } = paper;
  const [carrierA, carrierB] = ["Carrier A", "Carrier B"].map(signer);
  const license = licenses.SpecialCarrier;
  const licenseNmt = paper.licenseNmts.SpecialCarrier;
  const licenseId = BigInt(license.target);
  const second = await paper.licenseMint(ROLE_LICENSES[LICENSED_ROLE], carrierA);
  const message = (name, text) => setNodesData(asset, [{ ...model.get(name), initiatingMessage: text }]);
  const linkRole = (target) => asset.interface.encodeFunctionData("setRoles", [[LICENSED_ROLE], [target]]);
  const transactions = {
    "X1.holder-replaces-creator-policy": { to: asset.target, data: asset.interface.encodeFunctionData("setCreatorSmartPolicy", [paper.type.creator.contract.target]) },
    "X2.master-updates-instance": { to: asset.target, data: message("Transport Details", "Cargo Specification by the Master") },
    "X3.master-replaces-holder-policy": { to: asset.target, data: asset.interface.encodeFunctionData("setHolderSmartPolicy", [paper.type.holder.contract.target]) },
    "X4.participant-updates-instance": { to: asset.target, data: message("Request Details", "Request by Carrier A") },
    "X5.holder-updates-license": { to: license.target, data: license.interface.encodeFunctionData("setName", [typeId("Named by the Holder")]) },
    "X6.authority-updates-license": { to: license.target, data: license.interface.encodeFunctionData("setName", [typeId("Named by the authority")]) },
    "X7.sale-without-holder": { to: licenseNmt.target, data: licenseNmt.interface.encodeFunctionData("transferFrom", [carrierA.address, carrierB.address, licenseId]) },
    "X8.second-license": { to: licenseNmt.target, data: licenseNmt.interface.encodeFunctionData("mint", second.args) },
    "X9.holder-relinks-role": { to: asset.target, data: linkRole(second.license.target) },
    "X10.holder-links-other-type": { to: asset.target, data: linkRole(licenses[EXTRA_LICENSE.type].target) }
  };
  // Who plays the licensed role, read from the chain: the license the role points to and its holder.
  const played = async () => {
    const roleLicense = await asset.getRole(LICENSED_ROLE);
    const label = roleLicense === license.target ? "the first SpecialCarrier license" : roleLicense === second.license.target ? "the second SpecialCarrier license" : roleLicense;
    return { roleLinkedTo: label, playedBy: chain.accountName(await licenseNmt.ownerOf(BigInt(roleLicense))) };
  };
  const cases = [];
  const before = await played();
  for (const spec of CONFLICTS) {
    const receipt = await chain.mined(signer(spec.from), transactions[spec.key]);
    const observed = await chain.observe(spec.key, spec, receipt);
    cases.push({ key: spec.key, parties: spec.parties, intent: spec.intent, ...observed, prevails: spec.prevails, rule: spec.rule, licensedRole: await played() });
  }
  await chain.assertModel(asset.target, model, "conflicts: the model");
  return { licensedRole: LICENSED_ROLE, before, model: "unchanged by the whole study, node by node", cases };
}

// Study 4: transactions that meet in the same block.
async function concurrencyStudy(workDirectory) {
  const chain = await connect();
  const { signer, deploy } = chain;
  const paper = await setupPaper(chain, workDirectory);
  const { asset, holder, model, delta, licenses } = paper;
  const [carrierA, carrierB] = ["Carrier A", "Carrier B"].map(signer);
  const license = licenses.SpecialCarrier;
  const licenseNmt = paper.licenseNmts.SpecialCarrier.connect(carrierA);
  const others = [];
  for (let index = 0; index < 4; index++) others.push(await paper.mintInstance());
  // The delta on an instance alone in its block, to compare with the same delta in a shared block.
  const alone = await chain.mined(holder, { to: others[3].target, data: setNodesData(others[3], delta.nodes) });
  assert.equal(alone.status, 1, "the delta alone was denied");
  const denyAll = await deploy(holder, "DenyAllSmartPolicy");
  const apply = (nodes) => { for (const changed of nodes) model.set(changed.name, changed); };
  const node = (name) => model.get(name);
  const field = async (name) => {
    const { nodes } = await chain.modelOf(asset.target);
    const { initiatingMessage, returnMessage } = nodes.find((item) => item.name === name);
    return { initiatingMessage, returnMessage };
  };

  // Each case returns the transactions of its block, in order, and what it reads afterwards.
  const cases = {
    "K1.two-organizations": async () => ({
      transactions: [
        { from: holder, to: asset.target, data: setNodesData(asset, delta.nodes) },
        { from: carrierA, to: licenseNmt.target, data: licenseNmt.interface.encodeFunctionData("transferFrom", [carrierA.address, carrierB.address, BigInt(license.target)]) }
      ],
      after: async () => {
        apply(delta.nodes);
        return { licenseHolder: chain.accountName(await licenseNmt.ownerOf(BigInt(license.target))) };
      }
    }),
    "K2.license-first": async () => {
      const update = [{ ...node("Arrival Intermediate"), initiatingMessage: "Arrival Notification" }];
      return {
        transactions: [
          { from: carrierB, to: license.target, data: license.interface.encodeFunctionData("setHolderSmartPolicy", [paper.participantHolder.target]) },
          { from: holder, to: asset.target, data: setNodesData(asset, update) }
        ],
        after: async () => { apply(update); return {}; }
      };
    },
    "K3.lost-update": async () => {
      const base = node("Transport Details");
      const first = { ...base, initiatingMessage: "Detailed Cargo Specification" };
      const second = { ...base, returnMessage: "Vehicle and Driver Assignment" };
      return {
        transactions: [first, second].map((update) => ({ from: holder, to: asset.target, data: setNodesData(asset, [update]) })),
        after: async () => {
          apply([second]);
          const final = await field(base.name);
          assert.equal(final.initiatingMessage, base.initiatingMessage, "K3: the first update was expected to be lost");
          return {
            task: base.name,
            before: { initiatingMessage: base.initiatingMessage, returnMessage: base.returnMessage },
            firstUpdate: { initiatingMessage: first.initiatingMessage },
            secondUpdate: { returnMessage: second.returnMessage },
            after: final,
            lost: `the initiating message "${first.initiatingMessage}" of the first update`
          };
        }
      };
    },
    "K4.limit-under-race": async () => {
      const first = insertTask(model, "Arrival Intermediate", "Delivery of Product", optionalTask("Optional Quality Inspection"));
      const second = insertTask(model, "Order Intermediate", "FWD Oder Intermediate", optionalTask("Optional Customs Inspection"));
      const single = paper.type.creator.contract;
      // Each update is within the limits on the state before the block.
      for (const update of [first, second]) {
        assert.equal(await paper.paperCreator.evaluateNodeUpdate(asset.target, ...toNodeUpdate(update).slice(0, 4)), true, "K4: each update must pass alone");
        assert.equal(await single.evaluateNodeUpdate(asset.target, ...toNodeUpdate(update).slice(0, 4)), true, "K4: each update must be well formed");
      }
      return {
        transactions: [first, second].map((update) => ({ from: holder, to: asset.target, data: setNodesData(asset, update) })),
        after: async () => { apply(first); return { eachPassesAlone: true, tasksAfter: (await chain.assertModel(asset.target, model, "K4")).tasks }; }
      };
    },
    "K5.three-instances": async () => ({
      transactions: others.slice(0, 3).map((instance) => ({ from: holder, to: instance.target, data: setNodesData(instance, delta.nodes) })),
      after: async () => ({ gasAlone: alone.gasUsed.toString() })
    }),
    "K6.freeze-in-block": async () => ({
      transactions: [
        { from: holder, to: asset.target, data: asset.interface.encodeFunctionData("setHolderSmartPolicy", [denyAll.target]) },
        { from: holder, to: asset.target, data: setNodesData(asset, [{ ...node("Request Details"), initiatingMessage: "Cargo Details Inquiry" }]) }
      ],
      after: async () => ({})
    })
  };

  const results = [];
  for (const spec of CONCURRENCY) {
    const { transactions, after } = await cases[spec.key]();
    assert.equal(transactions.length, spec.transactions.length, `${spec.key}: the run and the specification disagree on the transactions`);
    const receipts = await chain.sameBlock(transactions);
    const observed = [];
    for (const [index, receipt] of receipts.entries()) {
      observed.push({ position: index + 1, label: spec.transactions[index].label, ...await chain.observe(`${spec.key} #${index + 1}`, spec.transactions[index], receipt) });
    }
    const read = await after();
    await chain.assertModel(asset.target, model, spec.key);
    results.push({ key: spec.key, description: spec.description, finding: spec.finding, transactions: observed, ...(Object.keys(read).length ? { observed: read } : {}) });
  }
  return { mining: "automine off: the transactions of a case are sent, then one block is mined; their order is the position in that block", cases: results };
}

// One execution of the four studies: the evidence and the durations of the scalability steps.
async function runStudies() {
  const workDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "chornmt-extended-"));
  const timings = {};
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const hardhatConfig = (await import(path.join(root, "hardhat.config.js"))).default;
    const evidence = {
      evaluation: "ChorNMT extended evaluation",
      specification: "scripts/experiment/extended-spec.js",
      provenance: {
        solc: hardhatConfig.solidity.version,
        optimizer: hardhatConfig.solidity.settings.optimizer,
        node: process.versions.node.split(".")[0],
        hardhat: packageJson.devDependencies.hardhat,
        network: "hardhat (edr-simulated, ephemeral), one network per study",
        polUsdPrice: POL_USD_PRICE,
        timings: "timings.json, measured over the repetitions and not compared"
      },
      updates: await updatesStudy(workDirectory),
      scalability: await scaleStudy(workDirectory, timings),
      conflicts: await conflictsStudy(workDirectory),
      concurrency: await concurrencyStudy(workDirectory)
    };
    return { evidence, timings };
  } finally {
    await fs.rm(workDirectory, { recursive: true, force: true });
  }
}

function statistics(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const round = (value) => Math.round(value * 1000) / 1000;
  return {
    medianMs: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    minMs: round(sorted[0]),
    maxMs: round(sorted[sorted.length - 1]),
    samplesMs: samples.map(round)
  };
}

async function main() {
  const repetitions = Number(process.env.EXTENDED_REPETITIONS ?? 3);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("EXTENDED_REPETITIONS must be a positive integer");
  const runs = [];
  const log = console.log;
  console.log = () => {};
  try {
    for (let run = 0; run <= repetitions; run++) {
      const result = await runStudies();
      if (runs.length > 0 && json(result.evidence) !== json(runs[0].evidence)) {
        throw new Error(`run ${run} produced different evidence from the first run: the extended evaluation is not deterministic`);
      }
      runs.push(result);
    }
  } finally {
    console.log = log;
  }
  const [{ evidence }] = runs;
  const measured = runs.slice(1).map((run) => run.timings);
  const cpus = os.cpus();
  const timings = {
    repetitions,
    warmUpRuns: 1,
    note: "Wall-clock durations on the local network and machine, over the measured runs; the warm-up run is excluded. They measure the off-chain work and the local execution, not the latency of a public network. Not compared by check:evidence.",
    machine: { platform: `${os.platform()} ${os.release()}`, arch: os.arch(), cpu: cpus[0]?.model ?? "unknown", cores: cpus.length, memoryGiB: Math.round(os.totalmem() / 2 ** 30), node: process.versions.node },
    steps: Object.fromEntries(Object.keys(measured[0]).map((key) => [key, statistics(measured.map((timing) => timing[key]))]))
  };
  await fs.rm(outDirectory, { recursive: true, force: true });
  await fs.mkdir(outDirectory, { recursive: true });
  await fs.writeFile(path.join(outDirectory, "extended.json"), json(evidence));
  await fs.writeFile(path.join(outDirectory, "timings.json"), json(timings));
  console.log(`Extended evaluation: ${path.relative(root, outDirectory)} (${evidence.updates.series.length} updates, ${evidence.scalability.sizes.length} model sizes and ${evidence.scalability.growth.length} grown ones, ${evidence.conflicts.cases.length} conflicts, ${evidence.concurrency.cases.length} same-block cases; ${repetitions} measured runs after a warm-up, all identical)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
