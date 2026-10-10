import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { importBpmnToNmt } from "../../bpmn-builder-js/scripts/import-bpmn.js";
import { resolveEthUsdPrice, scenarioUsd, summarizeNodes, writeMetrics } from "./metrics.js";
import { umlFigure } from "./uml.js";
import { deployChoreographyModel, modelFromDataset } from "../choreography-model.js";

const GAS_LIMIT = 1_500_000n;

function receiptCost(receipt) {
  return {
    gasUsed: receipt.gasUsed.toString(),
    gasPriceWei: receipt.gasPrice.toString(),
    costWei: (receipt.gasUsed * receipt.gasPrice).toString()
  };
}

async function allow(results, label, send) {
  const receipt = await (await send()).wait();
  assert.equal(receipt.status, 1, `${label} should succeed`);
  const result = { label, outcome: "allowed", ...receiptCost(receipt) };
  results.push(result);
  return result;
}

async function deny(results, label, signer, transaction) {
  try {
    const response = await signer.sendTransaction({ ...transaction, gasLimit: GAS_LIMIT });
    const receipt = await response.wait();
    assert.fail(`${label} unexpectedly succeeded with status ${receipt.status}`);
  } catch (error) {
    const receipt = error.receipt || (error.transactionHash && await signer.provider.getTransactionReceipt(error.transactionHash));
    assert.ok(receipt, `${label} did not produce a transaction receipt`);
    assert.equal(receipt.status, 0, `${label} should revert`);
    const result = { label, outcome: "denied", ...receiptCost(receipt) };
    results.push(result);
    return result;
  }
}

function totalGas(results) {
  return results.reduce((total, result) => total + BigInt(result.gasUsed), 0n);
}

function markdownTable(results, ethUsdPrice) {
  return [
    "| Operation | Outcome | Gas | Cost (wei) | USD @10 gwei | USD @30 gwei | USD @100 gwei |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...results.map((result) => `| ${result.label} | ${result.outcome} | ${result.gasUsed} | ${result.costWei} | ${scenarioUsd(result.gasUsed, ethUsdPrice).join(" | ")} |`)
  ];
}

