import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { resolveEthUsdPrice, scenarioUsd, writeMetrics } from "./evaluation/metrics.js";
import { decodeTokenURI } from "../bpmn-builder-js/scripts/web3.js";

const GAS_LIMIT = 10_000_000n;

function formatCost(receipt) {
  return {
    gasUsed: receipt.gasUsed.toString(),
    costWei: (receipt.gasUsed * receipt.gasPrice).toString()
  };
}

async function expectAllowed(label, send) {
  const transaction = await send();
  const receipt = await transaction.wait();
  assert.equal(receipt.status, 1, `${label} should succeed`);
  return { label, outcome: "allowed", ...formatCost(receipt) };
}

async function expectDenied(label, signer, transaction) {
  let receipt;
  try {
    const response = await signer.sendTransaction({ ...transaction, gasLimit: GAS_LIMIT });
    receipt = await response.wait();
  } catch (error) {
    receipt = error.receipt || (error.transactionHash && await signer.provider.getTransactionReceipt(error.transactionHash));
    assert.ok(receipt, `${label} did not produce a transaction receipt`);
  }
  assert.equal(receipt.status, 0, `${label} should revert`);
  assert.ok(receipt.gasUsed < GAS_LIMIT, `${label} ran out of gas instead of being denied`);
  return { label, outcome: "denied", ...formatCost(receipt) };
}

function modelFromTokenURI(tokenURI) {
  const { choreography } = decodeTokenURI(tokenURI);
  return {
    roleNames: choreography.roles.map((role) => role.name),
    roleAddresses: choreography.roles.map((role) => role.address),
    names: choreography.nodes.map((node) => node.name),
    nodeTypes: choreography.nodes.map((node) => node.nodeType),
    incoming: choreography.nodes.map((node) => node.incoming),
    outgoing: choreography.nodes.map((node) => node.outgoing),
    conditions: choreography.nodes.map((node) => node.conditions),
    initiatorRoles: choreography.nodes.map((node) => node.initiatorRole),
    participantRoles: choreography.nodes.map((node) => node.participantRole),
    initiatingMessages: choreography.nodes.map((node) => node.initiatingMessage),
    returnMessages: choreography.nodes.map((node) => node.returnMessage)
  };
}

function printReport(report) {
  console.table(report.map(({ label, outcome, gasUsed, costWei }) => ({
    policyCase: label,
    outcome,
    gasUsed,
    costWei
  })));
}

function gasFor(report, label) {
  return BigInt(report.find((entry) => entry.label === label).gasUsed);
}

function totalGas(report, outcome) {
  return report
    .filter((entry) => entry.outcome === outcome)
    .reduce((total, entry) => total + BigInt(entry.gasUsed), 0n);
}

