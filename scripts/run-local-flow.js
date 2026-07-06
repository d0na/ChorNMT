import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml, normalizeInput } from "../bpmn-builder-js/src/index.js";
import { exportContractToJson } from "../bpmn-builder-js/scripts/web3.js";
import { populateContract, resolveDataset } from "./populate-local.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const DEFAULT_DATASET = process.env.CHOREOGRAPHY_DATASET || "pizza-delivery";
const DATASET_MANIFESTS = {
  "paper-example": {
    choreographyId: "PaperExample",
    choreographyName: "Paper Example",
    definitionsId: "PaperExample_definitions",
    targetNamespace: "http://example.com/paper-example",
    outputBaseName: "paper-example-from-contract"
  },
  "pizza-delivery": {
    choreographyId: "PizzaDelivery",
    choreographyName: "Pizza Delivery",
    definitionsId: "PizzaDelivery_definitions",
    targetNamespace: "http://example.com/pizza-delivery",
    outputBaseName: "pizza-delivery-from-contract"
  }
};

function projectPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

function resolveDatasetManifest(datasetName) {
  const manifest = DATASET_MANIFESTS[datasetName];

  if (!manifest) {
    throw new Error(`Unknown choreography dataset "${datasetName}". Available datasets: ${Object.keys(DATASET_MANIFESTS).join(", ")}`);
  }

  return manifest;
}

async function writeManifest(contractAddress, datasetName) {
  const datasetManifest = resolveDatasetManifest(datasetName);
  const manifestPath = projectPath(
    "bpmn-builder-js",
    "example",
    "contract",
    `${datasetName}-contract-manifest.generated.json`
  );
  const manifest = {
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    contractAddress,
    choreographyId: datasetManifest.choreographyId,
    choreographyName: datasetManifest.choreographyName,
    definitions: {
      id: datasetManifest.definitionsId,
      targetNamespace: datasetManifest.targetNamespace
    },
    outputPath: `../input/${datasetManifest.outputBaseName}.raw.generated.json`
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

async function assertContractExportMatchesDataset(rawJsonPath, datasetName) {
  const input = JSON.parse(await fs.readFile(rawJsonPath, "utf8"));
  const { dataset } = resolveDataset(datasetName);
  const expectedRoles = dataset.roles;
  const expectedNodes = dataset.nodes.map((node) => node.name);
  const actualRoles = input.contractExport?.roleNames || [];
  const actualNodes = input.contractExport?.nodeNames || [];
  const unexpectedRoles = actualRoles.filter((name) => !expectedRoles.includes(name));
  const unexpectedNodes = actualNodes.filter((name) => !expectedNodes.includes(name));
  const missingRoles = expectedRoles.filter((name) => !actualRoles.includes(name));
  const missingNodes = expectedNodes.filter((name) => !actualNodes.includes(name));

  if (
    unexpectedRoles.length > 0 ||
    unexpectedNodes.length > 0 ||
    missingRoles.length > 0 ||
    missingNodes.length > 0
  ) {
    throw new Error(
      [
        `Contract data does not match dataset "${datasetName}".`,
        "Deploy a fresh contract before running the flow with a different dataset.",
        unexpectedRoles.length > 0 ? `Unexpected roles: ${unexpectedRoles.join(", ")}` : null,
        unexpectedNodes.length > 0 ? `Unexpected nodes: ${unexpectedNodes.join(", ")}` : null,
        missingRoles.length > 0 ? `Missing roles: ${missingRoles.join(", ")}` : null,
        missingNodes.length > 0 ? `Missing nodes: ${missingNodes.join(", ")}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
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
  const datasetName = process.argv[3] || DEFAULT_DATASET;

  if (!contractAddress) {
    throw new Error(
      "A contract address is required. Usage: npm run flow:local -- <contract-address> [dataset]"
    );
  }

  resolveDatasetManifest(datasetName);

  await populateContract(contractAddress, datasetName);
  const manifestPath = await writeManifest(contractAddress, datasetName);
  const { outputPath: rawJsonPath } = await exportContractToJson(manifestPath);
  await assertContractExportMatchesDataset(rawJsonPath, datasetName);
  const normalizedPath = await writeNormalizedJson(rawJsonPath);
  const xmlPath = await generateXmlFromJson(normalizedPath);

  console.log(`Flow completed for contract: ${contractAddress}`);
  console.log(`Dataset: ${datasetName}`);
  console.log(`Generated raw JSON: ${rawJsonPath}`);
  console.log(`Generated normalized JSON: ${normalizedPath}`);
  console.log(`Generated XML: ${xmlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
