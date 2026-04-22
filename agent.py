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

def _load_config() -> dict:
    """Load config.json from the script's directory (env vars take precedence)."""
    cfg_file = Path(__file__).parent / "config.json"
    try:
        return json.loads(cfg_file.read_text()) if cfg_file.exists() else {}
    except Exception:
        return {}

_cfg = _load_config()

def _get(env_key: str, cfg_key: str, default: str = "") -> str:
    return os.environ.get(env_key) or _cfg.get(cfg_key, default)

VERCEL_URL          = _get("OMNISTATE_URL", "vercel_url").rstrip("/")
API_KEY             = _get("OMNISTATE_API_KEY", "api_key", "")
DATA_FILE           = Path(os.environ.get("OMNISTATE_FILE",       "sensors.json"))
STYLE_FILE          = Path(os.environ.get("OMNISTATE_STYLE_FILE", "omni-state-style.json"))
HEARTBEAT_INTERVAL  = 30  # seconds
CLOUD_POLL_INTERVAL = 5   # seconds
REQUEST_TIMEOUT     = 10  # seconds

HA_URL    = _get("HA_URL",    "ha_url",    "http://homeassistant.local:8123")
HA_TOKEN  = _get("HA_TOKEN",  "ha_token",  "")
RADIO_URL = _get("RADIO_URL", "radio_url", "http://localhost:3013")

# Maps OmniState toggle IDs → HA entity IDs for direct switch control
HA_SWITCH_ENTITIES: dict[str, str] = {
    "ha_entry":   "input_boolean.entry_light",
    "ha_front":   "switch.right_switch_2",
    "ha_left":    "switch.wifi_smart_switch_switch_2",
    "ha_parking": "switch.wifi_smart_switch_switch_3",
}

# Maps OmniState action IDs → HA automation/script entity IDs
HA_ACTION_ENTITIES: dict[str, str] = {
    "all_lights_off":  "automation.turn_all_light_off",
    "entry_light_on":  "automation.solar_based_turn_on_lights",
    "front_lights_on": "automation.turn_front_lights_on",
    "front_light_off": "automation.turn_front_light_off",
}

ACTION_TRIGGER_WINDOW_MS = 60_000  # ignore triggers older than 60 s (prevents re-fire on restart)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("omnistate")

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _agent_headers() -> dict:
    h = {"Content-Type": "application/json"}
    if API_KEY:
        h["Authorization"] = f"Bearer {API_KEY}"
    return h


