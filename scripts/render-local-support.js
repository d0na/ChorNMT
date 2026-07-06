import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBpmnXml, normalizeInput } from "../bpmn-builder-js/src/index.js";
import { exportContractToJson } from "../bpmn-builder-js/scripts/web3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function projectPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

export async function writeManifest({
  assetAddress,
  choreographyId,
  choreographyName,
  definitionsId,
  targetNamespace,
  outputBaseName
}) {
  const manifestPath = projectPath(
    "bpmn-builder-js",
    "example",
    "contract",
    `${outputBaseName}-contract-manifest.generated.json`
  );
  const manifest = {
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    contractAddress: assetAddress,
    choreographyId,
    choreographyName,
    definitions: {
      id: definitionsId,
      targetNamespace
    },
    outputPath: `../input/${outputBaseName}.raw.generated.json`
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

function normalizedJsonPath(rawJsonPath) {
  return rawJsonPath.replace(/\.raw\.generated\.json$/, ".normalized.generated.json");
}

export async function writeNormalizedJson(rawJsonPath) {
  const input = JSON.parse(await fs.readFile(rawJsonPath, "utf8"));
  const normalized = normalizeInput(input);
  const outputPath = normalizedJsonPath(rawJsonPath);

  await fs.writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function generateXmlFromJson(normalizedJsonPathValue) {
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

export async function renderAssetToBpmn({
  assetAddress,
  choreographyId,
  choreographyName,
  definitionsId,
  targetNamespace,
  outputBaseName
}) {
  const manifestPath = await writeManifest({
    assetAddress,
    choreographyId,
    choreographyName,
    definitionsId,
    targetNamespace,
    outputBaseName
  });
  const { outputPath: rawJsonPath } = await exportContractToJson(manifestPath);
  const normalizedPath = await writeNormalizedJson(rawJsonPath);
  const xmlPath = await generateXmlFromJson(normalizedPath);

  return { manifestPath, rawJsonPath, normalizedPath, xmlPath };
}
