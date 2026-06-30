import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml, normalizeInput } from "../bpmn-builder-js/src/index.js";
import { exportContractToJson } from "../bpmn-builder-js/scripts/web3.js";
import { populateContract } from "./populate-local.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

function projectPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

async function writeManifest(contractAddress) {
  const manifestPath = projectPath(
    "bpmn-builder-js",
    "example",
    "contract",
    "pizza-delivery-contract-manifest.json"
  );
  const manifest = {
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    contractAddress,
    choreographyId: "PizzaDelivery",
    choreographyName: "Pizza Delivery",
    definitions: {
      id: "PizzaDelivery_definitions",
      targetNamespace: "http://example.com/pizza-delivery"
    },
    outputPath: "../input/pizza-delivery-from-contract.raw.generated.json"
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

function normalizedJsonPath(rawJsonPath) {
  return rawJsonPath.replace(/\.raw\.generated\.json$/, ".normalized.generated.json");
}

async function writeNormalizedJson(rawJsonPath) {
  const input = JSON.parse(await fs.readFile(rawJsonPath, "utf8"));
  const normalized = normalizeInput(input);
  const outputPath = normalizedJsonPath(rawJsonPath);

  await fs.writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return outputPath;
}

async function generateXmlFromJson(normalizedJsonPathValue) {
  const input = JSON.parse(await fs.readFile(normalizedJsonPathValue, "utf8"));
  const xml = await generateBpmnXml(input);
  const outputPath = projectPath(
    "bpmn-builder-js",
    "example",
    "output",
    path.basename(normalizedJsonPathValue).replace(/\.normalized\.generated\.json$/, ".generated.bpmn.xml")
  );

  await fs.writeFile(outputPath, xml, "utf8");
  return outputPath;
}

async function main() {
  const contractAddress = process.argv[2] || DEFAULT_CONTRACT_ADDRESS;

  if (!contractAddress) {
    throw new Error(
      "A contract address is required. Usage: npm run flow:local -- <contract-address>"
    );
  }

  await populateContract(contractAddress);
  const manifestPath = await writeManifest(contractAddress);
  const { outputPath: rawJsonPath } = await exportContractToJson(manifestPath);
  const normalizedPath = await writeNormalizedJson(rawJsonPath);
  const xmlPath = await generateXmlFromJson(normalizedPath);

  console.log(`Flow completed for contract: ${contractAddress}`);
  console.log(`Generated raw JSON: ${rawJsonPath}`);
  console.log(`Generated normalized JSON: ${normalizedPath}`);
  console.log(`Generated XML: ${xmlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
