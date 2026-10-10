// The two trust tables of docs/choreography-policies.md ("Who can do what" and "Role licenses"),
// read as data: the experiment run points every transaction to its row, and check:use-cases
// checks the use case diagrams against them.
import fs from "node:fs/promises";
import path from "node:path";

const TABLES = [["choreography", "## Who can do what"], ["licenses", "## Role licenses"]];

// { table: { columns: [actor names], rows: [{ action, cells }] } }; a column is named by its
// header up to the first parenthesis ("Authority (issuer)" is "Authority").
export async function loadTrustTables(file = path.join(process.cwd(), "docs", "choreography-policies.md")) {
  const text = await fs.readFile(file, "utf8");
  const tables = {};
  for (const [table, heading] of TABLES) {
    const lines = text.slice(text.indexOf(heading)).split("\n");
    const start = lines.findIndex((line) => line.startsWith("|"));
    const end = lines.findIndex((line, index) => index > start && !line.startsWith("|"));
    const cells = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim());
    tables[table] = {
      columns: cells(lines[start]).slice(1).map((header) => header.replace(/\s*\(.*$/, "")),
      rows: lines.slice(start + 2, end).map((line) => ({ action: cells(line)[0], cells: cells(line).slice(1) }))
    };
  }
  return tables;
}

// The row a "<table>:<function>" key points to: the first row naming `function`.
export function trustRow(tables, key) {
  if (!key) return null;
  const [table, fn] = key.split(":");
  const row = tables[table]?.rows.find((candidate) => candidate.action.includes(`\`${fn}\``));
  if (!row) throw new Error(`${key}: no row of the ${table} trust table in docs/choreography-policies.md names ${fn}`);
  return { table, action: row.action };
}
