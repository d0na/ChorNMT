// The experiment run (decisions D16-D18): executes the phases of phases.js, through the same
// functions as the CLI commands, once as warm-up and EXPERIMENT_REPETITIONS more times (default
// 10), each on a fresh ephemeral Hardhat network, and fails unless every run gives the same
// evidence. Every value in the evidence comes from a receipt, a call trace, or a chain read; a run
// fails as soon as a transaction differs from the specification. It writes experiment.json,
// transactions.csv, traces.json, timings.json, and the BPMN XML of the two renders.
//
// npm run evidence:update [-- --out <dir>]   (default evaluation/evidence/; EVIDENCE_OUT for this script alone)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import hre from "hardhat";
import { Interface, keccak256 } from "ethers";
import { importBpmnToNmt } from "../../bpmn-builder-js/scripts/import-bpmn.js";
import { choreographyFromTokenURI } from "../../bpmn-builder-js/scripts/web3.js";
import { deployChoreographyType, deployContract, mintAsset } from "../deploy-local.js";
import { ARTIFACTS, loadArtifacts } from "./contracts.js";
import { loadTrustTables, trustRow } from "./trust-tables.js";
import { applyAssetDelta } from "../apply-asset-delta.js";
import { renderAsset } from "../render-asset.js";
import { summarizeNodes } from "../evaluation/metrics.js";
import { ACCOUNTS, INPUTS, LICENSED_ROLE, PHASES, ROLE_ACCOUNTS } from "./phases.js";

const root = process.cwd();
const outDirectory = path.resolve(root, process.env.EVIDENCE_OUT || path.join("evaluation", "evidence"));
const GAS_LIMIT = 10_000_000n;
// The USD columns of the reports need a fixed price to be reproducible (D18).
const ETH_USD_PRICE = Number(process.env.ETH_USD_PRICE) > 0 ? Number(process.env.ETH_USD_PRICE) : 3000;

const POLICY_LAYERS = ["CREATOR", "HOLDER"];

