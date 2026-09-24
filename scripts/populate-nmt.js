import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { populateDataset } from "./populate-local.js";

const __filename = fileURLToPath(import.meta.url);

export async function populateNmtAsset(assetAddress, datasetPath) {
  if (!assetAddress || !datasetPath) {
    throw new Error("Usage: node scripts/populate-nmt.js <asset-address> <input.nmt.json>");
  }
  const resolvedDatasetPath = path.resolve(process.cwd(), datasetPath);
  const dataset = JSON.parse(await fs.readFile(resolvedDatasetPath, "utf8"));
  return populateDataset(assetAddress, dataset, path.basename(resolvedDatasetPath));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  populateNmtAsset(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
