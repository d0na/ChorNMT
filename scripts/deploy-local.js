import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import { reportTotalCost, reportTransactionCost } from "./transaction-cost.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const choreographyNmtArtifact = JSON.parse(
    await fs.readFile(
      path.join(
        __dirname,
        "..",
        "artifacts",
        "contracts",
        "choreography",
        "ChoreographyNMT.sol",
        "ChoreographyNMT.json"
      ),
      "utf8"
    )
  );
  const creatorPolicyArtifact = JSON.parse(
    await fs.readFile(
      path.join(
        __dirname,
        "..",
        "artifacts",
        "contracts",
        "choreography",
        "CreatorSmartPolicy.sol",
        "CreatorSmartPolicy.json"
      ),
      "utf8"
    )
  );
  const holderPolicyArtifact = JSON.parse(
    await fs.readFile(
      path.join(
        __dirname,
        "..",
        "artifacts",
        "contracts",
        "choreography",
        "HolderSmartPolicy.sol",
        "HolderSmartPolicy.json"
      ),
      "utf8"
    )
  );

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new NonceManager(new Wallet(DEPLOYER_PRIVATE_KEY, provider));
  const deployerAddress = await signer.getAddress();
  const creatorPolicyFactory = new ContractFactory(
    creatorPolicyArtifact.abi,
    creatorPolicyArtifact.bytecode,
    signer
  );
  const holderPolicyFactory = new ContractFactory(
    holderPolicyArtifact.abi,
    holderPolicyArtifact.bytecode,
    signer
  );
  const choreographyNmtFactory = new ContractFactory(
    choreographyNmtArtifact.abi,
    choreographyNmtArtifact.bytecode,
    signer
  );

  const creatorPolicy = await creatorPolicyFactory.deploy();
  await creatorPolicy.waitForDeployment();
  const creatorReceipt = await creatorPolicy.deploymentTransaction().wait();

  const holderPolicy = await holderPolicyFactory.deploy();
  await holderPolicy.waitForDeployment();
  const holderReceipt = await holderPolicy.deploymentTransaction().wait();

  const choreographyNmt = await choreographyNmtFactory.deploy();
  await choreographyNmt.waitForDeployment();
  const nmtReceipt = await choreographyNmt.deploymentTransaction().wait();

  const [assetAddress, tokenId] = await choreographyNmt.mint.staticCall(
    deployerAddress,
    creatorPolicy.target,
    holderPolicy.target
  );
  const mintTx = await choreographyNmt.mint(
    deployerAddress,
    creatorPolicy.target,
    holderPolicy.target
  );
  const mintReceipt = await mintTx.wait();

  console.log(`ChoreographyNMT deployed to: ${choreographyNmt.target}`);
  console.log(`CreatorSmartPolicy deployed to: ${creatorPolicy.target}`);
  console.log(`HolderSmartPolicy deployed to: ${holderPolicy.target}`);
  console.log(`ChoreographyMutableAsset minted at: ${assetAddress}`);
  console.log(`Token ID: ${tokenId}`);
  reportTotalCost([
    reportTransactionCost("Deploy CreatorSmartPolicy", creatorReceipt),
    reportTransactionCost("Deploy HolderSmartPolicy", holderReceipt),
    reportTransactionCost("Deploy ChoreographyNMT", nmtReceipt),
    reportTransactionCost("Mint ChoreographyMutableAsset", mintReceipt)
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
