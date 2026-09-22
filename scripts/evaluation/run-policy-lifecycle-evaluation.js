import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { importBpmnToNmt } from "../../bpmn-builder-js/scripts/import-bpmn.js";
import { resolveEthUsdPrice, scenarioUsd, summarizeNodes, writeMetrics } from "./metrics.js";

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

function toModel(dataset, signers) {
  if (dataset.roles.length > signers.length) {
    throw new Error(`The BPMN model needs ${dataset.roles.length} role addresses, but only ${signers.length} signers are available.`);
  }

  return {
    roleNames: dataset.roles,
    roleAddresses: dataset.roles.map((_, index) => signers[index].address),
    names: dataset.nodes.map((node) => node.name),
    nodeTypes: dataset.nodes.map((node) => node.nodeType),
    incoming: dataset.nodes.map((node) => node.incoming),
    outgoing: dataset.nodes.map((node) => node.outgoing),
    conditions: dataset.nodes.map((node) => node.conditions),
    initiatorRoles: dataset.nodes.map((node) => node.initiatorRole),
    participantRoles: dataset.nodes.map((node) => node.participantRole),
    initiatingMessages: dataset.nodes.map((node) => node.initiatingMessage),
    returnMessages: dataset.nodes.map((node) => node.returnMessage)
  };
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
  const [administrator, eligibleHolder, unauthorizedCreator, ineligibleHolder] = signers;
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
  const nmtFactory = await ethers.getContractFactory("ChoreographyNMT");

  const deployment = [];
  const master = await masterFactory.deploy(administrator.address);
  await master.waitForDeployment();
  deployment.push({ label: "deploy MasterSmartPolicy", outcome: "allowed", ...receiptCost(await master.deploymentTransaction().wait()) });
  const creatorPolicy = await creatorFactory.deploy();
  await creatorPolicy.waitForDeployment();
  deployment.push({ label: "deploy CreatorSmartPolicy", outcome: "allowed", ...receiptCost(await creatorPolicy.deploymentTransaction().wait()) });
  const holderPolicy = await holderFactory.deploy();
  await holderPolicy.waitForDeployment();
  deployment.push({ label: "deploy HolderSmartPolicy", outcome: "allowed", ...receiptCost(await holderPolicy.deploymentTransaction().wait()) });
  const nmt = await nmtFactory.deploy(await master.getAddress());
  await nmt.waitForDeployment();
  deployment.push({ label: "deploy ChoreographyNMT", outcome: "allowed", ...receiptCost(await nmt.deploymentTransaction().wait()) });

  const nmtAddress = await nmt.getAddress();
  const creatorPolicyAddress = await creatorPolicy.getAddress();
  const holderPolicyAddress = await holderPolicy.getAddress();
  const mintArguments = [administrator.address, creatorPolicyAddress, holderPolicyAddress];
  const model = toModel(dataset, signers);
  const deltaUpdate = toNodeUpdate(delta.nodes);
  const evolvedNodes = mergeNodes(dataset.nodes, delta.nodes);
  const initialCounts = countNodes(dataset.nodes);
  const evolvedCounts = countNodes(evolvedNodes);

  const strategy = [];
  const [emptyAssetAddress] = await nmt.mint.staticCall(...mintArguments);
  await allow(strategy, "mint empty asset", () => nmt.mint(...mintArguments));
  const emptyAsset = await ethers.getContractAt("ChoreographyMutableAsset", emptyAssetAddress);
  await allow(strategy, "import roles into empty asset", () => emptyAsset.setRoles(model.roleNames, model.roleAddresses));
  await allow(
    strategy,
    "import nodes into empty asset",
    () => emptyAsset.setNodes(
      model.names,
      model.nodeTypes,
      model.incoming,
      model.outgoing,
      model.conditions,
      model.initiatorRoles,
      model.participantRoles,
      model.initiatingMessages,
      model.returnMessages
    )
  );

  const [populatedAssetAddress] = await nmt.mintWithInitialModel.staticCall(...mintArguments, model);
  await allow(strategy, "mint asset with initial BPMN", () => nmt.mintWithInitialModel(...mintArguments, model));
  const populatedAsset = await ethers.getContractAt("ChoreographyMutableAsset", populatedAssetAddress);
  assert.deepEqual(Array.from(await populatedAsset.getNodeNames()), model.names);

  const policyResults = [];
  await allow(policyResults, "master registers eligible holder", () => master.setEligibleHolder(eligibleHolder.address, true));
  await deny(policyResults, "master denies unauthorized mint", unauthorizedCreator, {
    to: nmtAddress,
    data: nmt.interface.encodeFunctionData("mint", [unauthorizedCreator.address, creatorPolicyAddress, holderPolicyAddress])
  });
  await deny(policyResults, "master denies ineligible initial holder", administrator, {
    to: nmtAddress,
    data: nmt.interface.encodeFunctionData("mint", [ineligibleHolder.address, creatorPolicyAddress, holderPolicyAddress])
  });

  await allow(policyResults, "creator configures BPMN limits", () => creatorPolicy.setBpmnLimits(evolvedCounts.tasks, evolvedCounts.flows));
  await (await creatorPolicy.setTaskNameAllowlistEnabled(true)).wait();
  await (await creatorPolicy.setKnownFlowTargetsEnabled(true)).wait();
  for (const node of evolvedNodes.filter((node) => node.nodeType === 2)) {
    await (await creatorPolicy.setAllowedTaskName(node.name, true)).wait();
  }
  await (await creatorPolicy.setProtectedNode("Order", true)).wait();

  await allow(policyResults, "creator permits paper-example BPMN delta", () => populatedAsset.setNodes(...deltaUpdate));
  const optionalTask = {
    name: "Optional Customs Inspection",
    nodeType: 2,
    incoming: ["Arrival Intermediate"],
    outgoing: ["Delivery of Product"],
    conditions: [""],
    initiatorRole: "Middleman",
    participantRole: "Special Carrier",
    initiatingMessage: "Optional customs inspection",
    returnMessage: ""
  };
  await (await creatorPolicy.setAllowedTaskName(optionalTask.name, true)).wait();
  await deny(policyResults, "creator denies paper-example task limit breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([optionalTask]))
  });

  const waybillWithAdditionalFlow = delta.nodes.find((node) => node.name === "Waybill for Intermediate");
  await deny(policyResults, "creator denies paper-example flow limit breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{
      ...waybillWithAdditionalFlow,
      outgoing: [...waybillWithAdditionalFlow.outgoing, "Delivery of Product"],
      conditions: [...waybillWithAdditionalFlow.conditions, ""]
    }]))
  });

  await (await creatorPolicy.setBpmnLimits(evolvedCounts.tasks + 1, evolvedCounts.flows + 1)).wait();
  await deny(policyResults, "creator denies paper-example task-name policy breach", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...optionalTask, name: "Unapproved Customs Task" }]))
  });
  const unknownFlowUpdate = delta.nodes.find((node) => node.name === "Waybill for Intermediate");
  await deny(policyResults, "creator denies paper-example unknown flow target", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...unknownFlowUpdate, outgoing: ["Unknown BPMN node"] }]))
  });
  const protectedOrder = dataset.nodes.find((node) => node.name === "Order");
  await deny(policyResults, "creator denies paper-example protected node update", administrator, {
    to: populatedAssetAddress,
    data: populatedAsset.interface.encodeFunctionData("setNodes", toNodeUpdate([{ ...protectedOrder, outgoing: ["Order Intermediate"] }]))
  });

  const denyAll = await denyAllFactory.deploy();
  await denyAll.waitForDeployment();
  const denyAllAddress = await denyAll.getAddress();
  await allow(policyResults, "holder installs restrictive policy", () => emptyAsset.setHolderSmartPolicy(denyAllAddress));
  await deny(policyResults, "holder denies model update", administrator, {
    to: emptyAssetAddress,
    data: emptyAsset.interface.encodeFunctionData("setNodes", deltaUpdate)
  });

  const emptyPath = strategy.slice(0, 3);
  const atomicPath = strategy.slice(3);
  const emptyPathGas = totalGas(emptyPath);
  const atomicPathGas = totalGas(atomicPath);
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
    emptyMintAndImportGas: emptyPathGas.toString(),
    populatedMintGas: atomicPathGas.toString(),
    populatedMintSavingGas: (emptyPathGas - atomicPathGas).toString(),
    populatedMintSavingPercent: ((Number(emptyPathGas - atomicPathGas) / Number(emptyPathGas)) * 100).toFixed(2),
    allowedPolicyGas: totalGas(policyResults.filter((result) => result.outcome === "allowed")).toString(),
    deniedPolicyGas: totalGas(policyResults.filter((result) => result.outcome === "denied")).toString()
  };
  const metricsPath = await writeMetrics("policy-lifecycle", { summary: { ...summary, ethUsdPrice }, deployment, strategy, policyResults });
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
    "- **Master policy** authorizes Creators, eligible initial Holders, transfers, and version evolution.",
    "- **Creator policy** defines BPMN update constraints: task and sequence-flow limits, task-name allowlist, known flow targets, and protected nodes.",
    "- **Holder policy** is the second authorization layer and can further restrict an instance by installing a deny-all policy.",
    "",
    "## Model",
    "",
    `- Roles: ${summary.model.roles}`,
    `- Nodes: ${summary.model.nodes}`,
    `- Tasks: ${summary.model.tasks}`,
    `- Sequence flows: ${summary.model.sequenceEdges}`,
    "",
    `The instance is initialized from [\`${path.relative(process.cwd(), paperExamplePath)}\`](../${path.relative(process.cwd(), paperExamplePath)}) and applies the real choreography delta: ${delta.description} The permitted update adds \`Prepare Transport Documentation\` and the split/join gateways; denied updates exceed the evolved task limit, use an unapproved task name, target an unknown BPMN node, or modify protected \`Order\`.`,
    "",
    `- Initial model: ${summary.initialTaskCount} tasks and ${summary.initialFlowCount} sequence flows.`,
    `- Model after the permitted delta: ${summary.evolvedTaskCount} tasks and ${summary.evolvedFlowCount} sequence flows.`,
    "",
    "## Mint strategy comparison",
    "",
    "| Strategy | Gas | USD @10 gwei | USD @30 gwei | USD @100 gwei |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Empty mint + import | ${summary.emptyMintAndImportGas} | ${scenarioUsd(summary.emptyMintAndImportGas, ethUsdPrice).join(" | ")} |`,
    `| Populated mint | ${summary.populatedMintGas} | ${scenarioUsd(summary.populatedMintGas, ethUsdPrice).join(" | ")} |`,
    `| Saving | ${summary.populatedMintSavingGas} (${summary.populatedMintSavingPercent}%) | ${scenarioUsd(summary.populatedMintSavingGas, ethUsdPrice).join(" | ")} |`,
    "",
    "Both strategies write the same roles and nodes to storage. The populated mint avoids the two post-mint transactions, but storage writes remain the dominant cost; therefore the gas saving is expected to be modest while atomic creation is the main operational benefit.",
    "",
    "## Deployment",
    "",
    ...markdownTable(deployment, ethUsdPrice),
    "",
    "## Mint and import operations",
    "",
    ...markdownTable(strategy, ethUsdPrice),
    "",
    "## Policy operations",
    "",
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
    { metric: "empty mint + import gas", value: summary.emptyMintAndImportGas },
    { metric: "populated mint gas", value: summary.populatedMintGas },
    { metric: "populated mint saving gas", value: summary.populatedMintSavingGas },
    { metric: "populated mint saving percent", value: `${summary.populatedMintSavingPercent}%` },
    { metric: "allowed policy gas", value: summary.allowedPolicyGas },
    { metric: "denied policy gas", value: summary.deniedPolicyGas }
  ]);
  console.table(policyResults.map(({ label, outcome, gasUsed, costWei }) => ({ label, outcome, gasUsed, costWei })));
  console.log(`Lifecycle metrics: ${metricsPath}`);
  console.log(`Lifecycle summary: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
