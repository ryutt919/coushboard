"""VERSION = "v1": Local Windows completion notifications for Codex and Claude."""

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback

VERSION = "v1"
ROOT = Path(os.environ["LOCALAPPDATA"]) / "VSCodeAgentNotifications"
POWERSHELL = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"


def log(**fields):
    ROOT.joinpath("logs").mkdir(parents=True, exist_ok=True)
    with ROOT.joinpath("logs/events.jsonl").open("a", encoding="utf-8") as file:
        file.write(json.dumps({"time": datetime.now().astimezone().isoformat(), **fields}, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["Codex", "Claude"], required=True)
    parser.add_argument("--test", action="store_true")
    parser.add_argument("payload", nargs="?")
    args = parser.parse_args()
    sys.stdin.reconfigure(encoding="utf-8")
    event = json.loads(args.payload if args.payload is not None else sys.stdin.read())
    if args.source == "Codex":
        if event.get("type") != "agent-turn-complete":
            log(source=args.source, status="ignored", event=event.get("type"))
            return
        runtime = ROOT.joinpath("runtime.json")
        previous = json.loads(runtime.read_text(encoding="utf-8"))["previous_codex_notify"]
        if previous and not args.test:
            try:
                result = subprocess.run(previous + [json.dumps(event, ensure_ascii=False)], capture_output=True, timeout=15, creationflags=subprocess.CREATE_NO_WINDOW)
                log(source=args.source, status="previous_notify", returncode=result.returncode, stderr=result.stderr.decode("utf-8", errors="replace")[:1000])
            except (OSError, subprocess.TimeoutExpired) as error:
                # Retain explicit evidence while still delivering our independent notification.
                log(source=args.source, status="previous_notify_error", error=str(error))
        identity = str(event.get("thread-id", "")) + ":" + str(event.get("turn-id", ""))
    else:
        if event.get("hook_event_name") != "Stop":
            raise ValueError("Claude notification requires a Stop event")
        if event.get("background_tasks") or event.get("session_crons"):
            log(source=args.source, status="waiting_for_background")
            return
        identity = str(event.get("session_id", "")) + ":" + str(event.get("last_assistant_message", ""))
    project = Path(event.get("cwd") or os.getcwd()).name
    tag = hashlib.sha256((args.source + identity).encode("utf-8")).hexdigest()[:16]
    payload = {"source": args.source, "project": project, "tag": tag, "test": args.test}
    result = subprocess.run(
        [str(POWERSHELL), "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(Path(__file__).with_name("06_show_completion_toast.ps1"))],
        input=json.dumps(payload, ensure_ascii=False).encode("utf-8"), capture_output=True,
        timeout=20, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    log(source=args.source, status="toast_submitted", project=project, tag=tag, test=args.test, result=result.stdout.decode("utf-8", errors="replace").strip())


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(status="error", traceback=traceback.format_exc())
        raise
