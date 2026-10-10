#!/usr/bin/env bash
# PreToolUse Edit|Write: the sources of truth change only with the user's approval.
# Requirements and decisions are the user's calls; reference models and deltas are evaluation inputs.
. "$(dirname "$0")/lib.sh"
path="$(edited_path)"
reason=""
case "$path" in
  docs/requirements.md) reason="it holds the claims and non-goals the user decided" ;;
  docs/decisions.md) reason="it holds the design decisions and the open questions only the user settles" ;;
  references/*) reason="it is a source model or contract the evaluation reads" ;;
  scripts/data/*) reason="it is a versioned delta the evaluation reads" ;;
esac
if [ -n "$reason" ]; then
  jq -n --arg r "Editing $path needs the user's approval: $reason." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
fi
exit 0