async function main() {
  const ethUsdPrice = await resolveEthUsdPrice();
  const { ethers } = await hre.network.connect();
  const [administrator, eligibleHolder, unauthorizedCreator, ineligibleHolder] = await ethers.getSigners();

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

  const master = await masterFactory.deploy(administrator.address);
  const creatorPolicy = await creatorFactory.deploy();
  const holderPolicy = await holderFactory.deploy();
  const renderer = await rendererFactory.deploy();
  await renderer.waitForDeployment();
  const nmt = await nmtFactory.deploy(await master.getAddress(), await renderer.getAddress());
  await Promise.all([
    master.waitForDeployment(),
    creatorPolicy.waitForDeployment(),
    holderPolicy.waitForDeployment(),
    nmt.waitForDeployment()
  ]);

  const nmtAddress = await nmt.getAddress();
  const creatorPolicyAddress = await creatorPolicy.getAddress();
  const holderPolicyAddress = await holderPolicy.getAddress();

  const report = [];
  report.push(await expectAllowed(
    "master registers eligible holder",
    () => master.setEligibleHolder(eligibleHolder.address, true)
  ));

  const mintArguments = [
    administrator.address,
    creatorPolicyAddress,
    holderPolicyAddress
  ];
  const [assetAddress] = await nmt.mint.staticCall(...mintArguments);
  report.push(await expectAllowed("authorized creator mints eligible holder", () => nmt.mint(...mintArguments)));

  const asset = await ethers.getContractAt("ChoreographyMutableAsset", assetAddress);
  const roles = ["Buyer", "Supplier"];
  const roleAddresses = [administrator.address, eligibleHolder.address];
  const initialModel = {
    roleNames: roles,
    roleAddresses,
    names: ["Start", "Delivery", "End"],
    nodeTypes: [0, 2, 1],
    incoming: [[], ["Start"], ["Delivery"]],
    outgoing: [["Delivery"], ["End"], []],
    conditions: [[], [], []],
    initiatorRoles: ["", "Buyer", ""],
    participantRoles: ["", "Supplier", ""],
    initiatingMessages: ["", "requestDelivery", ""],
    returnMessages: ["", "deliveryConfirmed", ""]
  };
  report.push(await expectAllowed("creator and holder update roles", () => asset.setRoles(roles, roleAddresses)));
  report.push(await expectAllowed(
    "creator and holder update nodes",
    () => asset.setNodes(
      initialModel.names,
      initialModel.nodeTypes,
      initialModel.incoming,
      initialModel.outgoing,
      initialModel.conditions,
      initialModel.initiatorRoles,
      initialModel.participantRoles,
      initialModel.initiatingMessages,
      initialModel.returnMessages
    )
  ));

  const [initializedAssetAddress] = await nmt.mintWithInitialModel.staticCall(
    ...mintArguments,
    initialModel
  );
  report.push(await expectAllowed(
    "authorized creator mints initialized model",
    () => nmt.mintWithInitialModel(...mintArguments, initialModel)
  ));
  const initializedAsset = await ethers.getContractAt("ChoreographyMutableAsset", initializedAssetAddress);
  assert.deepEqual(Array.from(await initializedAsset.getNodeNames()), initialModel.names);
  const initializedTokenURI = await nmt.tokenURI(BigInt(initializedAssetAddress));
  assert.equal(await initializedAsset.tokenURI(), initializedTokenURI);
  assert.deepEqual(modelFromTokenURI(initializedTokenURI), initialModel);

  const escapedModel = {
    ...initialModel,
    roleNames: ['Buyer "B"', "Supplier\\S"],
    names: ["Start", 'Say "hi"\nnow', "Città ✓"],
    incoming: [[], ["Start"], ['Say "hi"\nnow']],
    outgoing: [['Say "hi"\nnow'], ["Città ✓"], []],
    conditions: [[], ["tab\there"], []],
    initiatorRoles: ["", 'Buyer "B"', ""],
    participantRoles: ["", "Supplier\\S", ""]
  };
  const [escapedAssetAddress] = await nmt.mintWithInitialModel.staticCall(...mintArguments, escapedModel);
  await (await nmt.mintWithInitialModel(...mintArguments, escapedModel)).wait();
  assert.deepEqual(modelFromTokenURI(await nmt.tokenURI(BigInt(escapedAssetAddress))), escapedModel);

  const emptyThenImportGas =
    gasFor(report, "authorized creator mints eligible holder") +
    gasFor(report, "creator and holder update roles") +
    gasFor(report, "creator and holder update nodes");
  const initializedMintGas = gasFor(report, "authorized creator mints initialized model");
  console.log(
    `Initial model gas: mint then import=${emptyThenImportGas}, mintWithInitialModel=${initializedMintGas}, saving=${emptyThenImportGas - initializedMintGas}`
  );

  report.push(await expectAllowed(
    "creator configures BPMN structural limits",
    () => creatorPolicy.setBpmnLimits(2, 3)
  ));
  await (await creatorPolicy.setTaskNameAllowlistEnabled(true)).wait();
  await (await creatorPolicy.setKnownFlowTargetsEnabled(true)).wait();
  await (await creatorPolicy.setAllowedTaskName("Inspection", true)).wait();
  await (await creatorPolicy.setAllowedTaskName("Packing", true)).wait();
  await (await creatorPolicy.setProtectedNode("Start", true)).wait();

  const [constrainedAssetAddress] = await nmt.mintWithInitialModel.staticCall(
    ...mintArguments,
    initialModel
  );
  await (await nmt.mintWithInitialModel(...mintArguments, initialModel)).wait();
  const constrainedAsset = await ethers.getContractAt(
    "ChoreographyMutableAsset",
    constrainedAssetAddress
  );
  const nodeUpdate = (name, nodeType, incoming, outgoing) => [
    [name],
    [nodeType],
    [incoming],
    [outgoing],
    [[]],
    [nodeType === 2 ? "Buyer" : ""],
    [nodeType === 2 ? "Supplier" : ""],
    [nodeType === 2 ? `${name}Request` : ""],
    [nodeType === 2 ? `${name}Response` : ""]
  ];
  const inspectionUpdate = nodeUpdate("Inspection", 2, ["Delivery"], ["End"]);
  report.push(await expectAllowed(
    "creator policy allows approved task within limits",
    () => constrainedAsset.setNodes(...inspectionUpdate)
  ));

  const packingUpdate = nodeUpdate("Packing", 2, ["Inspection"], ["End"]);
  report.push(await expectDenied(
    "creator policy denies task count above limit",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", packingUpdate)
    }
  ));

  await (await creatorPolicy.setBpmnLimits(3, 3)).wait();
  report.push(await expectDenied(
    "creator policy denies sequence flow count above limit",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", packingUpdate)
    }
  ));

  await (await creatorPolicy.setBpmnLimits(3, 4)).wait();
  report.push(await expectAllowed(
    "creator policy allows whitelisted task after limit increase",
    () => constrainedAsset.setNodes(...packingUpdate)
  ));

  await (await creatorPolicy.setBpmnLimits(4, 5)).wait();
  const unapprovedUpdate = nodeUpdate("Unapproved", 2, ["Packing"], ["End"]);
  report.push(await expectDenied(
    "creator policy denies task outside name allowlist",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", unapprovedUpdate)
    }
  ));

  const unknownTargetUpdate = nodeUpdate("Inspection", 2, ["Delivery"], ["Unknown"]);
  report.push(await expectDenied(
    "creator policy denies flow to unknown node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", unknownTargetUpdate)
    }
  ));

  const protectedStartUpdate = nodeUpdate("Start", 0, [], ["Delivery"]);
  report.push(await expectDenied(
    "creator policy denies protected node update",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", protectedStartUpdate)
    }
  ));

  const unknownSourceUpdate = nodeUpdate("Inspection", 2, ["Unknown"], ["End"]);
  report.push(await expectDenied(
    "creator policy denies flow from unknown node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", unknownSourceUpdate)
    }
  ));

  await (await creatorPolicy.setAllowedTaskName("Delivery", true)).wait();
  report.push(await expectAllowed(
    "creator policy allows update keeping protected node links",
    () => constrainedAsset.setNodes(...nodeUpdate("Delivery", 2, ["Start"], ["End"]))
  ));
  report.push(await expectDenied(
    "creator policy denies unlinking protected node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", nodeUpdate("Delivery", 2, [], ["End"]))
    }
  ));
  report.push(await expectDenied(
    "creator policy denies new link to protected node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData(
        "setNodes",
        nodeUpdate("Inspection", 2, ["Delivery", "Start"], ["End"])
      )
    }
  ));

  await (await creatorPolicy.setProtectedRole("Buyer", true)).wait();
  report.push(await expectAllowed(
    "creator policy allows unprotected role update",
    () => constrainedAsset.setRoles(["Supplier"], [ineligibleHolder.address])
  ));
  report.push(await expectDenied(
    "creator policy denies protected role update",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setRoles", [["Buyer"], [ineligibleHolder.address]])
    }
  ));
  assert.equal(await constrainedAsset.getRole("Buyer"), administrator.address);
  await (await creatorPolicy.setProtectedRole("Buyer", false)).wait();

  report.push(await expectDenied(
    "unauthorized creator cannot mint",
    unauthorizedCreator,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("mint", [
        unauthorizedCreator.address,
        creatorPolicyAddress,
        holderPolicyAddress
      ])
    }
  ));

  report.push(await expectDenied(
    "authorized creator cannot assign an ineligible holder",
    administrator,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("mint", [
        ineligibleHolder.address,
        creatorPolicyAddress,
        holderPolicyAddress
      ])
    }
  ));

  report.push(await expectDenied(
    "non-holder cannot update choreography",
    eligibleHolder,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [roles, roleAddresses])
    }
  ));

  const [versionAddress, versionTokenId] = await nmt.mintVersion.staticCall(
    administrator.address,
    creatorPolicyAddress,
    holderPolicyAddress,
    BigInt(assetAddress)
  );
  report.push(await expectAllowed(
    "authorized version evolution",
    () => nmt.mintVersion(
      administrator.address,
      creatorPolicyAddress,
      holderPolicyAddress,
      BigInt(assetAddress)
    )
  ));
  assert.equal(await nmt.predecessorOf(versionTokenId), BigInt(assetAddress));
  assert.equal(await nmt.versionOf(versionTokenId), 1n);
  assert.notEqual(versionAddress, ethers.ZeroAddress);

  report.push(await expectAllowed("master disables versioning", () => master.setVersioningEnabled(false)));
  report.push(await expectDenied(
    "disabled versioning rejects new versions",
    administrator,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("mintVersion", [
        administrator.address,
        creatorPolicyAddress,
        holderPolicyAddress,
        BigInt(assetAddress)
      ])
    }
  ));

  report.push(await expectAllowed("master enables transfer to eligible holder", () => master.setTransfersEnabled(true)));
  report.push(await expectAllowed(
    "holder transfers to eligible holder",
    () => nmt.transferFrom(administrator.address, eligibleHolder.address, BigInt(assetAddress))
  ));
  assert.equal(await nmt.ownerOf(BigInt(assetAddress)), eligibleHolder.address);

  report.push(await expectAllowed("master disables transfers", () => master.setTransfersEnabled(false)));
  report.push(await expectDenied(
    "disabled transfer policy rejects ownership transfer",
    eligibleHolder,
    {
      to: await nmt.getAddress(),
      data: nmt.interface.encodeFunctionData("transferFrom", [
        eligibleHolder.address,
        administrator.address,
        BigInt(assetAddress)
      ])
    }
  ));

  const denyAllPolicy = await denyAllFactory.deploy();
  await denyAllPolicy.waitForDeployment();

  const holderMintArguments = [eligibleHolder.address, creatorPolicyAddress, holderPolicyAddress];
  const [holderAssetAddress] = await nmt.mint.staticCall(...holderMintArguments);
  await (await nmt.mint(...holderMintArguments)).wait();
  const holderAsset = await ethers.getContractAt("ChoreographyMutableAsset", holderAssetAddress);
  report.push(await expectDenied(
    "holder cannot replace creator policy",
    eligibleHolder,
    {
      to: holderAssetAddress,
      data: holderAsset.interface.encodeFunctionData("setCreatorSmartPolicy", [holderPolicyAddress])
    }
  ));
  assert.equal(await holderAsset.creatorSmartPolicy(), creatorPolicyAddress);
  report.push(await expectAllowed(
    "creator policy administrator replaces creator policy",
    () => holderAsset.setCreatorSmartPolicy(creatorPolicyAddress)
  ));

  await (await master.setVersioningEnabled(true)).wait();
  report.push(await expectDenied(
    "holder cannot mint version with another creator policy",
    eligibleHolder,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("mintVersion", [
        eligibleHolder.address,
        holderPolicyAddress,
        holderPolicyAddress,
        BigInt(holderAssetAddress)
      ])
    }
  ));
  report.push(await expectAllowed(
    "holder mints version keeping creator policy",
    () => nmt.connect(eligibleHolder).mintVersion(
      eligibleHolder.address,
      creatorPolicyAddress,
      holderPolicyAddress,
      BigInt(holderAssetAddress)
    )
  ));
  const secondMint = await nmt.mint.staticCall(...mintArguments);
  await (await nmt.mint(...mintArguments)).wait();
  const restrictedAsset = await ethers.getContractAt("ChoreographyMutableAsset", secondMint[0]);
  report.push(await expectAllowed(
    "holder installs restrictive policy",
    () => restrictedAsset.setHolderSmartPolicy(denyAllPolicy.target)
  ));
  report.push(await expectDenied(
    "holder policy can deny further updates",
    administrator,
    {
      to: secondMint[0],
      data: restrictedAsset.interface.encodeFunctionData("setRoles", [roles, roleAddresses])
    }
  ));

  printReport(report);
  const summary = {
    allowedGas: totalGas(report, "allowed").toString(),
    deniedGas: totalGas(report, "denied").toString(),
    caseCount: report.length
  };
  const metricsPath = await writeMetrics("policy-tests", { summary: { ...summary, ethUsdPrice }, cases: report });
  const markdownPath = path.join(process.cwd(), "evaluation", "policy-tests.generated.md");
  await fs.writeFile(markdownPath, [
    "# Policy integration test results",
    "",
    "This report persists the receipt-derived values printed by `npm run test:policies`.",
    `USD estimates use ETH/USD ${ethUsdPrice ? `$${ethUsdPrice.toFixed(2)}` : "not available"}; set \`ETH_USD_PRICE\` for a fixed reproducible value.`,
    "",
    "- Cases: " + summary.caseCount,
    "- Allowed-operation gas total: " + summary.allowedGas,
    "- Denied-operation gas total: " + summary.deniedGas,
    "",
    "| Case | Outcome | Gas | Cost (wei) | USD @10 gwei | USD @30 gwei | USD @100 gwei |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.map((entry) => `| ${entry.label} | ${entry.outcome} | ${entry.gasUsed} | ${entry.costWei} | ${scenarioUsd(entry.gasUsed, ethUsdPrice).join(" | ")} |`),
    "",
    "The test covers Master mint and eligibility controls, Creator BPMN constraints, Holder restrictions, version evolution, and ownership transfer. Denied rows are reverted transactions with receipts, not simulated calls.",
    ""
  ].join("\n"));
  console.log(`Policy test metrics: ${metricsPath}`);
  console.log(`Policy test report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