// The paper roles are played by accounts 0-4; the participant policies hardcode accounts 5-9.
function roleAccounts(dataset, signers) {
  if (dataset.roles.length > 5) {
    throw new Error(`The BPMN model needs ${dataset.roles.length} role accounts; accounts 5-9 are license organizations.`);
  }
  return dataset.roles.map((_, index) => signers[index].address);
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

function mergeNodes(initialNodes, updates) {
  const nodes = new Map(initialNodes.map((node) => [node.name, node]));
  updates.forEach((node) => nodes.set(node.name, node));
  return [...nodes.values()];
}

function countNodes(nodes) {
  return {
    tasks: nodes.filter((node) => node.nodeType === 2).length,
    flows: nodes.reduce((total, node) => total + node.outgoing.length, 0)
  };
}

async function main() {
  const ethUsdPrice = await resolveEthUsdPrice();
  const { ethers } = await hre.network.connect("hardhat");
  const signers = await ethers.getSigners();
  const [administrator, , unauthorizedCreator, ineligibleHolder] = signers;
  const paperExamplePath = path.join(process.cwd(), "references", "paper-example.bpmn");
  const importedDatasetPath = path.join("/tmp", "chornmt-paper-example-policy-evaluation.nmt.json");
  const { dataset } = await importBpmnToNmt(paperExamplePath, importedDatasetPath);
  const deltaPath = path.join(process.cwd(), "scripts", "data", "paper-example-parallel-transport-preparation.delta.json");
  const delta = JSON.parse(await fs.readFile(deltaPath, "utf8"));
  const masterFactory = await ethers.getContractFactory("MasterSmartPolicy");
  const creatorFactory = await ethers.getContractFactory(
    "contracts/choreography/CreatorSmartPolicy.sol:CreatorSmartPolicy"
  );
  const holderFactory = await ethers.getContractFactory(
    "contracts/choreography/HolderSmartPolicy.sol:HolderSmartPolicy"
  );
  const denyAllFactory = await ethers.getContractFactory("DenyAllSmartPolicy");
  const rendererFactory = await ethers.getContractFactory("ChoreographyTokenURIRenderer");
  const nmtFactory = await ethers.getContractFactory("ChoreographyNMT");

  const deployment = [];
  const master = await masterFactory.deploy();
  await master.waitForDeployment();
  deployment.push({ label: "deploy MasterSmartPolicy", outcome: "allowed", ...receiptCost(await master.deploymentTransaction().wait()) });
  const creatorPolicy = await creatorFactory.deploy();
  await creatorPolicy.waitForDeployment();
  deployment.push({ label: "deploy CreatorSmartPolicy", outcome: "allowed", ...receiptCost(await creatorPolicy.deploymentTransaction().wait()) });
  const holderPolicy = await holderFactory.deploy();
  await holderPolicy.waitForDeployment();
  deployment.push({ label: "deploy HolderSmartPolicy", outcome: "allowed", ...receiptCost(await holderPolicy.deploymentTransaction().wait()) });
  const renderer = await rendererFactory.deploy();
  await renderer.waitForDeployment();
  deployment.push({ label: "deploy ChoreographyTokenURIRenderer", outcome: "allowed", ...receiptCost(await renderer.deploymentTransaction().wait()) });
  const model = modelFromDataset(dataset);
  const { address: modelAddress, receipt: modelReceipt } = await deployChoreographyModel(administrator, model);
  deployment.push({ label: "deploy paper-example model (SSTORE2)", outcome: "allowed", ...receiptCost(modelReceipt) });
  const nmt = await nmtFactory.deploy(await master.getAddress(), await renderer.getAddress(), modelAddress);
  await nmt.waitForDeployment();
  deployment.push({ label: "deploy ChoreographyNMT", outcome: "allowed", ...receiptCost(await nmt.deploymentTransaction().wait()) });

  const nmtAddress = await nmt.getAddress();
  const creatorPolicyAddress = await creatorPolicy.getAddress();
  const holderPolicyAddress = await holderPolicy.getAddress();
  const mintArguments = [administrator.address, creatorPolicyAddress, holderPolicyAddress];
  const deltaUpdate = toNodeUpdate(delta.nodes);
  const evolvedNodes = mergeNodes(dataset.nodes, delta.nodes);
  const initialCounts = countNodes(dataset.nodes);
  const evolvedCounts = countNodes(evolvedNodes);

  // Every instance of the type is born with the paper model; its roles get accounts afterwards.
  const instance = [];
  const [populatedAssetAddress] = await nmt.mint.staticCall(...mintArguments);
  await allow(instance, "mint paper-example instance", () => nmt.mint(...mintArguments));
  const populatedAsset = await ethers.getContractAt("ChoreographyMutableAsset", populatedAssetAddress);
  assert.deepEqual(Array.from(await populatedAsset.getNodeNames()), model.names);
  await allow(instance, "holder assigns the role accounts", () => populatedAsset.setRoles(model.roleNames, roleAccounts(dataset, signers)));

  const policyResults = [];
  await deny(policyResults, "master denies unauthorized mint", unauthorizedCreator, {
    to: nmtAddress,
    data: nmt.interface.encodeFunctionData("mint", [unauthorizedCreator.address, creatorPolicyAddress, holderPolicyAddress])
  });
  await deny(policyResults, "master denies ineligible initial holder", administrator, {
    to: nmtAddress,
    data: nmt.interface.encodeFunctionData("mint", [ineligibleHolder.address, creatorPolicyAddress, holderPolicyAddress])
  });

  const SPECIAL_CARRIER = ethers.encodeBytes32String("SpecialCarrier");
  const CARRIER = ethers.encodeBytes32String("Carrier");
  const SUPPLIER = ethers.encodeBytes32String("Supplier");
  // The participant policies hardcode these organizations as default Hardhat accounts 5-9.
  assert.ok(model.roleNames.length <= 5, "role accounts would overlap the hardcoded license organizations");
  const [carrierA, carrierB, carrierC, supplierCompany, authority] = signers.slice(5, 10);
  const participantMaster = await (await ethers.getContractFactory("ParticipantMasterSmartPolicy")).deploy();
  const participantRenderer = await (await ethers.getContractFactory("ParticipantTokenURIRenderer")).deploy();
  await Promise.all([participantMaster.waitForDeployment(), participantRenderer.waitForDeployment()]);
  const participantNmt = await (await ethers.getContractFactory("ParticipantNMT"))
    .deploy(participantMaster.target, participantRenderer.target);
  const participantCertifier = await (await ethers.getContractFactory(
    "contracts/participant/CreatorSmartPolicy.sol:CreatorSmartPolicy"
  )).connect(authority).deploy();
  const participantHolderPolicy = await (await ethers.getContractFactory(
    "contracts/participant/HolderSmartPolicy.sol:HolderSmartPolicy"
  )).deploy();
  await Promise.all([
    participantNmt.waitForDeployment(),
    participantCertifier.waitForDeployment(),
    participantHolderPolicy.waitForDeployment()
  ]);

  // Creator constraints are hardcoded in the paper-scenario policy: changing the rules of an
  // instance costs a deploy and an install instead of runtime configuration.
  const participantAM = await (await ethers.getContractFactory("ChoreographyParticipantAM"))
    .deploy(participantNmt.target, participantCertifier.target);
  await allow(policyResults, "deploy participant attribute manager", () => participantAM.deploymentTransaction());
  const paperCreatorPolicy = await (await ethers.getContractFactory("CreatorSmartPolicyPaperScenario"))
    .deploy(participantAM.target);
  await allow(policyResults, "deploy paper-scenario creator policy", () => paperCreatorPolicy.deploymentTransaction());
  await allow(policyResults, "creator administrator installs paper-scenario creator policy", () => populatedAsset.setCreatorSmartPolicy(paperCreatorPolicy.target));
  assert.equal(evolvedCounts.tasks + 1, 11, "CreatorSmartPolicyPaperScenario hardcodes 11 tasks");
  assert.equal(evolvedCounts.flows + 1, 15, "CreatorSmartPolicyPaperScenario hardcodes 15 sequence flows");

  await allow(policyResults, "creator permits paper-example BPMN delta", () => populatedAsset.setNodes(...deltaUpdate));
  // Denied updates are well formed (flows declared on both endpoints, as the default Creator policy
  // requires), so each one is denied by the paper-scenario constraint it names.
  const assertWellFormed = async (nodes) => assert.equal(
    await creatorPolicy.evaluateNodeUpdate(populatedAssetAddress, ...toNodeUpdate(nodes).slice(0, 4)),
    true,
    "the denied update must be well formed"
  );
  const evolvedNode = (name) => evolvedNodes.find((node) => node.name === name);
  const optionalTask = {
    name: "Optional Customs Inspection",
    nodeType: 2,
    incoming: [],
    outgoing: [],
    conditions: [],
    initiatorRole: "Middleman",
    participantRole: "Special Carrier",
    initiatingMessage: "Optional customs inspection",
    returnMessage: ""
  };
  // Two approved optional tasks, not yet linked: 12 tasks, 14 flows.
  const twoOptionalTasks = [optionalTask, { ...optionalTask, name: "Optional Quality Inspection" }];
  await assertWellFormed(twoOptionalTasks);
  await deny(policyResults, "creator denies paper-example task limit breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate(twoOptionalTasks))
  });

  // The waybill gains flows to two existing nodes, declared on both endpoints: 10 tasks, 16 flows.
  const waybill = evolvedNode("Waybill for Intermediate");
  const extraTargets = ["Delivery of Product", "Order Intermediate"];
  const extraFlows = [
    { ...waybill, outgoing: [...waybill.outgoing, ...extraTargets], conditions: [...waybill.conditions, "", ""] },
    ...extraTargets.map((name) => ({ ...evolvedNode(name), incoming: [...evolvedNode(name).incoming, waybill.name] }))
  ];
  await assertWellFormed(extraFlows);
  await deny(policyResults, "creator denies paper-example flow limit breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate(extraFlows))
  });

  const unapprovedTask = [{ ...optionalTask, name: "Unapproved Customs Task" }];
  await assertWellFormed(unapprovedTask);
  await deny(policyResults, "creator denies paper-example task-name policy breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate(unapprovedTask))
  });
  const unknownFlowUpdate = delta.nodes.find((node) => node.name === "Waybill for Intermediate");
  await deny(policyResults, "creator denies paper-example unknown flow target", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...unknownFlowUpdate, outgoing: ["Unknown BPMN node"] }]))
  });
  const protectedOrder = dataset.nodes.find((node) => node.name === "Order");
  await assertWellFormed([{ ...protectedOrder, initiatingMessage: "Modified order request" }]);
  await deny(policyResults, "creator denies paper-example protected node update", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...protectedOrder, initiatingMessage: "Modified order request" }]))
  });

  const carrierRole = "Special Carrier";
  const mintLicense = async (holder, participantType) => {
    const licenseArguments = [holder.address, participantCertifier.target, participantHolderPolicy.target, participantType];
    const [licenseAddress] = await participantNmt.connect(authority).mintWithParticipantType.staticCall(...licenseArguments);
    await (await participantNmt.connect(authority).mintWithParticipantType(...licenseArguments)).wait();
    return ethers.getContractAt("ParticipantMutableAsset", licenseAddress, holder);
  };
  const specialCarrierLicense = await mintLicense(carrierA, SPECIAL_CARRIER);
  const plainCarrierLicense = await mintLicense(carrierC, CARRIER);
  const supplierLicense = await mintLicense(supplierCompany, SUPPLIER);
  const linkCarrier = (account) => ({
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setRoles", [[carrierRole], [account]])
  });
  const sellLicense = (from, to) => ({
    to: participantNmt.target,
    data: participantNmt.interface.encodeFunctionData("transferFrom", [from.address, to.address, BigInt(specialCarrierLicense.target)])
  });
  const licenseAs = (signer) => specialCarrierLicense.connect(signer);
  const updateLicenseName = (name) => ({
    to: specialCarrierLicense.target,
    data: specialCarrierLicense.interface.encodeFunctionData("setName", [ethers.encodeBytes32String(name)])
  });
  const carrierTaskNodes = evolvedNodes
    .filter((node) => node.initiatorRole === carrierRole || node.participantRole === carrierRole);
  const carrierMessages = [...new Set(carrierTaskNodes.flatMap((node) => [node.initiatingMessage, node.returnMessage]))]
    .filter(Boolean)
    .map(ethers.encodeBytes32String);
  const otherRoleMessage = evolvedNodes
    .flatMap((node) => [node.initiatingMessage, node.returnMessage])
    .find((message) => message && !carrierMessages.includes(ethers.encodeBytes32String(message)));

  await deny(policyResults, "creator denies linking Special Carrier to a plain account", administrator, linkCarrier(carrierA.address));
  await deny(policyResults, "creator denies linking a Carrier license", administrator, linkCarrier(plainCarrierLicense.target));
  await deny(policyResults, "creator denies linking a Supplier license", administrator, linkCarrier(supplierLicense.target));
  await allow(policyResults, "holder links Special Carrier to the license held by Carrier A", () => populatedAsset.setRoles([carrierRole], [specialCarrierLicense.target]));
  await deny(policyResults, "creator denies a new Backup Carrier role", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setRoles", [["Backup Carrier"], [specialCarrierLicense.target]])
  });
  await allow(policyResults, "Carrier A updates its license data", () => licenseAs(carrierA).setName(ethers.encodeBytes32String("Carrier A")));
  await allow(policyResults, "Carrier A declares the Special Carrier messages on its license", () => licenseAs(carrierA).setMessages(carrierMessages));
  await deny(policyResults, "certifier denies a license message of another role", carrierA, {
    to: specialCarrierLicense.target,
    data: specialCarrierLicense.interface.encodeFunctionData("setMessages", [[ethers.encodeBytes32String(otherRoleMessage)]])
  });
  await deny(policyResults, "participant master denies selling the license to Carrier C, not qualified for SpecialCarrier", carrierA, sellLicense(carrierA, carrierC));
  await deny(policyResults, "participant master denies selling the license to the Supplier company", carrierA, sellLicense(carrierA, supplierCompany));
  await deny(policyResults, "Carrier B cannot take the license without the seller", carrierB, sellLicense(carrierA, carrierB));
  const carrierTasks = carrierTaskNodes.map((node) => node.name);
  await allow(policyResults, "Carrier A sells the Special Carrier license to Carrier B", () => participantNmt.connect(carrierA).transferFrom(carrierA.address, carrierB.address, BigInt(specialCarrierLicense.target)));
  assert.equal(await participantNmt.ownerOf(BigInt(specialCarrierLicense.target)), carrierB.address);
  assert.equal(await populatedAsset.getRole(carrierRole), specialCarrierLicense.target);
  for (const name of carrierTasks) {
    const [, , , , , initiatorRole, participantRole] = await populatedAsset.getNode(name);
    assert.ok(initiatorRole === carrierRole || participantRole === carrierRole, `${name} lost the ${carrierRole} role`);
  }
  // The sold license still meets the role requirement: relinking it is allowed.
  await populatedAsset.setRoles.staticCall([carrierRole], [specialCarrierLicense.target]);
  assert.equal(await specialCarrierLicense.getName(), ethers.ZeroHash);
  assert.deepEqual([...await specialCarrierLicense.getMessages()], carrierMessages);
  assert.equal(await specialCarrierLicense.getMessagesWriter(), carrierA.address);

  await deny(policyResults, "Carrier B cannot update the license before installing a Holder policy", carrierB, updateLicenseName("Carrier B"));
  await allow(policyResults, "Carrier B installs its Holder policy on the license", () => licenseAs(carrierB).setHolderSmartPolicy(participantHolderPolicy.target));
  await deny(policyResults, "Carrier A can no longer update the license", carrierA, updateLicenseName("Carrier A"));
  await allow(policyResults, "Carrier B updates the license name", () => licenseAs(carrierB).setName(ethers.encodeBytes32String("Carrier B")));
  const carrierBProfile = ethers.id("Carrier B organization profile");
  await allow(policyResults, "Carrier B links its organization profile", () => licenseAs(carrierB).setProfile(carrierBProfile));
  assert.equal(await specialCarrierLicense.getProfile(), carrierBProfile);
  await allow(policyResults, "Carrier B confirms the Special Carrier messages", () => licenseAs(carrierB).setMessages(carrierMessages));
  assert.equal(await specialCarrierLicense.getMessagesWriter(), carrierB.address);
  const roleHandover = {
    role: carrierRole,
    license: specialCarrierLicense.target,
    seller: carrierA.address,
    buyer: carrierB.address,
    rejectedBuyers: [carrierC.address, supplierCompany.address],
    messages: carrierMessages.map((message) => ethers.decodeBytes32String(message)),
    tasks: carrierTasks
  };

  const denyAll = await denyAllFactory.deploy();
  await denyAll.waitForDeployment();
  const denyAllAddress = await denyAll.getAddress();
  const [restrictedAssetAddress] = await nmt.mint.staticCall(...mintArguments);
  await (await nmt.mint(...mintArguments)).wait();
  const restrictedAsset = await ethers.getContractAt("ChoreographyMutableAsset", restrictedAssetAddress);
  await allow(policyResults, "holder installs restrictive policy", () => restrictedAsset.setHolderSmartPolicy(denyAllAddress));
  await deny(policyResults, "holder denies model update", administrator, {
    to: restrictedAssetAddress,
    data: restrictedAsset.interface.encodeFunctionData("setNodes", deltaUpdate)
  });

  const modelDeployment = deployment.find((result) => result.label.startsWith("deploy paper-example model"));
  const summary = {
    model: summarizeNodes(model.names.map((name, index) => ({
      name,
      nodeType: model.nodeTypes[index],
      outgoing: model.outgoing[index],
      initiatingMessage: model.initiatingMessages[index],
      returnMessage: model.returnMessages[index]
    })), model.roleNames),
    sourceBpmn: dataset.sourceBpmn,
    deltaDescription: delta.description,
    initialTaskCount: initialCounts.tasks,
    evolvedTaskCount: evolvedCounts.tasks,
    initialFlowCount: initialCounts.flows,
    evolvedFlowCount: evolvedCounts.flows,
    deploymentGas: totalGas(deployment).toString(),
    modelBytes: ((await ethers.provider.getCode(modelAddress)).length - 2) / 2,
    modelDeploymentGas: modelDeployment.gasUsed,
    instanceMintGas: instance[0].gasUsed,
    roleAssignmentGas: instance[1].gasUsed,
    allowedPolicyGas: totalGas(policyResults.filter((result) => result.outcome === "allowed")).toString(),
    deniedPolicyGas: totalGas(policyResults.filter((result) => result.outcome === "denied")).toString(),
    roleHandover
  };
  const metricsPath = await writeMetrics("policy-lifecycle", { summary: { ...summary, ethUsdPrice }, deployment, instance, policyResults });
  const markdownPath = path.join(process.cwd(), "evaluation", "policy-lifecycle.generated.md");
  await fs.writeFile(markdownPath, [
    "# Policy lifecycle evaluation",
    "",
    "## Purpose",
    "",
    "This evaluation measures the cost of creating a choreography instance and demonstrates that Master, Creator, and Holder policies govern the lifecycle and BPMN updates. It runs on an ephemeral Hardhat network, so it does not require or alter the persistent local operations node.",
    `USD estimates use ETH/USD ${ethUsdPrice ? `$${ethUsdPrice.toFixed(2)}` : "not available"}; set \`ETH_USD_PRICE\` for a fixed reproducible value.`,
    "",
    "## Policy model",
    "",
    "- **Master policy** authorizes Creators, eligible initial Holders, and transfers.",
    "- **Creator policy** is hardcoded, as a policy translated from XACML: changing its rules means deploying another policy and installing it. The constrained policy defines BPMN update constraints: task and sequence-flow limits, task-name allowlist, known flow targets, and protected nodes. It also decides which license can play a role: a role can require a participant license of a given type.",
    "- **Participant Master policy** governs role licenses: only the issuer of a type mints it, and only organizations qualified for the type can buy it.",
    "- **Holder policy** is the second authorization layer and can further restrict an instance by installing a deny-all policy.",
    "",
    ...umlFigure("use-case-choreography", markdownPath),
    "## Model",
    "",
    `- Roles: ${summary.model.roles}`,
    `- Nodes: ${summary.model.nodes}`,
    `- Tasks: ${summary.model.tasks}`,
    `- Sequence flows: ${summary.model.sequenceEdges}`,
    "",
    `The instance is initialized from [\`${path.relative(process.cwd(), paperExamplePath)}\`](../${path.relative(process.cwd(), paperExamplePath)}) and applies the real choreography delta: ${delta.description} The permitted update adds \`Prepare Transport Documentation\` and the split/join gateways; its rules are those of the hardcoded \`CreatorSmartPolicyPaperScenario\`, installed with \`setCreatorSmartPolicy\`; denied updates exceed the task or the sequence-flow limit, use an unapproved task name, target an unknown BPMN node, or modify protected \`Order\`.`,
    "",
    `- Initial model: ${summary.initialTaskCount} tasks and ${summary.initialFlowCount} sequence flows.`,
    `- Model after the permitted delta: ${summary.evolvedTaskCount} tasks and ${summary.evolvedFlowCount} sequence flows.`,
    "",
    "## Role handover: Special Carrier",
    "",
    `The role \`${roleHandover.role}\` is played by a license, a \`ParticipantMutableAsset\` minted by \`ParticipantNMT\`. The choreography links the role to the license once; the organization behind the role changes when the license is sold. The license type (\`SpecialCarrier\`) is fixed when the authority mints it; the choreography Creator policy accepts only a license of that type for the role; the participant Master policy lets the holder sell the license only to an organization qualified for its type; the certifier's policy lets the holder declare only messages allowed for the type. The participant policies are hardcoded, as policies translated from XACML would be.`,
    "",
    `- License: \`${roleHandover.license}\``,
    `- Seller, Carrier A: \`${roleHandover.seller}\``,
    `- Buyer, Carrier B: \`${roleHandover.buyer}\``,
    `- Rejected buyers, Carrier C and the Supplier company: ${roleHandover.rejectedBuyers.map((address) => `\`${address}\``).join(", ")}`,
    `- Tasks played by the role, unchanged by the sale: ${roleHandover.tasks.map((name) => `\`${name}\``).join(", ")}`,
    `- Messages declared on the license: ${roleHandover.messages.map((message) => `\`${message}\``).join(", ")}`,
    "",
    ...umlFigure("use-case-participant-license", markdownPath),
    ...umlFigure("F3", markdownPath),
    ...umlFigure("F6", markdownPath),
    "| Case | Outcome | Gas |",
    "| --- | --- | ---: |",
    ...policyResults
      .filter((result) => /Carrier|license|authority/i.test(result.label))
      .map((result) => `| ${result.label} | ${result.outcome} | ${result.gasUsed} |`),
    "",
    `The sale resets the license Holder policy and clears the seller's name and profile, so Carrier B installs its own policy before updating the license data, and Carrier A loses every right on it. The messages stay on the license, marked as written by Carrier A, until Carrier B confirms them.`,
    "",
    "## Choreography type and instances",
    "",
    ...umlFigure("F1", markdownPath),
    ...umlFigure("F2", markdownPath),
    `A \`ChoreographyNMT\` is one choreography type. The paper model is deployed once as the code of a data-only contract (SSTORE2, ${summary.modelBytes} bytes, ${summary.modelDeploymentGas} gas), whose address the NMT fixes at deploy; every mint then creates an asset that decodes the model in its constructor and is born populated (${summary.instanceMintGas} gas). Roles keep only their names in the model, so each instance links its accounts or licenses with \`setRoles\` (${summary.roleAssignmentGas} gas), under the Creator AND Holder checks.`,
    "",
    "## Deployment",
    "",
    ...markdownTable(deployment, ethUsdPrice),
    "",
    "## Instance operations",
    "",
    ...markdownTable(instance, ethUsdPrice),
    "",
    "## Policy operations",
    "",
    "Every BPMN update row goes through the action check and the domain check of the Creator AND the Holder policy, and a denied row is the revert of one of those checks (first diagram, from the experiment traces); a Holder policy can deny every later update (second diagram). This evaluation still installs the paper-scenario Creator policy with `setCreatorSmartPolicy`, which the experiment no longer does: the Creator policy is never replaced (open question in docs/decisions.md).",
    "",
    ...umlFigure("F5", markdownPath),
    ...umlFigure("F7", markdownPath),
    ...markdownTable(policyResults, ethUsdPrice),
    "",
    `- Allowed policy-operation gas total: ${summary.allowedPolicyGas}`,
    `- Denied policy-operation gas total: ${summary.deniedPolicyGas}`,
    "",
    "A denied operation still consumes gas because the transaction executes policy checks and then reverts. The receipt status and cost are recorded to distinguish a real on-chain denial from a client-side simulation failure.",
    "",
    "## Reproduction",
    "",
    "```bash",
    "npx hardhat compile",
    "npm run evaluate:policies",
    "npm run evaluate:summary",
    "```",
    "",
    "Gas values are local Hardhat measurements. Repeat the evaluation and report the compiler, optimizer, gas price, and network when comparing public-network costs.",
    ""
  ].join("\n"));

  console.table([
    { metric: "deployment gas", value: summary.deploymentGas },
    { metric: "model deployment gas", value: summary.modelDeploymentGas },
    { metric: "instance mint gas", value: summary.instanceMintGas },
    { metric: "role assignment gas", value: summary.roleAssignmentGas },
    { metric: "allowed policy gas", value: summary.allowedPolicyGas },
    { metric: "denied policy gas", value: summary.deniedPolicyGas }
  ]);
  console.table(policyResults.map(({ label, outcome, gasUsed, costWei }) => ({ label, outcome, gasUsed, costWei })));
  console.log(`Role handover: ${roleHandover.role} license ${roleHandover.license} sold ${roleHandover.seller} -> ${roleHandover.buyer}`);
  console.log(`Lifecycle metrics: ${metricsPath}`);
  console.log(`Lifecycle summary: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
