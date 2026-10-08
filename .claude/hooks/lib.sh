#!/usr/bin/env bash
# Shared helpers for the ChorNMT Claude Code hooks.

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Hardhat 3 needs Node 22 (.nvmrc); the machine default may be older.
use_project_node() {
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1
    nvm use "$(cat "$ROOT/.nvmrc")" >/dev/null 2>&1
  fi
}

# Path of the edited file relative to the repository root, from the hook input on stdin.
edited_path() {
  local input file
  input="$(cat)"
  file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
  case "$file" in
    "$ROOT"/*) printf '%s' "${file#"$ROOT"/}" ;;
    *) printf '%s' "$file" ;;
  esac
}
