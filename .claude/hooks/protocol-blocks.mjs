// Reads a PreToolUse Edit|Write|MultiEdit input on stdin for docs/experiment.md and prints the
// placeholders whose content the edit would change: the generated blocks
// (<!-- evidence:<name> --> ... <!-- /evidence:<name> -->) and the inline outcomes
// (<!-- outcome:<key> -->...<!-- /outcome -->), which only scripts/experiment/protocol.js writes
// (decision D21). Prints nothing when the edit touches the narrative only.
import fs from "node:fs";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const tool = input.tool_input ?? {};
const current = fs.existsSync(tool.file_path) ? fs.readFileSync(tool.file_path, "utf8") : "";

function apply(text, { old_string: from, new_string: to, replace_all: all }) {
  if (from === undefined || !text.includes(from)) return text;
  return all ? text.split(from).join(to) : text.replace(from, () => to);
}

let next = current;
if (typeof tool.content === "string") next = tool.content;
else for (const edit of tool.edits ?? [tool]) next = apply(next, edit);

const PLACEHOLDER = /<!-- (evidence:([\w:.-]+)) -->[\s\S]*?<!-- \/evidence:\2 -->|<!-- (outcome:[\w.-]+) -->[\s\S]*?<!-- \/outcome -->/g;
// Placeholder name -> its occurrences, in order.
function placeholders(text) {
  const found = new Map();
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? match[3];
    found.set(name, [...(found.get(name) ?? []), match[0]]);
  }
  return found;
}

const before = placeholders(current);
const after = placeholders(next);
const changed = new Set();
for (const name of new Set([...before.keys(), ...after.keys()])) {
  if (JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))) changed.add(name);
}
if (changed.size > 0) console.log([...changed].join(", "));
