import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Renders the UML diagrams in docs/uml/*.puml to SVG next to their source, with PlantUML.
// `--check` renders nothing: it fails when an SVG is missing or was generated from another
// version of its source, so it runs without Java (e.g. in CI).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UML_DIR = path.join(ROOT, "docs", "uml");
const SHARED_SOURCES = ["style.iuml"];

const PLANTUML_VERSION = "1.2024.7";
const PLANTUML_SHA256 = "e34c12bbe9944f1f338ca3d88c9b116b86300cc8e90b35c4086b825b5ae96d24";
const PLANTUML_URL = `https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar`;
const PLANTUML_JAR = path.join(ROOT, ".cache", "plantuml", `plantuml-${PLANTUML_VERSION}.jar`);

const HASH_MARKER = "chornmt-uml-source-sha256";
const run = promisify(execFile);

async function diagramSources() {
  const files = await fs.readdir(UML_DIR);
  return files.filter((file) => file.endsWith(".puml")).sort();
}

// The hash covers the diagram and the shared style it includes.
async function sourceHash(file) {
  const hash = crypto.createHash("sha256");
  for (const name of [file, ...SHARED_SOURCES]) {
    hash.update(name);
    hash.update(await fs.readFile(path.join(UML_DIR, name)));
  }
  return hash.digest("hex");
}

function svgPath(file) {
  return path.join(UML_DIR, file.replace(/\.puml$/, ".svg"));
}

async function sha256File(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function ensurePlantUml() {
  try {
    if (await sha256File(PLANTUML_JAR) === PLANTUML_SHA256) {
      return;
    }
  } catch {
    // Not downloaded yet.
  }
  console.log(`Downloading PlantUML ${PLANTUML_VERSION}...`);
  const response = await fetch(PLANTUML_URL);
  if (!response.ok) {
    throw new Error(`PlantUML download failed: ${response.status} ${response.statusText}`);
  }
  const jar = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash("sha256").update(jar).digest("hex");
  if (digest !== PLANTUML_SHA256) {
    throw new Error(`PlantUML checksum mismatch: expected ${PLANTUML_SHA256}, got ${digest}`);
  }
  await fs.mkdir(path.dirname(PLANTUML_JAR), { recursive: true });
  await fs.writeFile(PLANTUML_JAR, jar);
}

async function render(files) {
  await ensurePlantUml();
  await run("java", ["-Djava.awt.headless=true", "-jar", PLANTUML_JAR, "-tsvg", "-charset", "UTF-8", ...files], {
    cwd: UML_DIR
  });
  for (const file of files) {
    const target = svgPath(file);
    const svg = await fs.readFile(target, "utf8");
    const marked = svg.replace(/<!-- chornmt-uml-source-sha256: [0-9a-f]+ -->/, "")
      .replace(/(<svg[^>]*>)/, `$1<!-- ${HASH_MARKER}: ${await sourceHash(file)} -->`);
    await fs.writeFile(target, marked);
    console.log(`Rendered ${path.relative(ROOT, target)}`);
  }
}

async function check(files) {
  const stale = [];
  for (const file of files) {
    let svg;
    try {
      svg = await fs.readFile(svgPath(file), "utf8");
    } catch {
      stale.push(`${file}: SVG missing`);
      continue;
    }
    const recorded = svg.match(new RegExp(`${HASH_MARKER}: ([0-9a-f]+)`))?.[1];
    if (recorded !== await sourceHash(file)) {
      stale.push(`${file}: SVG out of date`);
    }
  }
  if (stale.length > 0) {
    console.error(`UML diagrams need \`npm run docs:uml\`:\n- ${stale.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`UML diagrams up to date (${files.length}).`);
}

const files = await diagramSources();
if (process.argv.includes("--check")) {
  await check(files);
} else {
  await render(files);
}
