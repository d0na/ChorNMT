import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml } from "../bpmn-builder-js/src/index.js";
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
    outputPath: "../input/pizza-delivery-from-contract.generated.json"
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function generateXmlFromJson(jsonPath) {
  const input = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const xml = await generateBpmnXml(input);
  const outputPath = jsonPath.replace(/\.json$/, ".bpmn.xml");

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
  const { outputPath: jsonPath } = await exportContractToJson(manifestPath);
  const xmlPath = await generateXmlFromJson(jsonPath);

  console.log(`Flow completed for contract: ${contractAddress}`);
  console.log(`Generated JSON: ${jsonPath}`);
  console.log(`Generated XML: ${xmlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
