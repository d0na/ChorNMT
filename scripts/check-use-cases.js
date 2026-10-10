// npm run check:use-cases: checks the hand-written use case diagrams (docs/uml/use-case-*.puml)
// against the trust tables of docs/choreography-policies.md, the cases of scripts/test-policies.js,
// and the experiment evidence (evaluation/evidence/experiment.json), both ways (decision D19).
//
// Annotations, as PlantUML comments on the lines before an element:
//   ' accounts: <experiment account>, ...          before an actor
//   ' trust: <table>:<function>, ...               before a use case
//   ' evidence: <transaction or read key>, ...     or "test-only" (then the use case is <<test only>>)
//   ' test: <test-policies case label>; ...        required unless the evidence is only reads
//
// Checks: an actor is a trust-table column and its accounts exist; a use case names existing rows,
// existing evidence whose rows are its own, and existing tests; an allowed transaction is sent by
// an account of an actor of the use case; every row that grants an action appears in a use case,
// except the policy replacements, which are never made (open question in docs/decisions.md); and
// every transaction the policies decide appears in a use case.
import fs from "node:fs/promises";
import path from "node:path";
import { loadTrustTables, trustRow } from "./experiment/trust-tables.js";

const root = process.cwd();
const DIAGRAMS = ["use-case-choreography.puml", "use-case-participant-license.puml"];
// The Master and Creator policies are never replaced: their setters stay, but no use case shows them.
const NEVER_EXERCISED = ["setMasterSmartPolicy", "setCreatorSmartPolicy"];
const READER = "eth_call";

const list = (text, separator) => text.split(separator).map((item) => item.trim()).filter(Boolean);

function parse(text) {
  const actors = {};
  const useCases = {};
  const links = [];
  let notes = {};
  for (const line of text.split("\n").map((item) => item.trim())) {
    const annotation = line.match(/^' (accounts|trust|evidence|test): (.*)$/);
    if (annotation) {
      notes[annotation[1]] = annotation[2];
      continue;
    }
    const actor = line.match(/^actor "([^"]+)" as (\w+)/);
    if (actor) {
      actors[actor[2]] = { name: actor[1].split("\\n")[0], accounts: list(notes.accounts || "", ",") };
      notes = {};
      continue;
    }
    const useCase = line.match(/^usecase "([^"]+)" as (\w+)(.*)$/);
    if (useCase) {
      useCases[useCase[2]] = {
        title: useCase[1].replace(/\\n/g, " "),
        testOnly: useCase[3].includes("<<test only>>"),
        trust: list(notes.trust || "", ","),
        evidence: list(notes.evidence || "", ","),
        tests: list(notes.test || "", ";")
      };
      notes = {};
      continue;
    }
    const link = line.match(/^(\w+) --> (\w+)/);
    if (link) links.push([link[1], link[2]]);
  }
  return { actors, useCases, links };
}

