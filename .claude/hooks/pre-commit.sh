#!/usr/bin/env bash
# PreToolUse Bash: before a git commit, check that the UML SVGs match their sources, that the
# contracts keep the design invariants and, when contracts changed, that they compile within
# the size limits. Denies the commit otherwise.
. "$(dirname "$0")/lib.sh"
command="$(jq -r '.tool_input.command // empty')"
printf '%s' "$command" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit([[:space:]]|$)' || exit 0
use_project_node
cd "$ROOT" || exit 0
checks=("npm run check:uml" "npm run check:invariants")
if [ -n "$(git status --porcelain -- contracts)" ]; then
  checks+=("npm run compile" "npm run check:size")
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
