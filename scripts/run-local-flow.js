import { fileURLToPath } from "node:url";
import { populateContract, resolveDataset } from "./populate-local.js";
import { renderAssetToBpmn } from "./render-local-support.js";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const DEFAULT_DATASET = process.env.CHOREOGRAPHY_DATASET || "pizza-delivery";
const DATASET_MANIFESTS = {
  "parallel-gateway-example": {
    choreographyId: "ParallelGatewayExample",
    choreographyName: "Parallel Gateway Example",
    definitionsId: "ParallelGatewayExample_definitions",
    targetNamespace: "http://example.com/parallel-gateway-example",
    outputBaseName: "parallel-gateway-example-from-contract"
  },
  "pizza-delivery": {
    choreographyId: "PizzaDelivery",
    choreographyName: "Pizza Delivery",
    definitionsId: "PizzaDelivery_definitions",
    targetNamespace: "http://example.com/pizza-delivery",
    outputBaseName: "pizza-delivery-from-contract"
  }
};

function resolveDatasetManifest(datasetName) {
  const manifest = DATASET_MANIFESTS[datasetName];

  if (!manifest) {
    throw new Error(`Unknown choreography dataset "${datasetName}". Available datasets: ${Object.keys(DATASET_MANIFESTS).join(", ")}`);
  }

  return manifest;
}

async function assertContractExportMatchesDataset(rawJsonPath, datasetName) {
  const fs = await import("node:fs/promises");
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

async function main() {
  const contractAddress = process.argv[2] || DEFAULT_CONTRACT_ADDRESS;
  const datasetName = process.argv[3] || DEFAULT_DATASET;

  if (!contractAddress) {
    throw new Error(
      "An asset address is required. Usage: node scripts/run-local-flow.js <asset-address> [dataset]"
    );
  }

  resolveDatasetManifest(datasetName);
  const datasetManifest = resolveDatasetManifest(datasetName);

  await populateContract(contractAddress, datasetName);
  const { rawJsonPath, normalizedPath, xmlPath } = await renderAssetToBpmn({
    assetAddress: contractAddress,
    choreographyId: datasetManifest.choreographyId,
    choreographyName: datasetManifest.choreographyName,
    definitionsId: datasetManifest.definitionsId,
    targetNamespace: datasetManifest.targetNamespace,
    outputBaseName: datasetManifest.outputBaseName
  });
  await assertContractExportMatchesDataset(rawJsonPath, datasetName);

  console.log(`Flow completed for asset: ${contractAddress}`);
  console.log(`Dataset: ${datasetName}`);
  console.log(`Generated raw JSON: ${rawJsonPath}`);
  console.log(`Generated normalized JSON: ${normalizedPath}`);
  console.log(`Generated XML: ${xmlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
