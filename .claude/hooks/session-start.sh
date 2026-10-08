#!/usr/bin/env bash
# SessionStart: tell Claude which Node the hooks and npm scripts will get, and how to fix it.
. "$(dirname "$0")/lib.sh"
use_project_node
required="$(cat "$ROOT/.nvmrc")"
current="$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')"
if [ "$current" = "$required" ]; then
  message="Node $required is available through nvm. Run npm and hardhat commands after \`source ~/.nvm/nvm.sh && nvm use\`."
else
  message="WARNING: the project needs Node $required (.nvmrc) but the shell has Node ${current:-none}. Run \`source ~/.nvm/nvm.sh && nvm use\` before npm or hardhat commands (Hardhat 3 fails on older Node)."
fi
jq -n --arg m "$message" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $m}}'
