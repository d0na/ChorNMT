import assert from "node:assert/strict";
import hre from "hardhat";

const GAS_LIMIT = 1_000_000n;

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
  try {
    const response = await signer.sendTransaction({ ...transaction, gasLimit: GAS_LIMIT });
    const receipt = await response.wait();
    assert.fail(`${label} unexpectedly succeeded with status ${receipt.status}`);
  } catch (error) {
    const receipt = error.receipt || (error.transactionHash && await signer.provider.getTransactionReceipt(error.transactionHash));
    assert.ok(receipt, `${label} did not produce a transaction receipt`);
    assert.equal(receipt.status, 0, `${label} should revert`);
    return { label, outcome: "denied", ...formatCost(receipt) };
  }
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

async function main() {
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
  assert.equal(await initializedAsset.initialized(), true);
  assert.deepEqual(Array.from(await initializedAsset.getNodeNames()), initialModel.names);

  const emptyThenImportGas =
    gasFor(report, "authorized creator mints eligible holder") +
    gasFor(report, "creator and holder update roles") +
    gasFor(report, "creator and holder update nodes");
  const initializedMintGas = gasFor(report, "authorized creator mints initialized model");
  console.log(
    `Initial model gas: mint then import=${emptyThenImportGas}, mintWithInitialModel=${initializedMintGas}, saving=${emptyThenImportGas - initializedMintGas}`
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

  report.push(await expectAllowed("holder freezes choreography", () => asset.freeze()));
  report.push(await expectDenied(
    "frozen choreography rejects updates",
    administrator,
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
