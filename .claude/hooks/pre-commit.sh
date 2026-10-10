#!/usr/bin/env bash
# PreToolUse Bash: before a git commit, check that the UML SVGs match their sources, that the
# contracts keep the design invariants, when contracts changed that they compile within the
# size limits, and when contracts, scripts, or the docs quoting gas changed that the policy
# tests and the lifecycle evaluation pass and the quoted gas figures match them. Denies the
# commit otherwise.
. "$(dirname "$0")/lib.sh"
command="$(jq -r '.tool_input.command // empty')"
printf '%s' "$command" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit([[:space:]]|$)' || exit 0
use_project_node
cd "$ROOT" || exit 0
checks=("npm run check:uml" "npm run check:invariants")
if [ -n "$(git status --porcelain -- contracts)" ]; then
  checks+=("npm run compile" "npm run check:size")
fi
if [ -n "$(git status --porcelain -- contracts scripts bpmn-builder-js/scripts docs/choreography-policies.md docs/future-improvements.md)" ]; then
  checks+=("npm run test:policies" "npm run evaluate:policies" "npm run check:gas")
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
