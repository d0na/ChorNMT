import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, ZeroAddress, encodeBytes32String, isAddress } from "ethers";
import { reportTotalCost, reportTransactionCost } from "./evaluation/transaction-cost.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPLOYMENT_PATH = path.join(
  __dirname,
  "..",
  "bpmn-builder-js",
  "example",
  "contract",
  "participant-deployment.generated.json"
);

const USAGE = `Usage:
  npm run deploy:participants
  npm run mint:participant -- <category>
  npm run set:role-category -- <asset-address> <role> <category>
  npm run assign:participant -- <asset-address> <role> <participant-address|0x0>`;

async function readArtifact(directory, contractName) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", directory, `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(await fs.readFile(artifactPath, "utf8"));
}

async function contractAt(directory, contractName, address, signer) {
  const { abi } = await readArtifact(directory, contractName);
  return new Contract(address, abi, signer);
}

function signer() {
  return new NonceManager(new Wallet(DEPLOYER_PRIVATE_KEY, new JsonRpcProvider(RPC_URL)));
}

// A category is a short label stored as bytes32 (at most 31 UTF-8 bytes).
function toCategory(label) {
  if (!label) {
    throw new Error("A category label is required.");
  }
  return encodeBytes32String(label);
}

function requireAddress(value, label) {
  if (!isAddress(value)) {
    throw new Error(`${label} must be an Ethereum address.`);
  }
  return value;
}

async function send(label, transaction) {
  return reportTransactionCost(label, await (await transaction).wait());
}

export async function deployParticipants() {
  const account = signer();
  const deployed = {};
  const costs = [];
  for (const [key, directory, contractName] of [
    ["participantNmt", "participant", "ParticipantNMT"],
    ["creatorPolicy", "participant", "CreatorSmartPolicy"],
    ["holderPolicy", "participant", "HolderSmartPolicy"]
  ]) {
    const { abi, bytecode } = await readArtifact(directory, contractName);
    const contract = await new ContractFactory(abi, bytecode, account).deploy();
    costs.push(reportTransactionCost(`Deploy participant ${contractName}`, await contract.deploymentTransaction().wait()));
    deployed[key] = contract.target;
  }
  await fs.mkdir(path.dirname(DEPLOYMENT_PATH), { recursive: true });
  await fs.writeFile(DEPLOYMENT_PATH, `${JSON.stringify({ rpcUrl: RPC_URL, ...deployed }, null, 2)}\n`, "utf8");
  console.log(`ParticipantNMT deployed to: ${deployed.participantNmt}`);
  console.log(`Participant deployment: ${DEPLOYMENT_PATH}`);
  return { ...deployed, costs, totalCost: reportTotalCost(costs) };
}

export async function mintParticipant(categoryLabel) {
  const category = toCategory(categoryLabel);
  const deployment = JSON.parse(
    await fs.readFile(DEPLOYMENT_PATH, "utf8").catch(() => {
      throw new Error("No participant deployment found. Run npm run deploy:participants first.");
    })
  );
  const account = signer();
  const owner = await account.getAddress();
  const participantNmt = await contractAt("participant", "ParticipantNMT", deployment.participantNmt, account);
  const mintArguments = [owner, deployment.creatorPolicy, deployment.holderPolicy];
  const [participantAddress] = await participantNmt.mint.staticCall(...mintArguments);
  const costs = [await send("Mint ParticipantMutableAsset", participantNmt.mint(...mintArguments))];
  const participant = await contractAt("participant", "ParticipantMutableAsset", participantAddress, account);
  costs.push(await send("setDescriptor", participant.setDescriptor(category)));
  console.log(`ParticipantMutableAsset minted at: ${participantAddress}`);
  console.log(`Category: ${categoryLabel}`);
  return { participantAddress, costs, totalCost: reportTotalCost(costs) };
}

// Creator operation: the role accepts only participant assets of this category.
export async function setRoleCategory(assetAddress, role, categoryLabel) {
  requireAddress(assetAddress, "asset-address");
  if (!role) {
    throw new Error("A role name is required.");
  }
  const account = signer();
  const asset = await contractAt("choreography", "ChoreographyMutableAsset", assetAddress, account);
  const creatorPolicy = await contractAt("choreography", "CreatorSmartPolicy", await asset.creatorSmartPolicy(), account);
  const costs = [await send("setRoleCategory", creatorPolicy.setRoleCategory(role, toCategory(categoryLabel)))];
  console.log(`Role "${role}" now requires category: ${categoryLabel}`);
  return { costs, totalCost: reportTotalCost(costs) };
}

// Holder operation: allowlist the participant in the Holder policy, then bind
// it to the role. The zero address clears the role.
export async function assignParticipant(assetAddress, role, participantAddress) {
  requireAddress(assetAddress, "asset-address");
  if (!role) {
    throw new Error("A role name is required.");
  }
  const participant = participantAddress === "0x0" ? ZeroAddress : requireAddress(participantAddress, "participant-address");
  const account = signer();
  const asset = await contractAt("choreography", "ChoreographyMutableAsset", assetAddress, account);
  const costs = [];
  let revokeOnFailure = null;
  if (participant !== ZeroAddress) {
    const holderPolicy = await contractAt("choreography", "HolderSmartPolicy", await asset.holderSmartPolicy(), account);
    const holder = await account.getAddress();
    if (!(await holderPolicy.allowedParticipants(assetAddress, holder, participant))) {
      costs.push(await send("setAllowedParticipant", holderPolicy.setAllowedParticipant(assetAddress, participant, true)));
      revokeOnFailure = () => holderPolicy.setAllowedParticipant(assetAddress, participant, false);
    }
  }
  try {
    // Simulate first: a rejected setRoles then sends no transaction.
    await asset.setRoles.staticCall([role], [participant]);
    costs.push(await send("setRoles", asset.setRoles([role], [participant])));
  } catch (error) {
    // Do not leave a rejected participant in the holder allowlist.
    if (revokeOnFailure) {
      costs.push(await send("revert setAllowedParticipant", revokeOnFailure()));
    }
    throw error;
  }
  console.log(`Role "${role}" assigned to: ${participant}`);
  return { costs, totalCost: reportTotalCost(costs) };
}

const COMMANDS = {
  deploy: () => deployParticipants(),
  mint: (args) => mintParticipant(args[0]),
  "role-category": (args) => setRoleCategory(args[0], args[1], args[2]),
  assign: (args) => assignParticipant(args[0], args[1], args[2])
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const [command, ...args] = process.argv.slice(2);
  const run = COMMANDS[command];
  (run ? run(args) : Promise.reject(new Error(USAGE))).catch((error) => {
    console.error(error.shortMessage || error.message);
    process.exitCode = 1;
  });
}
