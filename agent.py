#!/usr/bin/env python3
"""
OmniState agent — bidirectional relay between local files and the Vercel cloud UI.

Watches:
  - OMNISTATE_FILE      (default: sensors.json)        → /api/update-state
  - OMNISTATE_STYLE_FILE (default: omni-state-style.json) → /api/update-style

Cloud → local sync:
  - Polls /api/get-desired-state  every 5 s → writes OMNISTATE_FILE
  - Polls /api/get-style?desired=1 every 5 s → writes OMNISTATE_STYLE_FILE

Requires: pip install watchdog requests
"""

import json
import logging
import os
import threading
import time
from pathlib import Path

import requests
from watchdog.events import FileModifiedEvent, FileSystemEventHandler
from watchdog.observers import Observer

# ── Config ────────────────────────────────────────────────────────────────────

VERCEL_URL          = os.environ.get("OMNISTATE_URL", "").rstrip("/")
DATA_FILE           = Path(os.environ.get("OMNISTATE_FILE",       "sensors.json"))
STYLE_FILE          = Path(os.environ.get("OMNISTATE_STYLE_FILE", "omni-state-style.json"))
HEARTBEAT_INTERVAL  = 30  # seconds
CLOUD_POLL_INTERVAL = 5   # seconds
REQUEST_TIMEOUT     = 10  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("omnistate")

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def post(path: str, payload: dict) -> bool:
    if not VERCEL_URL:
        log.error("OMNISTATE_URL is not set.")
        return False
    try:
        r = requests.post(f"{VERCEL_URL}{path}", json=payload, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.warning("POST %s failed: %s", path, exc)
        return False


def get_json(path: str) -> dict | None:
    try:
        r = requests.get(f"{VERCEL_URL}{path}", timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        log.warning("GET %s failed: %s", path, exc)
        return None

# ── File sync helpers ─────────────────────────────────────────────────────────

def send_file(file: Path, api_path: str, label: str) -> None:
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        log.warning("%s not found — skipping", file)
        return
    except json.JSONDecodeError as exc:
        log.warning("Invalid JSON in %s: %s", file, exc)
        return
    if post(api_path, data):
        log.info("%s synced from %s", label, file)


def apply_desired(file: Path, payload: dict, label: str) -> None:
    file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("%s applied from cloud → %s", label, file)

# ── Threads ───────────────────────────────────────────────────────────────────

def heartbeat_loop() -> None:
    while True:
        post("/api/update-state", {"type": "heartbeat"})
        time.sleep(HEARTBEAT_INTERVAL)


def state_sync_loop() -> None:
    last_rev: int | None = None
    while True:
        data = get_json("/api/get-desired-state")
        if data:
            rev, state = data.get("rev"), data.get("state")
            if rev and rev != last_rev and state is not None:
                apply_desired(DATA_FILE, state, "State")
                last_rev = rev
        time.sleep(CLOUD_POLL_INTERVAL)


def style_sync_loop() -> None:
    last_rev: int | None = None
    while True:
        data = get_json("/api/get-style?desired=1")
        if data:
            rev, style = data.get("rev"), data.get("style")
            if rev and rev != last_rev and style is not None:
                apply_desired(STYLE_FILE, style, "Style")
                last_rev = rev
        time.sleep(CLOUD_POLL_INTERVAL)

# ── File watcher ──────────────────────────────────────────────────────────────

class FileHandler(FileSystemEventHandler):
    def on_modified(self, event: FileModifiedEvent) -> None:
        path = Path(event.src_path).resolve()
        if path == DATA_FILE.resolve():
            log.info("Change detected in %s — syncing…", DATA_FILE.name)
            send_file(DATA_FILE, "/api/update-state", "State")
        elif path == STYLE_FILE.resolve():
            log.info("Change detected in %s — syncing…", STYLE_FILE.name)
            send_file(STYLE_FILE, "/api/update-style", "Style")

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not VERCEL_URL:
        raise SystemExit(
            "Set OMNISTATE_URL to your Vercel deployment URL, e.g.:\n"
            "  export OMNISTATE_URL=https://omni-state.vercel.app"
        )

    log.info("OmniState agent starting")
    log.info("  State file : %s", DATA_FILE.resolve())
    log.info("  Style file : %s", STYLE_FILE.resolve())
    log.info("  Target     : %s", VERCEL_URL)

    # Initial sync on startup
    send_file(DATA_FILE,  "/api/update-state",  "State")
    send_file(STYLE_FILE, "/api/update-style", "Style")

    # Start background threads
    for target, name in [
        (heartbeat_loop,  "heartbeat"),
        (state_sync_loop, "state-sync"),
        (style_sync_loop, "style-sync"),
    ]:
        t = threading.Thread(target=target, daemon=True, name=name)
        t.start()
        log.info("Thread started: %s", name)

    # Watch both files
    observer = Observer()
    watch_dirs = {DATA_FILE.parent.resolve(), STYLE_FILE.parent.resolve()}
    handler = FileHandler()
    for d in watch_dirs:
        observer.schedule(handler, path=str(d), recursive=False)
    observer.start()
    log.info("Watching for file changes… (Ctrl+C to stop)")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Shutting down")
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
