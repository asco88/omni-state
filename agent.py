#!/usr/bin/env python3
"""
OmniState agent — watches data.json and relays it to the Vercel cloud UI.
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
VERCEL_URL = os.environ.get("OMNISTATE_URL", "").rstrip("/")
DATA_FILE = Path(os.environ.get("OMNISTATE_FILE", "data.json"))
HEARTBEAT_INTERVAL = 30  # seconds
CLOUD_POLL_INTERVAL = 5   # seconds — how often to check for desired state
REQUEST_TIMEOUT = 10  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("omnistate")


def post(payload: dict) -> bool:
    if not VERCEL_URL:
        log.error("OMNISTATE_URL is not set. Export it before running.")
        return False
    try:
        r = requests.post(
            f"{VERCEL_URL}/api/update-state",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.warning("POST failed: %s", exc)
        return False


def send_file() -> None:
    try:
        text = DATA_FILE.read_text(encoding="utf-8")
        data = json.loads(text)
    except FileNotFoundError:
        log.warning("%s not found — skipping", DATA_FILE)
        return
    except json.JSONDecodeError as exc:
        log.warning("Invalid JSON in %s: %s", DATA_FILE, exc)
        return

    if post(data):
        log.info("State synced from %s", DATA_FILE)


def cloud_sync_loop() -> None:
    """Poll the cloud for desired-state changes and apply them to data.json."""
    last_rev: int | None = None
    while True:
        try:
            r = requests.get(
                f"{VERCEL_URL}/api/get-desired-state",
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            payload = r.json()
            rev = payload.get("rev")
            state = payload.get("state")

            if rev and rev != last_rev and state is not None:
                DATA_FILE.write_text(
                    json.dumps(state, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                last_rev = rev
                log.info("Applied desired state from cloud (rev=%s)", rev)
        except requests.RequestException as exc:
            log.warning("Cloud sync poll failed: %s", exc)
        except Exception as exc:
            log.warning("Unexpected error in cloud sync: %s", exc)

        time.sleep(CLOUD_POLL_INTERVAL)


def heartbeat_loop() -> None:
    while True:
        if post({"type": "heartbeat"}):
            log.debug("Heartbeat sent")
        time.sleep(HEARTBEAT_INTERVAL)


class DataFileHandler(FileSystemEventHandler):
    def on_modified(self, event: FileModifiedEvent) -> None:
        if Path(event.src_path).resolve() == DATA_FILE.resolve():
            log.info("Change detected in %s — syncing…", DATA_FILE)
            send_file()


def main() -> None:
    if not VERCEL_URL:
        raise SystemExit(
            "Set OMNISTATE_URL to your Vercel deployment URL, e.g.:\n"
            "  export OMNISTATE_URL=https://omni-state.vercel.app"
        )

    log.info("OmniState agent starting")
    log.info("  Watching : %s", DATA_FILE.resolve())
    log.info("  Target   : %s", VERCEL_URL)

    # Send current state immediately on startup
    send_file()

    # Start heartbeat thread
    t = threading.Thread(target=heartbeat_loop, daemon=True)
    t.start()
    log.info("Heartbeat thread started (every %ds)", HEARTBEAT_INTERVAL)

    # Start cloud → local sync thread
    cs = threading.Thread(target=cloud_sync_loop, daemon=True)
    cs.start()
    log.info("Cloud sync thread started (polling every %ds)", CLOUD_POLL_INTERVAL)

    # Start file watcher
    observer = Observer()
    observer.schedule(DataFileHandler(), path=str(DATA_FILE.parent), recursive=False)
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
