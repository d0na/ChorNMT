#!/usr/bin/env bash
# PreToolUse Bash: before a git commit, check that the UML SVGs match their sources, that the use
# case diagrams agree with the trust tables, tests, and evidence, that the experiment protocol
# matches the evidence, that the contracts keep the design invariants, when contracts changed that
# they compile within the size limits, when anything the experiment runs or reads changed that a
# new run reproduces the versioned evidence (check:evidence, which also runs test:policies), and
# that the gas figures quoted in the docs match the evidence. Denies the commit otherwise.
. "$(dirname "$0")/lib.sh"
command="$(jq -r '.tool_input.command // empty')"
printf '%s' "$command" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit([[:space:]]|$)' || exit 0
use_project_node
cd "$ROOT" || exit 0
checks=("npm run check:uml" "npm run check:use-cases" "npm run check:protocol" "npm run check:invariants")
if [ -n "$(git status --porcelain -- contracts)" ]; then
  checks+=("npm run compile" "npm run check:size")
fi
if [ -n "$(git status --porcelain -- contracts scripts bpmn-builder-js/scripts bpmn-builder-js/src references evaluation/gnuplot evaluation/evidence package.json package-lock.json)" ]; then
  checks+=("npm run check:evidence")
fi
if [ -n "$(git status --porcelain -- contracts scripts bpmn-builder-js evaluation/evidence docs/choreography-policies.md docs/decisions.md docs/future-improvements.md)" ]; then
  checks+=("npm run check:gas")
fi
for check in "${checks[@]}"; do
  if ! output="$($check 2>&1)"; then
    jq -n --arg r "Commit blocked: \`$check\` failed:
$(printf '%s' "$output" | tail -20)" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    exit 0
  fi
done
exit 0
