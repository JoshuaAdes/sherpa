#!/bin/bash
data=$(cat)
tool=$(echo "$data" | jq -r '.tool_name // ""')

case "$tool" in Edit|Write|Bash) ;; *) exit 0 ;; esac

detail=$(echo "$data" | jq -r '
  if .tool_name == "Edit" or .tool_name == "Write" then
    .tool_input.file_path // ""
  elif .tool_name == "Bash" then
    (.tool_input.command // "")[0:80] | gsub("\n"; " ")
  else ""
  end
')

mkdir -p ".sherpa"
echo "$(date -u +%Y-%m-%dT%H:%M:%S) $tool $detail" >> ".sherpa/session.log"