def post(path: str, payload: dict) -> bool:
    if not VERCEL_URL:
        log.error("OMNISTATE_URL is not set.")
        return False
    try:
        r = requests.post(f"{VERCEL_URL}{path}", json=payload, headers=_agent_headers(), timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.warning("POST %s failed: %s", path, exc)
        return False


def get_json(path: str) -> dict | None:
    try:
        r = requests.get(f"{VERCEL_URL}{path}", headers=_agent_headers(), timeout=REQUEST_TIMEOUT)
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
    """Merge only sliders into the existing file.
    - Sensors: owned exclusively by real_sensors.py (live readings).
    - Toggles: agent calls HA directly; real_sensors.py reflects actual HA state.
    - Sliders: user preference with no external source, so we persist it here."""
    try:
        current = json.loads(file.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        current = {}
    if "sliders" in payload:
        current["sliders"] = payload["sliders"]
    file.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("%s applied from cloud → %s", label, file)


_STYLE_KEYS = ("theme", "accent", "font", "sectionOrder", "cardOrder", "pinnedDevices", "deviceNames")

def apply_desired_style(file: Path, payload: dict) -> None:
    """Write all UI preference fields from desired_style to the style file."""
    try:
        current = json.loads(file.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        current = {}
    for key in _STYLE_KEYS:
        if key in payload:
            current[key] = payload[key]
    file.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Style applied from cloud → %s", file)


def call_ha_automation(entity_id: str) -> None:
    if not HA_TOKEN:
        return
    domain  = entity_id.split(".")[0]
    service = "trigger" if domain == "automation" else "turn_on"
    try:
        r = requests.post(
            f"{HA_URL}/api/services/{domain}/{service}",
            headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
            json={"entity_id": entity_id},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        log.info("HA triggered: %s", entity_id)
    except requests.RequestException as exc:
        log.warning("HA trigger %s failed: %s", entity_id, exc)


def call_ha_switch(entity_id: str, on: bool) -> None:
    if not HA_TOKEN:
        return
    domain     = entity_id.split(".")[0]
    svc_domain = domain if domain in ("switch", "input_boolean", "light") else "switch"
    service    = "turn_on" if on else "turn_off"
    try:
        r = requests.post(
            f"{HA_URL}/api/services/{svc_domain}/{service}",
            headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
            json={"entity_id": entity_id},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        log.info("HA %s → %s", entity_id, "on" if on else "off")
    except requests.RequestException as exc:
        log.warning("HA switch %s failed: %s", entity_id, exc)


HA_CMD_FRESHNESS_MS    = 30_000
RADIO_CMD_FRESHNESS_MS = 30_000

def call_radio(cmd: dict) -> None:
    action = cmd.get("action", "")
    try:
        if action == "play":
            requests.post(f"{RADIO_URL}/api/play", json={"stationId": cmd.get("stationId")}, timeout=10)
        elif action == "stop":
            requests.post(f"{RADIO_URL}/api/stop", json={}, timeout=10)
        elif action == "cast_play":
            requests.post(f"{RADIO_URL}/api/cast/play", json={"stationId": cmd.get("stationId"), "deviceId": cmd.get("deviceId")}, timeout=10)
        elif action == "cast_stop":
            requests.post(f"{RADIO_URL}/api/cast/stop", json={}, timeout=10)
        elif action == "cast_volume":
            requests.post(f"{RADIO_URL}/api/cast/volume", json={"level": cmd.get("level")}, timeout=10)
        log.info("Radio command: %s", action)
    except Exception as exc:
        log.warning("Radio command %s failed: %s", action, exc)


def call_ha_service(entity_id: str, service: str) -> None:
    """Call an arbitrary HA service for the device browser."""
    if not HA_TOKEN:
        return
    domain = entity_id.split(".")[0]
    svc_parts = service.split(".")
    svc_domain  = svc_parts[0] if len(svc_parts) > 1 else domain
    svc_name    = svc_parts[-1]
    try:
        r = requests.post(
            f"{HA_URL}/api/services/{svc_domain}/{svc_name}",
            headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
            json={"entity_id": entity_id},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        log.info("HA service %s/%s → %s", svc_domain, svc_name, entity_id)
    except requests.RequestException as exc:
        log.warning("HA service %s/%s %s failed: %s", svc_domain, svc_name, entity_id, exc)

# ── Threads ───────────────────────────────────────────────────────────────────

def heartbeat_loop() -> None:
    while True:
        post("/api/update-state", {"type": "heartbeat"})
        time.sleep(HEARTBEAT_INTERVAL)


_last_ha_desired: dict[str, bool] = {}
_last_trigger_times: dict[str, int] = {}
_last_ha_cmd_ts: int = 0
_last_radio_cmd_ts: int = 0


def state_sync_loop() -> None:
    last_rev: int | None = None
    while True:
        data = get_json("/api/get-desired-state")
        if data:
            rev, state = data.get("rev"), data.get("state")
            if rev and rev != last_rev and isinstance(state, dict):
                # HA switches — call directly
                for toggle in state.get("toggles", []):
                    tid = toggle.get("id", "")
                    eid = HA_SWITCH_ENTITIES.get(tid)
                    if eid:
                        desired = bool(toggle.get("enabled", False))
                        if _last_ha_desired.get(tid) != desired:
                            call_ha_switch(eid, desired)
                            _last_ha_desired[tid] = desired

                # HA automations — fire if timestamp is recent and new
                now_ms = time.time() * 1000
                for action in state.get("actions", []):
                    aid = action.get("id", "")
                    ts  = action.get("last_triggered")
                    eid = HA_ACTION_ENTITIES.get(aid)
                    if eid and ts and ts != _last_trigger_times.get(aid):
                        if now_ms - ts < ACTION_TRIGGER_WINDOW_MS:
                            call_ha_automation(eid)
                        _last_trigger_times[aid] = ts

                # HA device browser commands
                global _last_ha_cmd_ts
                ha_cmd = state.get("ha_command")
                if ha_cmd and isinstance(ha_cmd, dict):
                    ts  = ha_cmd.get("ts", 0)
                    eid = ha_cmd.get("entity_id", "")
                    svc = ha_cmd.get("service", "")
                    now_ms = time.time() * 1000
                    if eid and svc and ts != _last_ha_cmd_ts and (now_ms - ts) < HA_CMD_FRESHNESS_MS:
                        call_ha_service(eid, svc)
                    _last_ha_cmd_ts = ts

                # Radio commands
                global _last_radio_cmd_ts
                radio_cmd = state.get("radio_command")
                if radio_cmd and isinstance(radio_cmd, dict):
                    ts = radio_cmd.get("ts", 0)
                    now_ms = time.time() * 1000
                    if ts != _last_radio_cmd_ts and (now_ms - ts) < RADIO_CMD_FRESHNESS_MS:
                        call_radio(radio_cmd)
                    _last_radio_cmd_ts = ts

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
                apply_desired_style(STYLE_FILE, style)
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
