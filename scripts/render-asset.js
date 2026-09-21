import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAssetToBpmn } from "./render-local-support.js";
import { writeMetrics } from "./metrics.js";

const __filename = fileURLToPath(import.meta.url);

function renderMetadata(config, resolvedConfigPath) {
  if (config.render) return config.render;
  if (Array.isArray(config.nodes)) {
    const baseName = path.basename(config.sourceBpmn || resolvedConfigPath).replace(/\.nmt\.json$/i, "").replace(/\.bpmn$/i, "");
    const id = config.id || "ImportedChoreography";
    return {
      choreographyId: id,
      choreographyName: config.name || baseName,
      definitionsId: `${id}_definitions`,
      targetNamespace: "http://example.com/chornmt/import",
      outputBaseName: `${baseName}-from-contract`
    };
  }
  return config;
}

export async function renderAsset(assetAddress, renderConfigPath) {
  if (!assetAddress || !renderConfigPath) {
    throw new Error("Usage: npm run render:asset -- <asset-address> <delta-or-nmt.json>");
  }
  const resolvedConfigPath = path.resolve(process.cwd(), renderConfigPath);
  const config = JSON.parse(await fs.readFile(resolvedConfigPath, "utf8"));
  const startedAt = performance.now();
  const artifacts = await renderAssetToBpmn({ assetAddress, ...renderMetadata(config, resolvedConfigPath) });
  const metricsPath = await writeMetrics("render-asset", { assetAddress, configPath: resolvedConfigPath, timingsMs: { total: performance.now() - startedAt }, artifacts });
  return { resolvedConfigPath, metricsPath, ...artifacts };
}

async function main() {
  const result = await renderAsset(process.argv[2], process.argv[3]);
  console.log(`Rendered asset using: ${result.resolvedConfigPath}`);
  console.log(`Generated raw JSON: ${result.rawJsonPath}`);
  console.log(`Generated normalized JSON: ${result.normalizedPath}`);
  console.log(`Generated BPMN: ${result.xmlPath}`);
  console.log(`Metrics: ${result.metricsPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
