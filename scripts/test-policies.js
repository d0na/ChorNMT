import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { resolveEthUsdPrice, scenarioUsd, writeMetrics } from "./evaluation/metrics.js";
import { decodeTokenURI } from "../bpmn-builder-js/scripts/web3.js";
import { umlFigure } from "./evaluation/uml.js";

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
  const [administrator, eligibleHolder, unauthorizedCreator, ineligibleHolder, , carrierA, carrierB, carrierC, , authority] =
    await ethers.getSigners();

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

  const master = await masterFactory.deploy();
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

  // Creator constraints are hardcoded: the constrained assets are minted with the test-scenario
  // Creator policy, which reads role licenses through the participant attribute manager.
  const participantMaster = await (await ethers.getContractFactory("ParticipantMasterSmartPolicy")).deploy();
  const participantRenderer = await (await ethers.getContractFactory("ParticipantTokenURIRenderer")).deploy();
  await Promise.all([participantMaster.waitForDeployment(), participantRenderer.waitForDeployment()]);
  const participantNmt = await (await ethers.getContractFactory("ParticipantNMT"))
    .deploy(participantMaster.target, participantRenderer.target);
  const participantCreatorFactory = await ethers.getContractFactory(
    "contracts/participant/CreatorSmartPolicy.sol:CreatorSmartPolicy"
  );
  const participantCertifier = await participantCreatorFactory.connect(authority).deploy();
  const participantHolderPolicy = await (await ethers.getContractFactory(
    "contracts/participant/HolderSmartPolicy.sol:HolderSmartPolicy"
  )).deploy();
  const selfCertifier = await participantCreatorFactory.connect(carrierC).deploy();
  await Promise.all([
    participantNmt.waitForDeployment(),
    participantCertifier.waitForDeployment(),
    participantHolderPolicy.waitForDeployment(),
    selfCertifier.waitForDeployment()
  ]);
  const participantAM = await (await ethers.getContractFactory("ChoreographyParticipantAM"))
    .deploy(participantNmt.target, participantCertifier.target);
  await participantAM.waitForDeployment();
  const scenarioCreatorPolicy = await (await ethers.getContractFactory("CreatorSmartPolicyTestScenario"))
    .deploy(participantAM.target);
  await scenarioCreatorPolicy.waitForDeployment();
  const constrainedMintArguments = [administrator.address, scenarioCreatorPolicy.target, holderPolicyAddress];

  const [constrainedAssetAddress] = await nmt.mintWithInitialModel.staticCall(
    ...constrainedMintArguments,
    initialModel
  );
  report.push(await expectAllowed(
    "authorized creator mints with the test-scenario creator policy",
    () => nmt.mintWithInitialModel(...constrainedMintArguments, initialModel)
  ));
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

  // The test scenario allows 4 tasks and 5 sequence flows; the model now has 2 and 3.
  const packingUpdate = nodeUpdate("Packing", 2, ["Inspection"], ["End"]);
  report.push(await expectAllowed(
    "creator policy allows second approved task within limits",
    () => constrainedAsset.setNodes(...packingUpdate)
  ));

  // Two approved tasks without outgoing flows: 5 tasks, 4 flows.
  const twoTasksUpdate = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((field) => [
    ...nodeUpdate("Labeling", 2, ["Packing"], [])[field],
    ...nodeUpdate("Shipping", 2, ["Packing"], [])[field]
  ]);
  report.push(await expectDenied(
    "creator policy denies task count above limit",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData("setNodes", twoTasksUpdate)
    }
  ));

  // Inspection gains two outgoing flows: 3 tasks, 6 flows.
  report.push(await expectDenied(
    "creator policy denies sequence flow count above limit",
    administrator,
    {
      to: constrainedAssetAddress,
      data: constrainedAsset.interface.encodeFunctionData(
        "setNodes",
        nodeUpdate("Inspection", 2, ["Delivery"], ["End", "Packing", "Delivery"])
      )
    }
  ));

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

  // Participant licenses. The participant policies hardcode their configuration (license types,
  // issuers, qualified organizations, allowed messages) for default Hardhat accounts 5-9.
  const SPECIAL_CARRIER = ethers.encodeBytes32String("SpecialCarrier");
  const CARRIER = ethers.encodeBytes32String("Carrier");
  const specialCarrierMessages = ["Message_0dai5by", "Message_10n229k"].map(ethers.encodeBytes32String);
  const mintLicense = async (holder, certifierPolicy, participantType) => {
    const licenseArguments = [holder.address, certifierPolicy.target, participantHolderPolicy.target, participantType];
    const [licenseAddress] = await participantNmt.connect(authority).mintWithParticipantType.staticCall(...licenseArguments);
    await (await participantNmt.connect(authority).mintWithParticipantType(...licenseArguments)).wait();
    return ethers.getContractAt("ParticipantMutableAsset", licenseAddress, holder);
  };
  const licenseMetadata = async (license) =>
    JSON.parse(Buffer.from((await license.tokenURI()).split(",")[1], "base64").toString("utf8")).participant;
  const carrierLicense = await mintLicense(carrierA, participantCertifier, SPECIAL_CARRIER);
  const plainCarrierLicense = await mintLicense(carrierC, participantCertifier, CARRIER);
  const selfCertifiedLicense = await mintLicense(carrierC, selfCertifier, SPECIAL_CARRIER);
  assert.equal(await carrierLicense.participantType(), SPECIAL_CARRIER);

  report.push(await expectDenied(
    "unauthorized issuer cannot mint a participant license",
    carrierC,
    {
      to: participantNmt.target,
      data: participantNmt.interface.encodeFunctionData("mintWithParticipantType", [
        carrierC.address,
        participantCertifier.target,
        participantHolderPolicy.target,
        SPECIAL_CARRIER
      ])
    }
  ));
  report.push(await expectDenied(
    "participant license cannot be minted without a type",
    authority,
    {
      to: participantNmt.target,
      data: participantNmt.interface.encodeFunctionData("mint", [
        carrierA.address,
        participantCertifier.target,
        participantHolderPolicy.target
      ])
    }
  ));
  report.push(await expectAllowed(
    "license holder declares messages allowed for its type",
    () => carrierLicense.setMessages(specialCarrierMessages)
  ));
  report.push(await expectDenied(
    "creator policy denies a message not allowed for the license type",
    carrierC,
    {
      to: plainCarrierLicense.target,
      data: plainCarrierLicense.interface.encodeFunctionData("setMessages", [[ethers.encodeBytes32String("Message_10n229k")]])
    }
  ));
  report.push(await expectAllowed(
    "license holder updates its organization data",
    () => carrierLicense.setName(ethers.encodeBytes32String("Carrier A"))
  ));
  await (await carrierLicense.setProfile(ethers.id("Carrier A organization profile"))).wait();

  const carrierModel = {
    ...initialModel,
    roleNames: ["Buyer", "Supplier", "Carrier"],
    roleAddresses: [administrator.address, eligibleHolder.address, ethers.ZeroAddress],
    participantRoles: ["", "Carrier", ""]
  };
  const [carrierAssetAddress] = await nmt.mintWithInitialModel.staticCall(...constrainedMintArguments, carrierModel);
  report.push(await expectAllowed(
    "authorized creator mints a model whose Carrier role requires a SpecialCarrier license",
    () => nmt.mintWithInitialModel(...constrainedMintArguments, carrierModel)
  ));
  const carrierAsset = await ethers.getContractAt("ChoreographyMutableAsset", carrierAssetAddress);
  const setRoleTransaction = (role, account) => ({
    to: carrierAssetAddress,
    data: carrierAsset.interface.encodeFunctionData("setRoles", [[role], [account]])
  });

  report.push(await expectDenied(
    "creator policy denies a plain account for a licensed role",
    administrator,
    setRoleTransaction("Carrier", carrierA.address)
  ));
  report.push(await expectDenied(
    "creator policy denies a license of another type",
    administrator,
    setRoleTransaction("Carrier", plainCarrierLicense.target)
  ));
  report.push(await expectDenied(
    "creator policy denies a license from an untrusted certifier",
    administrator,
    setRoleTransaction("Carrier", selfCertifiedLicense.target)
  ));
  report.push(await expectDenied(
    "creator policy denies new role when known roles are enforced",
    administrator,
    setRoleTransaction("Backup Carrier", carrierLicense.target)
  ));
  report.push(await expectDenied(
    "creator policy denies account already holding another role",
    administrator,
    setRoleTransaction("Supplier", administrator.address)
  ));
  report.push(await expectAllowed(
    "holder links a role to a certified license",
    () => carrierAsset.setRoles(["Carrier"], [carrierLicense.target])
  ));

  const sellLicense = (to) => ({
    to: participantNmt.target,
    data: participantNmt.interface.encodeFunctionData("transferFrom", [carrierA.address, to.address, BigInt(carrierLicense.target)])
  });
  report.push(await expectDenied(
    "participant master denies selling a license to an unqualified buyer",
    carrierA,
    sellLicense(carrierC)
  ));
  report.push(await expectDenied(
    "buyer cannot take a license without the seller",
    carrierB,
    sellLicense(carrierB)
  ));
  report.push(await expectAllowed(
    "holder sells a license to a qualified buyer",
    () => participantNmt.connect(carrierA).transferFrom(carrierA.address, carrierB.address, BigInt(carrierLicense.target))
  ));
  assert.equal(await participantNmt.ownerOf(BigInt(carrierLicense.target)), carrierB.address);
  assert.equal(await carrierAsset.getRole("Carrier"), carrierLicense.target);
  // The sold license still meets the role requirement: relinking it is allowed.
  await carrierAsset.setRoles.staticCall(["Carrier"], [carrierLicense.target]);
  assert.deepEqual(
    modelFromTokenURI(await nmt.tokenURI(BigInt(carrierAssetAddress))),
    { ...carrierModel, roleAddresses: [administrator.address, eligibleHolder.address, carrierLicense.target] }
  );
  // The sale clears the seller's organization data and keeps the messages, marked with their writer.
  assert.equal(await carrierLicense.getName(), ethers.ZeroHash);
  assert.equal(await carrierLicense.getProfile(), ethers.ZeroHash);
  assert.deepEqual([...await carrierLicense.getMessages()], specialCarrierMessages);
  assert.deepEqual(await licenseMetadata(carrierLicense), {
    schemaVersion: "1.0",
    participantType: "SpecialCarrier",
    holder: carrierB.address,
    name: "",
    profile: ethers.ZeroHash,
    messages: ["Message_0dai5by", "Message_10n229k"],
    messagesWriter: carrierA.address,
    messagesWrittenByHolder: false
  });
  assert.equal(await carrierLicense.holderSmartPolicy(), ethers.ZeroAddress);
  await (await carrierLicense.connect(carrierB).setHolderSmartPolicy(participantHolderPolicy.target)).wait();
  report.push(await expectDenied(
    "former license holder cannot update the license",
    carrierA,
    {
      to: carrierLicense.target,
      data: carrierLicense.interface.encodeFunctionData("setName", [ethers.encodeBytes32String("Carrier A")])
    }
  ));
  report.push(await expectAllowed(
    "new license holder updates its data",
    () => carrierLicense.connect(carrierB).setName(ethers.encodeBytes32String("Carrier B"))
  ));
  report.push(await expectAllowed(
    "new license holder rewrites the messages",
    () => carrierLicense.connect(carrierB).setMessages(specialCarrierMessages)
  ));
  const licenseAfterRewrite = await licenseMetadata(carrierLicense);
  assert.equal(licenseAfterRewrite.name, "Carrier B");
  assert.equal(licenseAfterRewrite.messagesWriter, carrierB.address);
  assert.equal(licenseAfterRewrite.messagesWrittenByHolder, true);

  // Participant policies deny by default: an action they do not recognize is refused even to the holder,
  // and every license mutator has an explicit decision, so a new mutator cannot become holder-editable by omission.
  const unrecognizedAction = ethers.id("setCertificationExpiry(uint256)").slice(0, 10);
  assert.equal(await participantCertifier.evaluate(carrierB.address, unrecognizedAction, carrierLicense.target), false);
  assert.equal(await participantHolderPolicy.evaluate(carrierB.address, unrecognizedAction, carrierLicense.target), false);
  const certifiedActions = ["setCreatorSmartPolicy"];
  const policyFreeActions = ["setHolderSmartPolicy"];
  const creatorOnlyActions = ["transferFrom"];
  const licenseDecisions = [];
  carrierLicense.interface.forEachFunction((fragment) => {
    if (fragment.constant || policyFreeActions.includes(fragment.name)) {
      return;
    }
    const holderAllowed = !certifiedActions.includes(fragment.name);
    licenseDecisions.push(Promise.all([
      participantCertifier.evaluate(carrierB.address, fragment.selector, carrierLicense.target),
      participantCertifier.evaluate(authority.address, fragment.selector, carrierLicense.target),
      participantHolderPolicy.evaluate(carrierB.address, fragment.selector, carrierLicense.target)
    ]).then(([creatorForHolder, creatorForCertifier, holderForHolder]) => {
      assert.equal(creatorForHolder, holderAllowed, `participant Creator policy decision for holder on ${fragment.name}`);
      assert.equal(creatorForCertifier, !holderAllowed, `participant Creator policy decision for certifier on ${fragment.name}`);
      assert.equal(
        holderForHolder,
        holderAllowed && !creatorOnlyActions.includes(fragment.name),
        `participant Holder policy decision on ${fragment.name}`
      );
    }));
  });
  await Promise.all(licenseDecisions);

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

  report.push(await expectAllowed(
    "holder transfers to eligible holder",
    () => nmt.transferFrom(administrator.address, eligibleHolder.address, BigInt(assetAddress))
  ));
  assert.equal(await nmt.ownerOf(BigInt(assetAddress)), eligibleHolder.address);
  report.push(await expectDenied(
    "holder cannot transfer to an ineligible holder",
    eligibleHolder,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("transferFrom", [
        eligibleHolder.address,
        ineligibleHolder.address,
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

  // A Master policy is replaced only with its own approval, and the replacement governs every later action:
  // here one that denies everything.
  report.push(await expectDenied(
    "holder cannot replace master policy",
    eligibleHolder,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("setMasterSmartPolicy", [denyAllPolicy.target])
    }
  ));
  report.push(await expectDenied(
    "master administrator cannot remove master policy",
    administrator,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("setMasterSmartPolicy", [ethers.ZeroAddress])
    }
  ));
  report.push(await expectAllowed(
    "master administrator replaces master policy",
    () => nmt.setMasterSmartPolicy(denyAllPolicy.target)
  ));
  assert.equal(await nmt.masterSmartPolicy(), denyAllPolicy.target);
  report.push(await expectDenied(
    "replaced master policy governs minting",
    administrator,
    {
      to: nmtAddress,
      data: nmt.interface.encodeFunctionData("mint", holderMintArguments)
    }
  ));

  // The participant Master is hardcoded, so the replacement is a different policy: one that denies everything.
  report.push(await expectDenied(
    "license holder cannot replace participant master policy",
    carrierB,
    {
      to: participantNmt.target,
      data: participantNmt.interface.encodeFunctionData("setMasterSmartPolicy", [denyAllPolicy.target])
    }
  ));
  report.push(await expectAllowed(
    "participant master administrator replaces participant master policy",
    () => participantNmt.connect(authority).setMasterSmartPolicy(denyAllPolicy.target)
  ));
  report.push(await expectDenied(
    "replaced participant master policy governs sales",
    carrierB,
    {
      to: participantNmt.target,
      data: participantNmt.interface.encodeFunctionData("transferFrom", [carrierB.address, carrierA.address, BigInt(carrierLicense.target)])
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
    "The cases follow the use cases below: each row is one actor attempting one use case, allowed or denied by the policy layer that owns the decision. The sequence diagrams of every flow are in [UML diagrams](../docs/uml.md).",
    "",
    ...umlFigure("use-case-choreography", markdownPath),
    ...umlFigure("use-case-participant-license", markdownPath),
    "| Case | Outcome | Gas | Cost (wei) | USD @10 gwei | USD @30 gwei | USD @100 gwei |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.map((entry) => `| ${entry.label} | ${entry.outcome} | ${entry.gasUsed} | ${entry.costWei} | ${scenarioUsd(entry.gasUsed, ethUsdPrice).join(" | ")} |`),
    "",
    "The test covers Master mint and eligibility controls, Creator BPMN constraints, role licenses and their sale, Holder restrictions, Master replacement, and ownership transfer. Denied rows are reverted transactions with receipts, not simulated calls.",
    ""
  ].join("\n"));
  console.log(`Policy test metrics: ${metricsPath}`);
  console.log(`Policy test report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
