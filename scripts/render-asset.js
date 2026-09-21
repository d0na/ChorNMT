import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAssetToBpmn } from "./render-local-support.js";

const __filename = fileURLToPath(import.meta.url);

export async function renderAsset(assetAddress, renderConfigPath) {
  if (!assetAddress || !renderConfigPath) {
    throw new Error("Usage: npm run render:asset -- <asset-address> <delta-or-render-config.json>");
  }
  const resolvedConfigPath = path.resolve(process.cwd(), renderConfigPath);
  const config = JSON.parse(await fs.readFile(resolvedConfigPath, "utf8"));
  const render = config.render || config;
  const artifacts = await renderAssetToBpmn({ assetAddress, ...render });
  return { resolvedConfigPath, ...artifacts };
}

async function main() {
  const result = await renderAsset(process.argv[2], process.argv[3]);
  console.log(`Rendered asset using: ${result.resolvedConfigPath}`);
  console.log(`Generated raw JSON: ${result.rawJsonPath}`);
  console.log(`Generated normalized JSON: ${result.normalizedPath}`);
  console.log(`Generated BPMN: ${result.xmlPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
