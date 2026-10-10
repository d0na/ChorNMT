import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// EIP-170 (deployed code) and EIP-3860 (init code) limits, in bytes.
const RUNTIME_LIMIT = 24_576;
const INITCODE_LIMIT = 49_152;
// Warn when a contract has less headroom than this below the runtime limit.
const WARNING_MARGIN = Number(process.env.CONTRACT_SIZE_WARNING_MARGIN || 1_024);

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");

async function findArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findArtifacts(entryPath);
    }
    return entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json") ? [entryPath] : [];
  }));
  return files.flat();
}

function byteLength(hex) {
  return hex && hex !== "0x" ? (hex.length - 2) / 2 : 0;
}

async function main() {
  let artifactPaths;
  try {
    artifactPaths = await findArtifacts(ARTIFACTS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("No compiled artifacts found. Run `npm run compile` first.");
    }
    throw error;
  }

  const rows = [];
  for (const artifactPath of artifactPaths) {
    const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
    const runtime = byteLength(artifact.deployedBytecode);
    if (!artifact.contractName || runtime === 0) {
      continue; // interfaces and abstract contracts
    }
    const initcode = byteLength(artifact.bytecode);
    const headroom = RUNTIME_LIMIT - runtime;
    let status = "ok";
    if (runtime > RUNTIME_LIMIT || initcode > INITCODE_LIMIT) {
      status = "TOO LARGE";
    } else if (headroom < WARNING_MARGIN) {
      status = "near limit";
    }
    rows.push({
      contract: `${artifact.sourceName}:${artifact.contractName}`,
      runtimeBytes: runtime,
      headroomBytes: headroom,
      initcodeBytes: initcode,
      status
    });
  }

  rows.sort((a, b) => b.runtimeBytes - a.runtimeBytes);
  console.table(rows);

  const tooLarge = rows.filter((row) => row.status === "TOO LARGE");
  for (const row of rows.filter((entry) => entry.status === "near limit")) {
    console.warn(`warning: ${row.contract} is within ${row.headroomBytes} bytes of the ${RUNTIME_LIMIT}-byte limit`);
  }
  if (tooLarge.length > 0) {
    for (const row of tooLarge) {
      console.error(
        `error: ${row.contract} exceeds the size limit ` +
        `(runtime ${row.runtimeBytes}/${RUNTIME_LIMIT}, initcode ${row.initcodeBytes}/${INITCODE_LIMIT} bytes)`
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
