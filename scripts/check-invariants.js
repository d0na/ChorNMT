import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");

// Policies and the attribute manager they read through: no mutable state, no setters (D5).
const isPolicy = (file) => /(Policy|AM)\.sol$/.test(file) && !/^I[A-Z]/.test(path.basename(file));

// Design decisions of docs/decisions.md that a grep on the sources can check.
const RULES = [
  {
    id: "D12",
    description: "mint with _mint, never _safeMint",
    applies: () => true,
    check: (source) => matches(source, /\b_safeMint\b/g, "_safeMint"),
  },
  {
    id: "D4",
    description: "no version registry",
    applies: () => true,
    check: (source) => matches(source, /\b(mintVersion|predecessorOf|versionOf)\b/g, "version registry"),
  },
  {
    id: "D13",
    description: "the model is fixed at deploy: no model passed to mint",
    applies: () => true,
    check: (source) => matches(source, /\b(mintWithInitialModel|initializeChoreography)\b/g, "model passed after deploy"),
  },
  {
    id: "D13",
    description: "the model of a type is immutable: ChoreographyNMT state is constant or immutable",
    applies: (file) => path.basename(file) === "ChoreographyNMT.sol",
    check: mutableStateVariables,
  },
  {
    id: "D2",
    description: "nodes and roles are never deleted, name lists never cleared",
    applies: (file) => path.basename(file) === "ChoreographyMutableAsset.sol",
    check: (source) => [
      ...matches(source, /\.pop\(\)/g, ".pop()"),
      ...matches(source, /\bdelete\s+descriptor\b/g, "delete on the descriptor"),
    ],
  },
  {
    id: "D5",
    description: "policy rules are literals: no setters",
    applies: isPolicy,
    check: (source) => matches(source, /\bfunction\s+set[A-Z]\w*/g, "setter"),
  },
  {
    id: "D5",
    description: "policy rules are literals: state is constant or immutable",
    applies: isPolicy,
    check: mutableStateVariables,
  },
];

async function findSources(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findSources(entryPath);
    }
    return entry.name.endsWith(".sol") ? [entryPath] : [];
  }));
  return files.flat();
}

// Blank out comments and string literals, keeping newlines so line numbers stay valid.
function stripCommentsAndStrings(source) {
  const blank = (text) => text.replace(/[^\n]/g, " ");
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, blank);
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function matches(source, pattern, label) {
  return [...source.matchAll(pattern)].map((match) => ({ line: lineOf(source, match.index), text: label }));
}

// Statements at contract level (brace depth 1) that declare a state variable without
// `constant` or `immutable`.
function mutableStateVariables(source) {
  const violations = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{") {
      depth++;
      start = i + 1;
    } else if (char === "}") {
      depth--;
      start = i + 1;
    } else if (char === ";") {
      const statement = source.slice(start, i).trim();
      if (depth === 1 && statement && !/^(function|event|error|using|modifier)\b/.test(statement)
        && !/\b(constant|immutable)\b/.test(statement)) {
        const offset = start + source.slice(start, i).search(/\S/);
        violations.push({ line: lineOf(source, offset), text: `mutable state \`${statement.replace(/\s+/g, " ")}\`` });
      }
      start = i + 1;
    }
  }
  return violations;
}

async function main() {
  const files = (await findSources(CONTRACTS_DIR)).sort();
  const violations = [];
  for (const file of files) {
    const source = stripCommentsAndStrings(await fs.readFile(file, "utf8"));
    const relative = path.relative(path.join(__dirname, ".."), file);
    for (const rule of RULES.filter((candidate) => candidate.applies(file))) {
      for (const violation of rule.check(source)) {
        violations.push(`${relative}:${violation.line}  ${rule.id} (${rule.description}): ${violation.text}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Design invariants violated (see docs/decisions.md):\n${violations.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Design invariants hold in ${files.length} contracts (${RULES.map((rule) => rule.id).filter((id, i, ids) => ids.indexOf(id) === i).join(", ")}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
