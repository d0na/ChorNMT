import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "BPMNChoreography.sol",
    "BPMNChoreography.json"
  );
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();

  await contract.waitForDeployment();

  console.log(`BPMNChoreography deployed to: ${contract.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
