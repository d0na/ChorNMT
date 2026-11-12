import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import { importBpmnToNmt } from "../bpmn-builder-js/scripts/import-bpmn.js";
import { deployChoreographyModel, modelFromDataset } from "./choreography-model.js";
import { summarizeNodes, writeMetrics } from "./evaluation/metrics.js";
import { reportTotalCost, reportTransactionCost } from "./evaluation/transaction-cost.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// The Master policy authorizes one creator, Hardhat account 4, which is not its administrator.
const CREATOR_PRIVATE_KEY =
  process.env.CREATOR_PRIVATE_KEY ||
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
const DEFAULT_BPMN = "references/paper-example.bpmn";

// fileName is relative to contracts/choreography/, or "participant/<File>" for another directory.
export async function readArtifact(fileName, contractName = path.basename(fileName)) {
  const source = fileName.includes("/") ? fileName : `choreography/${fileName}`;
  return JSON.parse(await fs.readFile(
    path.join(__dirname, "..", "artifacts", "contracts", `${source}.sol`, `${contractName}.json`),
    "utf8"
  ));
}

export async function deployContract(signer, fileName, args = []) {
  const artifact = await readArtifact(fileName);
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return { contract, receipt: await contract.deploymentTransaction().wait() };
}

function connect(privateKey = DEPLOYER_PRIVATE_KEY) {
  return new NonceManager(new Wallet(privateKey, new JsonRpcProvider(RPC_URL)));
}

// Mints an instance of the choreography type, born with the type's model: the authorized creator
// mints it for the holder (signer), who then links its roles to local accounts 1..n, or to
// roleAccounts when given: the model keeps only the role names. With no role name the holder
// assigns nothing here (the roles are linked later, for example to participant licenses).
export async function mintAsset(choreographyNmtAddress, creatorPolicyAddress, holderPolicyAddress, roleNames, { signer = connect(), creator = connect(CREATOR_PRIVATE_KEY), roleAccounts } = {}) {
  const holderAddress = await signer.getAddress();
  const nmt = new Contract(choreographyNmtAddress, (await readArtifact("ChoreographyNMT")).abi, creator);
  const [assetAddress, tokenId] = await nmt.mint.staticCall(holderAddress, creatorPolicyAddress, holderPolicyAddress);
  const mintReceipt = await (await nmt.mint(holderAddress, creatorPolicyAddress, holderPolicyAddress)).wait();
  if (roleNames.length === 0) {
    return { assetAddress, tokenId, receipts: { mint: mintReceipt }, costs: [reportTransactionCost("Mint ChoreographyMutableAsset", mintReceipt)] };
  }

  let accounts = roleAccounts;
  if (!accounts) {
    const localAccounts = await signer.provider.send("eth_accounts", []);
    if (localAccounts.length < roleNames.length + 1) {
      throw new Error("Not enough local accounts to assign choreography roles.");
    }
    accounts = roleNames.map((_, index) => localAccounts[index + 1]);
  }
  const asset = new Contract(assetAddress, (await readArtifact("ChoreographyMutableAsset")).abi, signer);
  const rolesReceipt = await (await asset.setRoles(roleNames, accounts)).wait();

  return {
    assetAddress,
    tokenId,
    receipts: { mint: mintReceipt, setRoles: rolesReceipt },
    costs: [
      reportTransactionCost("Mint ChoreographyMutableAsset", mintReceipt),
      reportTransactionCost("setRoles", rolesReceipt)
    ]
  };
}

// Deploys a choreography type for an imported model: policies, renderer, the model contract, and
// its ChoreographyNMT.
export async function deployChoreographyType(signer, dataset) {
  const master = await deployContract(signer, "MasterSmartPolicy");
  const creator = await deployContract(signer, "CreatorSmartPolicy");
  const holder = await deployContract(signer, "HolderSmartPolicy");
  const renderer = await deployContract(signer, "ChoreographyTokenURIRenderer");
  const model = await deployChoreographyModel(signer, modelFromDataset(dataset));
  const choreographyNmt = await deployContract(signer, "ChoreographyNMT", [
    master.contract.target,
    renderer.contract.target,
    model.address
  ]);
  return { master, creator, holder, renderer, model, choreographyNmt };
}

// Deploys a choreography type from a BPMN model and mints one instance.
export async function deployAsset(bpmnPath = DEFAULT_BPMN, outputPath, { signer = connect() } = {}) {
  const startedAt = performance.now();
  const { dataset, outputPath: nmtPath } = await importBpmnToNmt(bpmnPath, outputPath);
  const importedAt = performance.now();

  const { master, creator, holder, renderer, model, choreographyNmt } = await deployChoreographyType(signer, dataset);
  const deployedAt = performance.now();
  const instance = await mintAsset(choreographyNmt.contract.target, creator.contract.target, holder.contract.target, dataset.roles, { signer });
  const mintedAt = performance.now();

  console.log(`ChoreographyNMT deployed to: ${choreographyNmt.contract.target}`);
  console.log(`Choreography model (SSTORE2) deployed to: ${model.address}`);
  console.log(`MasterSmartPolicy deployed to: ${master.contract.target}`);
  console.log(`CreatorSmartPolicy deployed to: ${creator.contract.target}`);
  console.log(`HolderSmartPolicy deployed to: ${holder.contract.target}`);
  console.log(`ChoreographyTokenURIRenderer deployed to: ${renderer.contract.target}`);
  console.log(`ChoreographyMutableAsset minted at: ${instance.assetAddress}`);
  console.log(`Token ID: ${instance.tokenId}`);
  console.log(`NMT dataset: ${nmtPath}`);
  const deploymentCosts = [
    reportTransactionCost("Deploy MasterSmartPolicy", master.receipt),
    reportTransactionCost("Deploy CreatorSmartPolicy", creator.receipt),
    reportTransactionCost("Deploy HolderSmartPolicy", holder.receipt),
    reportTransactionCost("Deploy ChoreographyTokenURIRenderer", renderer.receipt),
    reportTransactionCost("Deploy choreography model (SSTORE2)", model.receipt),
    reportTransactionCost("Deploy ChoreographyNMT", choreographyNmt.receipt)
  ];
  const costs = [...deploymentCosts, ...instance.costs];
  const totalCost = reportTotalCost(costs);
  const metricsPath = await writeMetrics("deploy-asset", {
    assetAddress: instance.assetAddress,
    sourceBpmn: bpmnPath,
    model: summarizeNodes(dataset.nodes, dataset.roles),
    blockchain: { transactions: costs, total: totalCost },
    timingsMs: {
      import: importedAt - startedAt,
      deploy: deployedAt - importedAt,
      mint: mintedAt - deployedAt,
      total: mintedAt - startedAt
    }
  });
  return {
    assetAddress: instance.assetAddress,
    tokenId: instance.tokenId,
    nmtPath,
    dataset,
    choreographyNmtAddress: choreographyNmt.contract.target,
    modelAddress: model.address,
    masterPolicyAddress: master.contract.target,
    creatorPolicyAddress: creator.contract.target,
    holderPolicyAddress: holder.contract.target,
    rendererAddress: renderer.contract.target,
    deploymentCosts,
    mintCosts: instance.costs,
    costs,
    totalCost,
    metricsPath,
    timingsMs: { import: importedAt - startedAt, deploy: deployedAt - importedAt, mint: mintedAt - deployedAt }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  deployAsset(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