async function main() {
  const tables = await loadTrustTables();
  const evidence = JSON.parse(await fs.readFile(path.join(root, "evaluation", "evidence", "experiment.json"), "utf8"));
  const tests = await fs.readFile(path.join(root, "scripts", "test-policies.js"), "utf8");
  const transactions = new Map(evidence.transactions.map((record) => [record.key, record]));
  const reads = new Set(evidence.phases.flatMap((phase) => (phase.reads || []).map((read) => read.key)));
  const accounts = new Set([...evidence.accounts.map((account) => account.name), READER]);
  const columns = new Set(Object.values(tables).flatMap((table) => table.columns));
  const errors = [];
  const coveredRows = new Set();
  const coveredTransactions = new Set();

  for (const diagram of DIAGRAMS) {
    const { actors, useCases, links } = parse(await fs.readFile(path.join(root, "docs", "uml", diagram), "utf8"));
    const fail = (message) => errors.push(`${diagram}: ${message}`);
    for (const [alias, actor] of Object.entries(actors)) {
      if (!columns.has(actor.name)) fail(`actor ${alias} "${actor.name}" is not a column of a trust table (${[...columns].join(", ")})`);
      if (actor.accounts.length === 0) fail(`actor ${alias} has no "' accounts:" annotation`);
      for (const account of actor.accounts) if (!accounts.has(account)) fail(`actor ${alias}: no experiment account is named ${account}`);
    }
    for (const [alias, useCase] of Object.entries(useCases)) {
      const where = `use case ${alias} "${useCase.title}"`;
      if (useCase.trust.length === 0) fail(`${where} has no "' trust:" annotation`);
      const rows = [];
      for (const key of useCase.trust) {
        try {
          const row = trustRow(tables, key);
          rows.push(`${row.table}|${row.action}`);
          coveredRows.add(`${row.table}|${row.action}`);
        } catch (error) {
          fail(`${where}: ${error.message}`);
        }
      }
      const testOnly = useCase.evidence.length === 1 && useCase.evidence[0] === "test-only";
      if (testOnly !== useCase.testOnly) fail(`${where}: "evidence: test-only" and the <<test only>> stereotype go together`);
      if (useCase.evidence.length === 0) fail(`${where} has no "' evidence:" annotation`);
      const evidenceKeys = testOnly ? [] : useCase.evidence;
      for (const key of evidenceKeys) {
        const record = transactions.get(key);
        if (!record && !reads.has(key)) {
          fail(`${where}: ${key} is neither a transaction nor a read of the evidence`);
          continue;
        }
        if (record) {
          coveredTransactions.add(key);
          if (!record.trust || !rows.includes(`${record.trust.table}|${record.trust.action}`)) {
            fail(`${where}: ${key} is decided by "${record.trust?.action ?? "no row"}", not by a row of this use case`);
          }
        }
      }
      const onlyReads = evidenceKeys.length > 0 && evidenceKeys.every((key) => reads.has(key));
      if (useCase.tests.length === 0 && !onlyReads) fail(`${where} has no "' test:" annotation`);
      for (const label of useCase.tests) if (!tests.includes(`"${label}"`)) fail(`${where}: scripts/test-policies.js has no case "${label}"`);
      // An allowed transaction is sent by an account of an actor of the use case.
      const playedBy = new Set(links.filter(([, target]) => target === alias).flatMap(([source]) => actors[source]?.accounts || []));
      if (playedBy.size === 0) continue;
      for (const key of evidenceKeys) {
        const sender = transactions.get(key)?.outcome === "allowed" ? transactions.get(key).from.account : reads.has(key) ? READER : null;
        if (sender && !playedBy.has(sender)) fail(`${where}: ${key} is sent by ${sender}, not by an actor of the use case (${[...playedBy].join(", ")})`);
      }
    }
  }

  // Every row that grants an action appears in a use case, except the never-exercised setters.
  for (const [table, { rows }] of Object.entries(tables)) {
    for (const row of rows) {
      const grants = row.cells.some((cell) => /^\*{0,2}yes/i.test(cell));
      const fn = row.action.match(/`([^`]+)`/)?.[1];
      if (!grants || NEVER_EXERCISED.includes(fn) || coveredRows.has(`${table}|${row.action}`)) continue;
      errors.push(`${table} trust table: the row "${row.action}" appears in no use case diagram`);
    }
  }
  // Every transaction a policy decides appears in a use case.
  for (const record of evidence.transactions) {
    if (record.trust && !coveredTransactions.has(record.key)) errors.push(`evidence: ${record.key} (${record.trust.action}) appears in no use case`);
  }

  if (errors.length > 0) {
    console.error(`Use case diagrams disagree with the trust tables, the tests, or the evidence:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Use case diagrams agree with the trust tables, the tests, and the evidence (${DIAGRAMS.length} diagrams, ${coveredTransactions.size} transactions).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
