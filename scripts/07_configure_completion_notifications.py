"""VERSION = "v1": Install completion notifiers, preserving and backing up user config."""

from datetime import datetime
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tomllib

VERSION = "v1"
root = Path(os.environ["LOCALAPPDATA"]) / "VSCodeAgentNotifications"
scripts = root / "scripts"
scripts.mkdir(parents=True, exist_ok=True)
for name in ["05_notify_completion.py", "06_show_completion_toast.ps1"]:
    source = Path(__file__).with_name(name)
    target = scripts / name
    if source.resolve() != target.resolve():
        shutil.copy2(source, target)
# Windows PowerShell 5.1 requires a BOM for non-ASCII script source.
toast = scripts / "06_show_completion_toast.ps1"
toast.write_text(toast.read_text(encoding="utf-8-sig"), encoding="utf-8-sig")
codex = Path.home() / ".codex/config.toml"
claude = Path.home() / ".claude/settings.json"
original = codex.read_text(encoding="utf-8")
config = tomllib.loads(original)
settings = json.loads(claude.read_text(encoding="utf-8"))
if settings.get("disableAllHooks"):
    raise RuntimeError("Claude disableAllHooks is enabled; resolve before installing")
notify = [sys.executable, str(scripts / "05_notify_completion.py"), "--source", "Codex"]
runtime_path = root / "runtime.json"
if config.get("notify") != notify:
    previous = config.get("notify", [])
    timestamp = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    backup = root / "backups" / timestamp
    backup.mkdir(parents=True, exist_ok=False)
    shutil.copy2(codex, backup / "config.toml")
    shutil.copy2(claude, backup / "settings.json")
    runtime_path.write_text(json.dumps({"version": VERSION, "previous_codex_notify": previous, "backup": str(backup)}, indent=2), encoding="utf-8")
    line = "notify = " + json.dumps(notify)
    if "notify" in config:
        updated, count = re.subn(r"(?m)^notify\s*=\s*\[[^\r\n]*\]\s*$", lambda match: line, original, count=1)
        if count != 1:
            raise RuntimeError("Unexpected multiline notify configuration; no config overwritten")
    else:
        updated = line + "\n" + original
    assert tomllib.loads(updated)["notify"] == notify
    codex.write_text(updated, encoding="utf-8")
elif not runtime_path.exists():
    raise RuntimeError("Installed notifier is missing previous-notify metadata")
command = '"' + sys.executable.replace("\\", "/") + '" "' + str(scripts / "05_notify_completion.py").replace("\\", "/") + '" --source Claude'
groups = settings.setdefault("hooks", {}).setdefault("Stop", [])
if not any(hook.get("command") == command for group in groups for hook in group.get("hooks", [])):
    groups.append({"hooks": [{"type": "command", "command": command, "timeout": 30}]})
    claude.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
assert tomllib.loads(codex.read_text(encoding="utf-8"))["notify"] == notify
assert any(hook.get("command") == command for group in json.loads(claude.read_text(encoding="utf-8"))["hooks"]["Stop"] for hook in group["hooks"])
print(json.dumps({"installed": str(root), "codex_notify": notify, "claude_stop_command": command}, ensure_ascii=False, indent=2))