const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const json = (value) => `${JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;

class Recorder {
  constructor({ ethers, artifacts, accounts, trustTables, instrument }) {
    this.instrument = instrument;
    this.ethers = ethers;
    this.artifacts = artifacts;
    this.accounts = accounts;
    this.trustTables = trustTables;
    this.addressBook = new Map();
    this.records = [];
    this.expected = PHASES.flatMap((phase) => phase.transactions.map((transaction) => ({ ...transaction, phase: phase.id })));
    this.traces = {};
  }

  // label: how the diagrams and tables name this contract when more than one has its type.
  name(address, contract, label = contract) {
    if (!this.addressBook.has(address.toLowerCase())) this.addressBook.set(address.toLowerCase(), { address, contract, label });
  }

  contractAt(address) {
    if (!address) return null;
    if (/^0x0{40}$/.test(address)) return "none";
    return this.addressBook.get(address.toLowerCase())?.contract ?? null;
  }

  accountName(address) {
    return this.accounts.find((account) => account.address.toLowerCase() === address.toLowerCase())?.name ?? null;
  }

  next(key) {
    const expected = this.expected[this.records.length];
    assert.ok(expected, `${key}: the specification has no more transactions`);
    assert.equal(key, expected.key, `transaction ${this.records.length + 1}: the run sent ${key}, the specification expects ${expected.key}`);
    return expected;
  }

  decodeRevert(data) {
    if (!data || data === "0x") return "revert without data";
    for (const artifact of Object.values(this.artifacts)) {
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
  }

  // Records the receipt of a transaction the run already sent, and checks it against the
  // specification. Tracing and checking are instrumentation: their time is not a phase duration.
  async record(key, receipt, options) {
    return this.instrument(() => this.recordReceipt(key, receipt, options));
  }

  async recordReceipt(key, receipt, { deployed } = {}) {
    const expected = this.next(key);
    const trace = await this.ethers.provider.send("debug_traceTransaction", [receipt.hash, { tracer: "callTracer" }]);
    const outcome = receipt.status === 1 ? "allowed" : "denied";
    const reason = outcome === "denied" ? this.decodeRevert(trace.output) : null;
    const caller = this.accountName(receipt.from);
    let call;
    if (!receipt.to) {
      const contract = expected.call.split(".")[0];
      this.name(receipt.contractAddress, contract);
      if (deployed) this.name(deployed, contract);
      call = `${contract}.constructor`;
    } else {
      const contract = this.contractAt(receipt.to);
      const parsed = contract && this.artifacts[contract]?.iface.parseTransaction({ data: trace.input });
      call = `${contract ?? receipt.to}.${parsed?.name ?? trace.input.slice(0, 10)}`;
    }
    assert.equal(caller, expected.from, `${key}: sent by ${caller}, the specification expects ${expected.from}`);
    assert.equal(call, expected.call, `${key}: called ${call}, the specification expects ${expected.call}`);
    assert.equal(outcome, expected.expect, `${key}: ${outcome}, the specification expects ${expected.expect}${reason ? ` (${reason})` : ""}`);
    assert.equal(reason, expected.reason, `${key}: denied with ${reason}, the specification expects ${expected.reason}`);
    this.traces[key] = trace;
    const record = {
      key,
      phase: expected.phase,
      label: expected.label,
      from: { account: caller, address: receipt.from },
      to: receipt.to ? { contract: this.contractAt(receipt.to), address: receipt.to } : null,
      created: receipt.contractAddress ? { contract: this.contractAt(receipt.contractAddress), address: receipt.contractAddress } : null,
      call,
      outcome,
      reason,
      trust: trustRow(this.trustTables, expected.trust),
      gasUsed: receipt.gasUsed.toString(),
      gasPriceWei: receipt.gasPrice.toString(),
      costWei: (receipt.gasUsed * receipt.gasPrice).toString(),
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber
    };
    this.records.push(record);
    return record;
  }

  async allow(key, send) {
    const receipt = await (await send()).wait();
    return this.record(key, receipt);
  }

  // A denied transaction is sent with a fixed gas limit, so it is mined and reverts on-chain.
  async deny(key, signer, transaction) {
    let receipt;
    try {
      receipt = await (await signer.sendTransaction({ ...transaction, gasLimit: GAS_LIMIT })).wait();
    } catch (error) {
      receipt = error.receipt || (error.transactionHash && await signer.provider.getTransactionReceipt(error.transactionHash));
    }
    assert.ok(receipt, `${key}: no receipt, the transaction was not mined`);
    return this.record(key, receipt);
  }

  async deploy(key, signer, contract, args = []) {
    const { contract: deployed, receipt } = await deployContract(signer, ARTIFACTS[contract], args);
    await this.record(key, receipt);
    return deployed;
  }

  done() {
    assert.equal(this.records.length, this.expected.length,
      `the run sent ${this.records.length} transactions, the specification lists ${this.expected.length}; missing: ${this.expected.slice(this.records.length).map((item) => item.key).join(", ")}`);
  }
}

function toNodeUpdate(nodes) {
  return [
    nodes.map((node) => node.name),
    nodes.map((node) => node.nodeType),
    nodes.map((node) => node.incoming),
    nodes.map((node) => node.outgoing),
    nodes.map((node) => node.conditions),
    nodes.map((node) => node.initiatorRole),
    nodes.map((node) => node.participantRole),
    nodes.map((node) => node.initiatingMessage),
    nodes.map((node) => node.returnMessage)
  ];
}

// One execution of the experiment on a fresh ephemeral network: the evidence, the traces, the BPMN
// XML of the two renders, and the duration of every phase and sub-step.
async function runExperiment() {
  const { ethers } = await hre.network.connect("hardhat");
  const timings = { phases: {}, steps: {} };
  // The time the run spends tracing, reading the state it reports, and checking is instrumentation,
  // not part of what a user of the contracts waits for: each phase duration leaves it out.
  let instrumentationMs = 0;
  const instrument = async (work) => {
    const start = performance.now();
    try {
      return await work();
    } finally {
      instrumentationMs += performance.now() - start;
    }
  };
  let lapStart = performance.now();
  let lapInstrumentation = 0;
  const lap = (id) => {
    const now = performance.now();
    timings.phases[id] = now - lapStart - (instrumentationMs - lapInstrumentation);
    lapStart = now;
    lapInstrumentation = instrumentationMs;
  };
  const signers = await ethers.getSigners();
  const accounts = ACCOUNTS.map((account) => ({ ...account, address: signers[account.index].address }));
  const signer = (name) => signers[ACCOUNTS.find((account) => account.name === name).index];
  const administrator = signer("Administrator");
  const [carrierA, carrierB, carrierC, supplierCompany, authority] =
    ["Carrier A", "Carrier B", "Carrier C", "Supplier company", "Authority"].map(signer);
  const artifacts = await loadArtifacts();
  const rec = new Recorder({ ethers, artifacts, accounts, trustTables: await loadTrustTables(path.join(root, INPUTS.trustTables)), instrument });
  const readTokenURI = (address) => new ethers.Contract(address, ["function tokenURI() view returns (string)"], ethers.provider).tokenURI();
  const contract = (name, address, runner = administrator) => new ethers.Contract(address, artifacts[name].abi, runner);
  const phases = {};
  const workDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "chornmt-experiment-"));

  // The chain state an output block reports: roles and node counts of an instance.
  const instanceState = async (address) => {
    const { roles, nodes } = choreographyFromTokenURI(await readTokenURI(address));
    return {
      address,
      ...summarizeNodes(nodes, roles),
      roleAssignments: roles.map((role) => ({ role: role.name, address: role.address, account: rec.accountName(role.address), contract: rec.contractAt(role.address) }))
    };
  };
  // The policies in force on a resource, with the bytecode that runs.
  const policyEntry = async (resource, layer, address) => {
    const name = rec.contractAt(address);
    if (name === "none") return { resource, layer, contract: "none", address };
    const code = await ethers.provider.getCode(address);
    const file = ARTIFACTS[name];
    return { resource, layer, contract: name, address, source: `contracts/${file.includes("/") ? file : `choreography/${file}`}.sol`, bytecodeKeccak256: keccak256(code) };
  };
  const finishPhase = (id, extra) => { phases[id] = { ...(phases[id] || {}), ...extra }; };
  // What exists when a phase ends: the policies of the choreography type, of the main instance,
  // and of the license that plays the role, read from the chain at that moment.
  const live = {};
  const endPhase = (id, extra = {}) => instrument(async () => {
    const policies = [];
    if (live.nmt) policies.push(await policyEntry("choreography type", "Master", await live.nmt.masterSmartPolicy()));
    if (live.asset) {
      policies.push(await policyEntry("instance", "Creator", await live.asset.creatorSmartPolicy()));
      policies.push(await policyEntry("instance", "Holder", await live.asset.holderSmartPolicy()));
    }
    if (live.participantNmt) policies.push(await policyEntry("license type", "Master", await live.participantNmt.masterSmartPolicy()));
    if (live.license) {
      policies.push(await policyEntry("licensed role", "Creator", await live.license.creatorSmartPolicy()));
      policies.push(await policyEntry("licensed role", "Holder", await live.license.holderSmartPolicy()));
    }
    finishPhase(id, { policies, ...(live.asset ? { instance: await instanceState(live.asset.target) } : {}), ...extra });
  });

  // F1: the choreography type through the deploy:asset functions, then the license infrastructure.
  // F1 starts here: connecting to the network and loading the artifacts are not part of a phase.
  lapStart = performance.now();
  const importStart = lapStart;
  const imported = await importBpmnToNmt(path.join(root, INPUTS.bpmn), path.join(workDirectory, "paper-example.nmt.json"));
  timings.steps["F1.import"] = performance.now() - importStart;
  const { dataset } = imported;
  const type = await deployChoreographyType(administrator, dataset);
  for (const [key, part, name] of [
    ["F1.deploy.master", type.master, "MasterSmartPolicy"],
    ["F1.deploy.creator", type.creator, "CreatorSmartPolicy"],
    ["F1.deploy.holder", type.holder, "HolderSmartPolicy"],
    ["F1.deploy.renderer", type.renderer, "ChoreographyTokenURIRenderer"],
    ["F1.deploy.model", type.model, "ChoreographyModel"],
    ["F1.deploy.nmt", type.choreographyNmt, "ChoreographyNMT"]
  ]) {
    rec.name(part.receipt.contractAddress, name, name === "ChoreographyModel" ? "Model (SSTORE2)" : name);
    await rec.record(key, part.receipt);
  }
  const nmtAddress = type.choreographyNmt.contract.target;
  const nmt = contract("ChoreographyNMT", nmtAddress);
  const participantMaster = await rec.deploy("F1.deploy.participant-master", administrator, "ParticipantMasterSmartPolicy");
  const participantRenderer = await rec.deploy("F1.deploy.participant-renderer", administrator, "ParticipantTokenURIRenderer");
  const participantNmt = await rec.deploy("F1.deploy.participant-nmt", administrator, "ParticipantNMT", [participantMaster.target, participantRenderer.target]);
  const certifier = await rec.deploy("F1.deploy.certifier", authority, "ParticipantCreatorSmartPolicy");
  const participantHolder = await rec.deploy("F1.deploy.participant-holder", administrator, "ParticipantHolderSmartPolicy");
  const participantAM = await rec.deploy("F1.deploy.participant-am", administrator, "ChoreographyParticipantAM", [participantNmt.target, certifier.target]);
  const paperCreator = await rec.deploy("F1.deploy.paper-creator", administrator, "CreatorSmartPolicyPaperScenario", [participantAM.target]);
  live.nmt = nmt;
  live.participantNmt = participantNmt;
  await endPhase("F1", {
    offchain: [{ step: "import", function: "importBpmnToNmt", input: INPUTS.bpmn, output: "NMT dataset (roles and nodes)", sha256: sha256(JSON.stringify({ roles: dataset.roles, nodes: dataset.nodes })) }],
    model: {
      ...summarizeNodes(dataset.nodes, dataset.roles),
      roleNames: dataset.roles,
      modelBytes: ((await ethers.provider.getCode(type.model.address)).length - 2) / 2
    }
  });
  lap("F1");

  // F2: the instance is born with the model and the paper-scenario Creator policy.
  const roleAccounts = dataset.roles.filter((role) => role !== LICENSED_ROLE);
  assert.deepEqual([...roleAccounts].sort(), Object.keys(ROLE_ACCOUNTS).sort(), "phases.js must name an account for every role of the model except the licensed one");
  const roleAddresses = roleAccounts.map((role) => signer(ROLE_ACCOUNTS[role]).address);
  const instance = await mintAsset(nmtAddress, paperCreator.target, type.holder.contract.target, roleAccounts, { signer: administrator, roleAccounts: roleAddresses });
  rec.name(instance.assetAddress, "ChoreographyMutableAsset", "Instance");
  await rec.record("F2.mint", instance.receipts.mint);
  await rec.record("F2.roles", instance.receipts.setRoles);
  const asset = contract("ChoreographyMutableAsset", instance.assetAddress);
  const mintArgs = (holder) => [holder, paperCreator.target, type.holder.contract.target];
  await rec.deny("F2.denied.unauthorized-creator", signer("Unauthorized creator"), {
    to: nmtAddress, data: nmt.interface.encodeFunctionData("mint", mintArgs(signer("Unauthorized creator").address))
  });
  await rec.deny("F2.denied.ineligible-holder", administrator, {
    to: nmtAddress, data: nmt.interface.encodeFunctionData("mint", mintArgs(signer("Ineligible holder").address))
  });
  live.asset = asset;
  await endPhase("F2");
  lap("F2");

  // F3: licenses of three types; only a SpecialCarrier license can play the Special Carrier role.
  const typeId = (name) => ethers.encodeBytes32String(name);
  const mintLicense = async (key, holder, participantType) => {
    const args = [holder.address, certifier.target, participantHolder.target, typeId(participantType)];
    const [licenseAddress] = await participantNmt.connect(authority).mintWithParticipantType.staticCall(...args);
    rec.name(licenseAddress, "ParticipantMutableAsset", `${participantType} license`);
    await rec.allow(key, () => participantNmt.connect(authority).mintWithParticipantType(...args));
    return contract("ParticipantMutableAsset", licenseAddress, holder);
  };
  const specialCarrierLicense = await mintLicense("F3.license.special-carrier", carrierA, "SpecialCarrier");
  const carrierLicense = await mintLicense("F3.license.carrier", carrierC, "Carrier");
  const supplierLicense = await mintLicense("F3.license.supplier", supplierCompany, "Supplier");
  const linkRole = (roleName, target) => ({ to: asset.target, data: asset.interface.encodeFunctionData("setRoles", [[roleName], [target]]) });
  await rec.deny("F3.denied.plain-account", administrator, linkRole(LICENSED_ROLE, carrierA.address));
  await rec.deny("F3.denied.carrier-license", administrator, linkRole(LICENSED_ROLE, carrierLicense.target));
  await rec.deny("F3.denied.supplier-license", administrator, linkRole(LICENSED_ROLE, supplierLicense.target));
  await rec.allow("F3.link", () => asset.setRoles([LICENSED_ROLE], [specialCarrierLicense.target]));
  await rec.deny("F3.denied.new-role", administrator, linkRole("Backup Carrier", specialCarrierLicense.target));
  const delta = JSON.parse(await fs.readFile(path.join(root, INPUTS.delta), "utf8"));
  const evolvedNodes = [...new Map([...dataset.nodes, ...delta.nodes].map((node) => [node.name, node])).values()];
  const licensedNodes = evolvedNodes.filter((node) => node.initiatorRole === LICENSED_ROLE || node.participantRole === LICENSED_ROLE);
  const licensedMessages = [...new Set(licensedNodes.flatMap((node) => [node.initiatingMessage, node.returnMessage]))].filter(Boolean).map(typeId);
  const foreignMessage = evolvedNodes.flatMap((node) => [node.initiatingMessage, node.returnMessage])
    .find((message) => message && !licensedMessages.includes(typeId(message)));
  await rec.allow("F3.license.name", () => specialCarrierLicense.connect(carrierA).setName(typeId("Carrier A")));
  await rec.allow("F3.license.messages", () => specialCarrierLicense.connect(carrierA).setMessages(licensedMessages));
  await rec.deny("F3.denied.foreign-message", carrierA, {
    to: specialCarrierLicense.target, data: specialCarrierLicense.interface.encodeFunctionData("setMessages", [[typeId(foreignMessage)]])
  });
  live.license = specialCarrierLicense;
  await endPhase("F3");
  lap("F3");

  // F4 and F8 render through the render:asset function, reading tokenURI from this network. The
  // run traces the tokenURI call and hashes what each off-chain step wrote; the raw and normalized
  // JSON are hashed without contractExport.exportedAt and rpcUrl, the only fields that change.
  const stableHash = (text) => {
    const data = JSON.parse(text);
    if (data.contractExport) {
      delete data.contractExport.exportedAt;
      delete data.contractExport.rpcUrl;
    }
    return sha256(JSON.stringify(data));
  };
  const render = async (id, configPath) => {
    const tokenURIData = new Interface(["function tokenURI() view returns (string)"]).encodeFunctionData("tokenURI");
    rec.traces[`${id}.tokenURI`] = await instrument(() => ethers.provider.send("debug_traceCall", [{ from: "0x0000000000000000000000000000000000000000", to: instance.assetAddress, data: tokenURIData }, "latest", { tracer: "callTracer" }]));
    const renderStart = performance.now();
    const result = await renderAsset(instance.assetAddress, configPath, { readTokenURI });
    timings.steps[`${id}.render`] = performance.now() - renderStart;
    const xml = await fs.readFile(result.xmlPath, "utf8");
    // endPhase is instrumentation; the hashes are computed inside it.
    await endPhase(id, {
      reads: [{ key: `${id}.tokenURI`, call: "ChoreographyMutableAsset.tokenURI", by: "eth_call (any account)" }],
      offchain: [
        { step: "export", function: "exportContractToJson", output: "raw JSON", sha256: stableHash(await fs.readFile(result.rawJsonPath, "utf8")), hashedWithout: ["contractExport.exportedAt", "contractExport.rpcUrl"] },
        { step: "normalize", function: "normalizeInput", output: "normalized JSON", sha256: stableHash(await fs.readFile(result.normalizedPath, "utf8")), hashedWithout: ["contractExport.exportedAt", "contractExport.rpcUrl"] },
        { step: "generate", function: "generateBpmnXml", output: "BPMN XML", sha256: sha256(xml) }
      ],
      render: { xml }
    });
  };
  await render("F4", imported.outputPath);
  lap("F4");

  // F5: the delta through the modify:asset function, then five well-formed updates the
  // paper-scenario Creator policy denies, each for the constraint its key names.
  const deltaStart = performance.now();
  const applied = await applyAssetDelta(instance.assetAddress, path.join(root, INPUTS.delta), { render: false, signer: administrator });
  timings.steps["F5.delta"] = performance.now() - deltaStart;
  await rec.record("F5.delta", applied.receipts.setNodes);
  const defaultCreator = contract("CreatorSmartPolicy", type.creator.contract.target);
  const denyUpdate = async (key, nodes) => {
    await instrument(async () => assert.equal(await defaultCreator.evaluateNodeUpdate(asset.target, ...toNodeUpdate(nodes).slice(0, 4)), true, `${key}: the denied update must be well formed`));
    await rec.deny(key, administrator, { to: asset.target, data: asset.interface.encodeFunctionData("setNodes", toNodeUpdate(nodes)) });
  };
  const evolved = (name) => evolvedNodes.find((node) => node.name === name);
  const optionalTask = {
    name: "Optional Customs Inspection", nodeType: 2, incoming: [], outgoing: [], conditions: [],
    initiatorRole: "Middleman", participantRole: LICENSED_ROLE, initiatingMessage: "Optional customs inspection", returnMessage: ""
  };
  await denyUpdate("F5.denied.task-limit", [optionalTask, { ...optionalTask, name: "Optional Quality Inspection" }]);
  const waybill = evolved("Waybill for Intermediate");
  const extraTargets = ["Delivery of Product", "Order Intermediate"];
  await denyUpdate("F5.denied.flow-limit", [
    { ...waybill, outgoing: [...waybill.outgoing, ...extraTargets], conditions: [...waybill.conditions, "", ""] },
    ...extraTargets.map((name) => ({ ...evolved(name), incoming: [...evolved(name).incoming, waybill.name] }))
  ]);
  await denyUpdate("F5.denied.task-name", [{ ...optionalTask, name: "Unapproved Customs Task" }]);
  await rec.deny("F5.denied.unknown-target", administrator, {
    to: asset.target, data: asset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...waybill, outgoing: ["Unknown BPMN node"] }]))
  });
  await denyUpdate("F5.denied.protected-node", [{ ...evolved("Order"), initiatingMessage: "Modified order request" }]);
  await endPhase("F5");
  lap("F5");

  // F6: the license changes holder; the role stays linked to it.
  const licenseId = BigInt(specialCarrierLicense.target);
  const sell = (from, to) => ({ to: participantNmt.target, data: participantNmt.interface.encodeFunctionData("transferFrom", [from.address, to.address, licenseId]) });
  const setName = (name) => ({ to: specialCarrierLicense.target, data: specialCarrierLicense.interface.encodeFunctionData("setName", [typeId(name)]) });
  const licenseChecks = () => instrument(async () => ({
    licenseHolder: rec.accountName(await participantNmt.ownerOf(licenseId)),
    roleLinkedTo: rec.contractAt(await asset.getRole(LICENSED_ROLE)),
    roleLicense: await asset.getRole(LICENSED_ROLE),
    licenseName: ethers.decodeBytes32String(await specialCarrierLicense.getName()),
    messagesWriter: rec.accountName(await specialCarrierLicense.getMessagesWriter()),
    holderPolicy: rec.contractAt(await specialCarrierLicense.holderSmartPolicy())
  }));
  const beforeSale = await licenseChecks();
  await rec.deny("F6.denied.carrier-buyer", carrierA, sell(carrierA, carrierC));
  await rec.deny("F6.denied.supplier-buyer", carrierA, sell(carrierA, supplierCompany));
  await rec.deny("F6.denied.without-seller", carrierB, sell(carrierA, carrierB));
  await rec.allow("F6.sale", () => participantNmt.connect(carrierA).transferFrom(carrierA.address, carrierB.address, licenseId));
  const afterSale = await licenseChecks();
  await rec.deny("F6.denied.buyer-without-policy", carrierB, setName("Carrier B"));
  await rec.allow("F6.buyer.holder-policy", () => specialCarrierLicense.connect(carrierB).setHolderSmartPolicy(participantHolder.target));
  await rec.deny("F6.denied.former-holder", carrierA, setName("Carrier A"));
  await rec.allow("F6.buyer.name", () => specialCarrierLicense.connect(carrierB).setName(typeId("Carrier B")));
  await rec.allow("F6.buyer.profile", () => specialCarrierLicense.connect(carrierB).setProfile(ethers.id("Carrier B organization profile")));
  await rec.allow("F6.buyer.messages", () => specialCarrierLicense.connect(carrierB).setMessages(licensedMessages));
  const afterBuyer = await licenseChecks();
  // The role keeps its tasks and its license through the sale.
  for (const node of licensedNodes) {
    const [, , , , , initiatorRole, participantRole] = await asset.getNode(node.name);
    assert.ok(initiatorRole === LICENSED_ROLE || participantRole === LICENSED_ROLE, `${node.name} lost the ${LICENSED_ROLE} role`);
  }
  await endPhase("F6", {
    checks: { beforeSale, afterSale, afterBuyerUpdates: afterBuyer },
    roleTasks: licensedNodes.map((node) => node.name),
    messages: licensedMessages.map((message) => ethers.decodeBytes32String(message))
  });
  lap("F6");

  // F7: a second instance, with the default policies, restricted by its holder.
  const denyAll = await rec.deploy("F7.deploy.deny-all", administrator, "DenyAllSmartPolicy");
  const defaultMint = [administrator.address, type.creator.contract.target, type.holder.contract.target];
  const [restrictedAddress] = await nmt.mint.staticCall(...defaultMint);
  rec.name(restrictedAddress, "ChoreographyMutableAsset", "Second instance");
  await rec.allow("F7.mint", () => nmt.mint(...defaultMint));
  const partner = signer("Partner");
  const restrictedId = BigInt(restrictedAddress);
  await rec.deny("F7.denied.transfer", administrator, {
    to: nmtAddress, data: nmt.interface.encodeFunctionData("transferFrom", [administrator.address, signer("Ineligible holder").address, restrictedId])
  });
  await rec.allow("F7.transfer", () => nmt.transferFrom(administrator.address, partner.address, restrictedId));
  const restricted = contract("ChoreographyMutableAsset", restrictedAddress, partner);
  await rec.allow("F7.holder.deny-all", () => restricted.setHolderSmartPolicy(denyAll.target));
  await rec.deny("F7.denied.delta", partner, { to: restrictedAddress, data: restricted.interface.encodeFunctionData("setNodes", toNodeUpdate(delta.nodes)) });
  // F7 reports the restricted instance, not the main one.
  finishPhase("F7", {
    policies: await instrument(async () => [
      await policyEntry("choreography type", "Master", await nmt.masterSmartPolicy()),
      await policyEntry("restricted instance", "Creator", await restricted.creatorSmartPolicy()),
      await policyEntry("restricted instance", "Holder", await restricted.holderSmartPolicy())
    ]),
    restrictedInstance: await instrument(async () => ({ ...await instanceState(restrictedAddress), holder: rec.accountName(await nmt.ownerOf(restrictedId)) }))
  });
  lap("F7");

  // F8: the final render, and the alternative to the delta: a new instance with the same roles.
  await render("F8", path.join(root, INPUTS.delta));
  const fresh = await mintAsset(nmtAddress, paperCreator.target, type.holder.contract.target, roleAccounts, { signer: administrator, roleAccounts: roleAddresses });
  rec.name(fresh.assetAddress, "ChoreographyMutableAsset", "New instance");
  await rec.record("F8.new-instance.mint", fresh.receipts.mint);
  await rec.record("F8.new-instance.roles", fresh.receipts.setRoles);
  const freshAsset = contract("ChoreographyMutableAsset", fresh.assetAddress);
  await rec.allow("F8.new-instance.link", () => freshAsset.setRoles([LICENSED_ROLE], [specialCarrierLicense.target]));
  finishPhase("F8", { newInstance: await instrument(() => instanceState(fresh.assetAddress)) });
  lap("F8");
  rec.done();

  const inputs = {};
  for (const [name, file] of Object.entries(INPUTS)) {
    inputs[name] = { path: file, sha256: sha256(await fs.readFile(path.join(root, file))) };
  }
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const hardhatConfig = (await import(path.join(root, "hardhat.config.js"))).default;
  const evidence = {
    experiment: "ChorNMT paper-example experiment",
    specification: "scripts/experiment/phases.js",
    provenance: {
      solc: hardhatConfig.solidity.version,
      optimizer: hardhatConfig.solidity.settings.optimizer,
      node: process.versions.node.split(".")[0],
      hardhat: packageJson.devDependencies.hardhat,
      network: "hardhat (edr-simulated, ephemeral)",
      ethUsdPrice: ETH_USD_PRICE,
      timings: "timings.json, measured over the repetitions and not compared"
    },
    accounts,
    contracts: [...rec.addressBook.values()],
    inputs,
    phases: PHASES.map((phase) => ({
      id: phase.id,
      title: phase.title,
      inputs: phase.inputs.map((name) => inputs[name]),
      actors: [...new Set(rec.records.filter((record) => record.phase === phase.id).map((record) => record.from.account))],
      transactions: rec.records.filter((record) => record.phase === phase.id).map((record) => record.key),
      ...Object.fromEntries(Object.entries(phases[phase.id] || {}).filter(([name]) => name !== "render"))
    })),
    transactions: rec.records
  };

  await fs.rm(workDirectory, { recursive: true, force: true });
  return { evidence, traces: rec.traces, xml: { baseline: phases.F4.render.xml, final: phases.F8.render.xml }, timings };
}

// Sample statistics of a list of durations in milliseconds, rounded to the microsecond.
function statistics(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.length > 1 ? samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1) : 0;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const round = (value) => Math.round(value * 1000) / 1000;
  return { medianMs: round(median), minMs: round(sorted[0]), maxMs: round(sorted.at(-1)), meanMs: round(mean), stddevMs: round(Math.sqrt(variance)), samplesMs: samples.map(round) };
}

// Runs the experiment once as warm-up and EXPERIMENT_REPETITIONS more times (default 10), each on
// a fresh network. Every run must produce the same evidence; the timings come from the measured runs.
async function main() {
  const repetitions = Number(process.env.EXPERIMENT_REPETITIONS ?? 10);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("EXPERIMENT_REPETITIONS must be a positive integer");
  const runs = [];
  const log = console.log;
  try {
    for (let run = 0; run <= repetitions; run++) {
      if (run > 0) console.log = () => {};
      const result = await runExperiment();
      if (runs.length > 0 && json(result.evidence) + json(result.traces) + json(result.xml) !== json(runs[0].evidence) + json(runs[0].traces) + json(runs[0].xml)) {
        throw new Error(`run ${run} produced different evidence from the first run: the experiment is not deterministic`);
      }
      runs.push(result);
    }
  } finally {
    console.log = log;
  }
  const [{ evidence, traces, xml }] = runs;
  const measured = runs.slice(1).map((run) => run.timings);
  const cpus = os.cpus();
  const timings = {
    repetitions,
    warmUpRuns: 1,
    note: "Wall-clock durations of the measured runs, without the time the run spends tracing, reading the state it reports, and checking; the warm-up run is excluded. Not compared by check:evidence.",
    machine: {
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpu: cpus[0]?.model ?? "unknown",
      cores: cpus.length,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      node: process.versions.node
    },
    phases: Object.fromEntries(Object.keys(measured[0].phases).map((id) => [id, statistics(measured.map((timing) => timing.phases[id]))])),
    steps: Object.fromEntries(Object.keys(measured[0].steps).map((id) => [id, statistics(measured.map((timing) => timing.steps[id]))]))
  };

  await fs.rm(outDirectory, { recursive: true, force: true });
  await fs.mkdir(path.join(outDirectory, "bpmn"), { recursive: true });
  await fs.writeFile(path.join(outDirectory, "experiment.json"), json(evidence));
  await fs.writeFile(path.join(outDirectory, "timings.json"), json(timings));
  const columns = ["key", "phase", "from", "call", "outcome", "reason", "gasUsed", "gasPriceWei", "costWei"];
  await fs.writeFile(path.join(outDirectory, "transactions.csv"), `${columns.join(",")}\n${evidence.transactions.map((record) =>
    [record.key, record.phase, record.from.account, record.call, record.outcome, record.reason ?? "", record.gasUsed, record.gasPriceWei, record.costWei]
      .map((value) => /[,"]/.test(String(value)) ? `"${String(value).replaceAll("\"", "\"\"")}"` : value).join(",")).join("\n")}\n`);
  // Every call trace in one file, by transaction or read key, in the order of the run.
  await fs.writeFile(path.join(outDirectory, "traces.json"), json(traces));
  await fs.writeFile(path.join(outDirectory, "bpmn", "baseline.bpmn.xml"), xml.baseline);
  await fs.writeFile(path.join(outDirectory, "bpmn", "final.bpmn.xml"), xml.final);
  console.log(`Experiment evidence: ${path.relative(root, outDirectory)} (${evidence.transactions.length} transactions in ${PHASES.length} phases, ${repetitions} measured runs after a warm-up, all identical)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
