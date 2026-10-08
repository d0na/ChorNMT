#!/usr/bin/env bash
# PostToolUse Edit|Write: keep derived artifacts and checks in step with the edited source.
#   docs/uml/*.puml, docs/uml/*.iuml -> npm run docs:uml
#   contracts/**/*.sol               -> npm run compile && npm run check:size
. "$(dirname "$0")/lib.sh"
path="$(edited_path)"
case "$path" in
  docs/uml/*.puml|docs/uml/*.iuml) commands=("npm run docs:uml") ;;
  contracts/*.sol) commands=("npm run compile" "npm run check:size") ;;
  *) exit 0 ;;
esac
use_project_node
cd "$ROOT" || exit 0
for command in "${commands[@]}"; do
  if ! output="$($command 2>&1)"; then
    jq -n --arg r "After editing $path, \`$command\` failed:
$(printf '%s' "$output" | tail -25)" '{decision: "block", reason: $r}'
    exit 0
  fi
done
exit 0
