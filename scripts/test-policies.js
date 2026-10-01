import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { AbiCoder, ZeroAddress } from "ethers";
import { resolveEthUsdPrice, scenarioUsd, writeMetrics } from "./evaluation/metrics.js";

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

const ERROR_STRING_SELECTOR = "0x08c379a0";

async function revertReason(signer, transaction) {
  try {
    await signer.call(transaction);
  } catch (error) {
    if (typeof error.data === "string" && error.data.startsWith(ERROR_STRING_SELECTOR)) {
      return AbiCoder.defaultAbiCoder().decode(["string"], `0x${error.data.slice(10)}`)[0];
    }
    return error.reason ?? `unrecognized revert data ${error.data}`;
  }
  return null;
}

async function expectDenied(label, signer, transaction, expectedReason) {
  assert.equal(
    await revertReason(signer, transaction),
    expectedReason,
    `${label} should be denied with "${expectedReason}"`
  );
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
  const nmtFactory = await ethers.getContractFactory("ChoreographyNMT");

  const master = await masterFactory.deploy(administrator.address);
  const creatorPolicy = await creatorFactory.deploy();
  const holderPolicy = await holderFactory.deploy();
  const nmt = await nmtFactory.deploy(await master.getAddress());
  await Promise.all([
    master.waitForDeployment(),
    creatorPolicy.waitForDeployment(),
    holderPolicy.waitForDeployment(),
    nmt.waitForDeployment()
  ]);

  const nmtAddress = await nmt.getAddress();

  const participantNmt = await (await ethers.getContractFactory("ParticipantNMT")).deploy();
  const participantCreatorPolicy = await (await ethers.getContractFactory(
    "contracts/participant/CreatorSmartPolicy.sol:CreatorSmartPolicy"
  )).deploy();
  const participantHolderPolicy = await (await ethers.getContractFactory(
    "contracts/participant/HolderSmartPolicy.sol:HolderSmartPolicy"
  )).deploy();
  await Promise.all([
    participantNmt.waitForDeployment(),
    participantCreatorPolicy.waitForDeployment(),
    participantHolderPolicy.waitForDeployment()
  ]);
  const mintParticipant = async (owner) => {
    const participantArguments = [owner.address, participantCreatorPolicy.target, participantHolderPolicy.target];
    const [participantAddress] = await participantNmt.mint.staticCall(...participantArguments);
    await (await participantNmt.mint(...participantArguments)).wait();
    return participantAddress;
  };
  const BUYER = ethers.encodeBytes32String("BUYER");
  const SUPPLIER = ethers.encodeBytes32String("SUPPLIER");
  const buyerParticipant = await mintParticipant(administrator);
  const otherBuyerParticipant = await mintParticipant(administrator);
  const supplierParticipant = await mintParticipant(eligibleHolder);
  const participantAt = (address) => ethers.getContractAt("ParticipantMutableAsset", address);
  await (await (await participantAt(buyerParticipant)).setDescriptor(BUYER)).wait();
  await (await (await participantAt(otherBuyerParticipant)).setDescriptor(BUYER)).wait();
  await (await (await participantAt(supplierParticipant)).connect(eligibleHolder).setDescriptor(SUPPLIER)).wait();
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
  // Roles start without participants (zero address).
  const roleAddresses = [ZeroAddress, ZeroAddress];
  const initialModel = {
    roleNames: roles,
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
  report.push(await expectAllowed(
    "creator sets participant category for a role",
    () => creatorPolicy.setRoleCategory("Buyer", BUYER)
  ));
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
  assert.equal(await initializedAsset.getRole("Buyer"), ZeroAddress);

  report.push(await expectAllowed(
    "holder allowlists participant in holder policy",
    () => holderPolicy.setAllowedParticipant(assetAddress, buyerParticipant, true)
  ));
  report.push(await expectAllowed(
    "holder binds participant asset to role",
    () => asset.setRoles(["Buyer"], [buyerParticipant])
  ));
  assert.equal(await asset.getRole("Buyer"), buyerParticipant);
  report.push(await expectDenied(
    "holder policy denies participant outside holder allowlist",
    administrator,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [["Buyer"], [otherBuyerParticipant]])
    },
    "Operation DENIED by HOLDER policy"
  ));

  // Allowlisted by the holder, but outside the Creator rules for the role.
  for (const candidate of [supplierParticipant, eligibleHolder.address, initializedAssetAddress]) {
    await (await holderPolicy.setAllowedParticipant(assetAddress, candidate, true)).wait();
  }
  report.push(await expectDenied(
    "creator policy denies participant of another category",
    administrator,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [["Buyer"], [supplierParticipant]])
    },
    "Operation DENIED by CREATOR role policy"
  ));
  report.push(await expectDenied(
    "creator policy denies externally owned account as role participant",
    administrator,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [["Buyer"], [eligibleHolder.address]])
    },
    "Operation DENIED by CREATOR role policy"
  ));
  report.push(await expectDenied(
    "creator policy denies non-participant contract as role participant",
    administrator,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [["Buyer"], [initializedAssetAddress]])
    },
    "Operation DENIED by CREATOR role policy"
  ));
  report.push(await expectDenied(
    "non-holder cannot edit holder participant allowlist",
    eligibleHolder,
    {
      to: holderPolicyAddress,
      data: holderPolicy.interface.encodeFunctionData("setAllowedParticipant", [assetAddress, otherBuyerParticipant, true])
    },
    "Caller is not the holder"
  ));
  report.push(await expectAllowed(
    "holder unbinds role participant",
    () => asset.setRoles(["Buyer"], [ZeroAddress])
  ));
  assert.equal(await asset.getRole("Buyer"), ZeroAddress);

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
    () => creatorPolicy.setBpmnLimits(2, 4)
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
    },
    "Operation DENIED by CREATOR BPMN policy"
  ));

  await (await creatorPolicy.setBpmnLimits(3, 3)).wait();
  report.push(await expectDenied(
    "creator policy denies sequence flow count above limit",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", packingUpdate)
    },
    "Operation DENIED by CREATOR BPMN policy"
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
    },
    "Operation DENIED by CREATOR BPMN policy"
  ));

  const unknownTargetUpdate = nodeUpdate("Inspection", 2, ["Delivery"], ["Unknown"]);
  report.push(await expectDenied(
    "creator policy denies flow to unknown node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", unknownTargetUpdate)
    },
    "Operation DENIED by CREATOR BPMN policy"
  ));

  const protectedStartUpdate = nodeUpdate("Start", 0, [], ["Delivery"]);
  report.push(await expectDenied(
    "creator policy denies protected node update",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", protectedStartUpdate)
    },
    "Operation DENIED by CREATOR BPMN policy"
  ));

  const unknownSourceUpdate = nodeUpdate("Inspection", 2, ["Unknown"], ["End"]);
  report.push(await expectDenied(
    "creator policy denies flow from unknown node",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", unknownSourceUpdate)
    },
    "Operation DENIED by CREATOR BPMN policy"
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
    },
    "Operation DENIED by CREATOR BPMN policy"
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
    },
    "Operation DENIED by CREATOR BPMN policy"
  ));

  for (const participant of [supplierParticipant, buyerParticipant]) {
    await (await holderPolicy.setAllowedParticipant(constrainedAssetAddress, participant, true)).wait();
  }
  await (await creatorPolicy.setProtectedRole("Buyer", true)).wait();
  report.push(await expectAllowed(
    "creator policy allows unprotected role update",
    () => constrainedAsset.setRoles(["Supplier"], [supplierParticipant])
  ));
  report.push(await expectDenied(
    "creator policy denies protected role update",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setRoles", [["Buyer"], [buyerParticipant]])
    },
    "Operation DENIED by CREATOR role policy"
  ));
  assert.equal(await constrainedAsset.getRole("Buyer"), ZeroAddress);
  await (await creatorPolicy.setProtectedRole("Buyer", false)).wait();

  // A dedicated Creator policy, so the single-node updates above stay valid.
  const consistentPolicy = await creatorFactory.deploy();
  await consistentPolicy.waitForDeployment();
  report.push(await expectAllowed(
    "creator enables consistent sequence flows",
    () => consistentPolicy.setConsistentFlowsEnabled(true)
  ));
  const consistentMintArguments = [administrator.address, await consistentPolicy.getAddress(), holderPolicyAddress];
  const [consistentAssetAddress] = await nmt.mintWithInitialModel.staticCall(...consistentMintArguments, initialModel);
  await (await nmt.mintWithInitialModel(...consistentMintArguments, initialModel)).wait();
  const consistentAsset = await ethers.getContractAt("ChoreographyMutableAsset", consistentAssetAddress);
  const nodesUpdate = (nodes) => {
    const updates = nodes.map(([name, nodeType, incoming, outgoing]) => nodeUpdate(name, nodeType, incoming, outgoing));
    return updates[0].map((_, field) => updates.map((update) => update[field][0]));
  };
  const deniedConsistency = (label, nodes) => expectDenied(
    label,
    administrator,
    {
      to: consistentAssetAddress,
      data: consistentAsset.interface.encodeFunctionData("setNodes", nodesUpdate(nodes))
    },
    "Operation DENIED by CREATOR BPMN policy"
  );
  report.push(await expectAllowed(
    "creator policy allows task insertion declared on both endpoints",
    () => consistentAsset.setNodes(...nodesUpdate([
      ["Delivery", 2, ["Start"], ["Inspection"]],
      ["Inspection", 2, ["Delivery"], ["End"]],
      ["End", 1, ["Inspection"], []]
    ]))
  ));
  report.push(await deniedConsistency(
    "creator policy denies flow missing from target incoming",
    [["Delivery", 2, ["Start"], ["Inspection", "End"]]]
  ));
  report.push(await deniedConsistency(
    "creator policy denies flow missing from source outgoing",
    [["End", 1, ["Inspection", "Start"], []]]
  ));
  report.push(await deniedConsistency(
    "creator policy denies flow removed from one endpoint only",
    [["Inspection", 2, ["Delivery"], []]]
  ));
  assert.deepEqual(
    Array.from((await consistentAsset.getNodeTypeAndEdges("End"))[1]),
    ["Inspection"]
  );

  // Model history is kept by the chain: every accepted change is an event.
  const nodeHistory = await consistentAsset.queryFilter(consistentAsset.filters.NodesChanged());
  assert.deepEqual(
    nodeHistory.map((event) => Array.from(event.args.nodeNames)),
    [initialModel.names, ["Delivery", "Inspection", "End"]]
  );

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
    },
    "Operation DENIED by MASTER policy"
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
    },
    "Operation DENIED by MASTER policy"
  ));

  report.push(await expectDenied(
    "non-holder cannot update choreography",
    eligibleHolder,
    {
      to: assetAddress,
      data: asset.interface.encodeFunctionData("setRoles", [roles, roleAddresses])
    },
    "Operation DENIED by CREATOR policy"
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
    },
    "Operation DENIED by MASTER policy"
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
    },
    "Operation DENIED by CREATOR policy"
  ));
  assert.equal(await holderAsset.creatorSmartPolicy(), creatorPolicyAddress);
  report.push(await expectAllowed(
    "creator policy administrator replaces creator policy",
    () => holderAsset.setCreatorSmartPolicy(creatorPolicyAddress)
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
    },
    "Operation DENIED by HOLDER policy"
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
    "The test covers Master mint and eligibility controls, Creator BPMN constraints, Holder restrictions, and ownership transfer. Denied rows are reverted transactions with receipts, not simulated calls.",
    ""
  ].join("\n"));
  console.log(`Policy test metrics: ${metricsPath}`);
  console.log(`Policy test report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
