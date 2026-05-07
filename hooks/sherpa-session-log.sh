#!/bin/bash
python3 -c '
import datetime
import json
import os
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = data.get("tool_name")
if tool not in {"Edit", "Write", "Bash"}:
    sys.exit(0)

tool_input = data.get("tool_input") or {}
if tool in {"Edit", "Write"}:
    detail = tool_input.get("file_path") or ""
else:
    detail = (tool_input.get("command") or "").replace("\r\n", " ").replace("\n", " ").replace("\r", " ")[:80]

os.makedirs(".sherpa", exist_ok=True)
timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
with open(os.path.join(".sherpa", "session.log"), "a", encoding="utf-8") as log:
    log.write(f"{timestamp} {tool} {detail}\n")
'
