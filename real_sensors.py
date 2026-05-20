#!/usr/bin/env python3
"""
Real sensor collector for SiteRelay.
Reads actual system metrics every 5 s and checks service health.
Pulls smart-home data from Home Assistant and pushes server metrics back.
No external dependencies — pure stdlib.
"""

import json
import logging
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

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

SENSORS_FILE = Path(os.environ.get("OMNISTATE_FILE", "sensors.json"))
NET_IFACE    = os.environ.get("OMNISTATE_NET_IFACE") or _cfg.get("net_iface", "eth0")
INTERVAL     = 15

HA_URL    = _get("HA_URL",    "ha_url",    "http://homeassistant.local:8123")
HA_TOKEN  = _get("HA_TOKEN",  "ha_token",  "")
RADIO_URL = _get("RADIO_URL", "radio_url", "http://localhost:3013")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("real-sensors")

WATCHED_SERVICES: list[tuple[str, str]] = [
    (s["id"], s["label"]) for s in _cfg.get("services", [])
]

# HA sensor entities → pulled into SiteRelay sensors section
# (siterelay_id, ha_entity_id, label, unit, min, max)
HA_SENSOR_MAP: list[tuple] = [
    (s["id"], s["entity"], s["label"], s["unit"], s.get("min", 0), s.get("max", 100))
    for s in _cfg.get("ha_sensors", [])
]

# Server metrics to push back into HA as virtual sensor entities
# (siterelay_sensor_id, ha_entity_id, ha_friendly_name, unit, icon)
HA_PUSH_MAP: list[tuple] = [
    (p["metric"], p["entity"], p["label"], p["unit"], p.get("icon", "mdi:monitor"))
    for p in _cfg.get("ha_push", [])
]

HA_ACTIONS: list[dict] = [
    {"id": a["id"], "label": a["label"]}
    for a in _cfg.get("ha_actions", [])
]

INITIAL_STATE: dict = {
    "sensors": [
        {"id": "cpu",    "label": "CPU Usage",  "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "memory", "label": "Memory",      "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "disk",   "label": "Disk /",      "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "net_rx", "label": "Network RX",  "value": 0.0, "unit": "KB/s", "min": 0, "max": 5000},
    ] + [
        {"id": s["id"], "label": s["label"], "value": 0.0, "unit": s["unit"], "min": s.get("min", 0), "max": s.get("max", 100)}
        for s in _cfg.get("ha_sensors", [])
    ],
    "toggles": [],
    "sliders": [],
    "services":   [],
    "actions":    [a.copy() for a in HA_ACTIONS],
    "ha_devices": {},
}


# ── System Metrics ─────────────────────────────────────────────────────────────

class Metrics:
    def __init__(self) -> None:
        self._cpu_prev = self._cpu_stat()
        self._net_prev = self._net_stat()
        self._net_time = time.time()

    def _cpu_stat(self) -> tuple[int, int]:
        parts = Path("/proc/stat").read_text().split("\n")[0].split()
        vals  = [int(x) for x in parts[1:8]]
        return sum(vals), vals[3]

    def _net_stat(self) -> tuple[int, int]:
        for line in Path("/proc/net/dev").read_text().split("\n"):
            if NET_IFACE in line:
                cols = line.split(":")[1].split()
                return int(cols[0]), int(cols[8])
        return 0, 0

    def cpu(self) -> float:
        curr = self._cpu_stat()
        dt   = curr[0] - self._cpu_prev[0]
        di   = curr[1] - self._cpu_prev[1]
        self._cpu_prev = curr
        return round(100 * (1 - di / dt), 1) if dt else 0.0

    def memory(self) -> float:
        info: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text().split("\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                info[k.strip()] = int(v.strip().split()[0])
        total = info.get("MemTotal", 1)
        avail = info.get("MemAvailable", 0)
        return round(100 * (total - avail) / total, 1)

    def disk(self) -> float:
        u = shutil.disk_usage("/")
        return round(100 * u.used / u.total, 1)

    def net_rx_kb(self) -> float:
        now     = time.time()
        curr    = self._net_stat()
        elapsed = now - self._net_time
        rx_kb   = round((curr[0] - self._net_prev[0]) / max(elapsed, 1) / 1024, 1) if elapsed else 0.0
        self._net_prev = curr
        self._net_time = now
        return max(0.0, rx_kb)


# ── Home Assistant Client ──────────────────────────────────────────────────────

class HaClient:
    def __init__(self, url: str, token: str) -> None:
        self._url   = url.rstrip("/")
        self._token = token

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def get_all_states(self) -> list | None:
        try:
            req = urllib.request.Request(
                f"{self._url}/api/states",
                headers=self._headers(),
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            log.debug("HA get_all_states: %s", exc)
            return None

    def get_state(self, entity_id: str) -> str | None:
        try:
            req = urllib.request.Request(
                f"{self._url}/api/states/{entity_id}",
                headers=self._headers(),
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read()).get("state")
        except Exception as exc:
            log.debug("HA get_state %s: %s", entity_id, exc)
            return None

    def push_sensor(self, entity_id: str, state: str, attributes: dict) -> bool:
        try:
            payload = json.dumps({"state": state, "attributes": attributes}).encode()
            req = urllib.request.Request(
                f"{self._url}/api/states/{entity_id}",
                data=payload, headers=self._headers(), method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
            return True
        except Exception as exc:
            log.debug("HA push_sensor %s: %s", entity_id, exc)
            return False


# Domains included in the device browser and how to map them
_DEVICE_DOMAINS = {
    "switch":        "switches",
    "light":         "lights",
    "input_boolean": "switches",   # group with switches
    "media_player":  "media",
    "binary_sensor": "binary_sensors",
    "sensor":        "sensors",
}

# HA sensor entity prefixes to skip (virtual/internal)
_SENSOR_SKIP_PREFIXES = ("sensor.siterelay_",)

# Numeric states considered meaningful for sensor display
def _is_numeric(val: str) -> bool:
    try:
        float(val)
        return True
    except (ValueError, TypeError):
        return False


def fetch_ha_devices(ha: "HaClient") -> dict:
    """Fetch all HA entity states and return a grouped device browser dict."""
    all_states = ha.get_all_states()
    if all_states is None:
        return {}

    groups: dict[str, list] = {v: [] for v in _DEVICE_DOMAINS.values()}
    seen_ids: set[str] = set()

    for entity in all_states:
        eid    = entity.get("entity_id", "")
        domain = eid.split(".")[0]
        group  = _DEVICE_DOMAINS.get(domain)
        if group is None or eid in seen_ids:
            continue
        if any(eid.startswith(p) for p in _SENSOR_SKIP_PREFIXES):
            continue

        attrs = entity.get("attributes", {})
        state = entity.get("state", "unknown")
        name  = attrs.get("friendly_name") or eid

        # For plain sensors only include numeric values
        if domain == "sensor" and not _is_numeric(state):
            continue

        entry: dict = {
            "id":    eid,
            "name":  name,
            "state": state,
        }
        if domain == "sensor":
            unit = attrs.get("unit_of_measurement", "")
            if unit:
                entry["unit"] = unit
        elif domain == "media_player":
            entry["media_title"]  = attrs.get("media_title", "")
            entry["media_artist"] = attrs.get("media_artist", "")
            entry["volume"]       = attrs.get("volume_level")
        elif domain == "light":
            entry["brightness"] = attrs.get("brightness")

        groups[group].append(entry)
        seen_ids.add(eid)

    # Sort each group by name
    for g in groups.values():
        g.sort(key=lambda x: x["name"].lower())

    return {k: v for k, v in groups.items() if v}


# ── HA Integration ─────────────────────────────────────────────────────────────

def update_ha_sensors(state: dict, ha: HaClient) -> dict:
    """Pull HA sensor values into SiteRelay sensors list."""
    existing = {s["id"] for s in state.get("sensors", [])}
    for oid, eid, label, unit, mn, mx in HA_SENSOR_MAP:
        raw = ha.get_state(eid)
        if raw is None:
            continue
        try:
            val = round(float(raw), 2)
        except ValueError:
            continue
        if oid in existing:
            for s in state["sensors"]:
                if s["id"] == oid:
                    s["value"] = val
        else:
            state["sensors"].append({"id": oid, "label": label, "value": val, "unit": unit, "min": mn, "max": mx})
            existing.add(oid)
    return state


def push_to_ha(state: dict, ha: HaClient) -> None:
    """Push server metrics and connection status to HA as virtual sensor entities."""
    import datetime

    # Always push connection status so HA can detect when the agent goes offline
    ha.push_sensor("sensor.siterelay_status", "online", {
        "friendly_name": "SiteRelay Status",
        "icon": "mdi:home-assistant",
        "last_seen": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source": "siterelay",
    })

    vals = {s["id"]: s["value"] for s in state.get("sensors", [])}
    for sid, eid, name, unit, icon in HA_PUSH_MAP:
        if sid in vals:
            ha.push_sensor(eid, str(vals[sid]), {
                "friendly_name": name,
                "unit_of_measurement": unit,
                "icon": icon,
                "source": "siterelay",
            })


# ── Radio ──────────────────────────────────────────────────────────────────────

def fetch_radio() -> dict | None:
    """Fetch current state from the radio-player-2 server."""
    def _get_json(path: str):
        try:
            req = urllib.request.Request(f"{RADIO_URL}{path}")
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read())
        except Exception:
            return None

    now_playing  = _get_json("/api/now-playing") or {}
    stations_raw = _get_json("/api/stations")
    cast_active  = _get_json("/api/cast/active") or {}

    if stations_raw is None:
        return None

    faves = [s for s in stations_raw if s.get("favorite")]
    station_list = faves if faves else stations_raw[:8]
    stations = [
        {"id": s["id"], "name": s.get("name", ""), "favicon": s.get("favicon", "🎵"), "genre": s.get("genre", "")}
        for s in station_list
    ]

    station  = now_playing.get("station")
    cast_dev = cast_active.get("device")
    cast_sta = cast_active.get("station")

    return {
        "playing": station is not None,
        "station": {"id": station["id"], "name": station.get("name", ""), "favicon": station.get("favicon", "🎵")} if station else None,
        "stations": stations,
        "cast": {
            "active":  bool(cast_dev),
            "device":  {"id": cast_dev["id"], "name": cast_dev.get("name", "")} if cast_dev else None,
            "station": {"name": cast_sta.get("name", ""), "favicon": cast_sta.get("favicon", "🎵")} if cast_sta else None,
        },
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def check_services() -> list[dict]:
    result = []
    for sid, label in WATCHED_SERVICES:
        name = sid.replace("_", "-")
        try:
            out = subprocess.run(
                ["systemctl", "is-active", name],
                capture_output=True, text=True, timeout=3,
            ).stdout.strip()
            active = out == "active"
        except Exception:
            active = False
        result.append({"id": sid, "label": label, "active": active})
    return result


def load_state() -> dict:
    try:
        data = json.loads(SENSORS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    # Always use INITIAL_STATE as the authoritative schema for config-defined keys
    for key in ("toggles", "sliders"):
        data[key] = list(INITIAL_STATE[key])
    data.pop("files", None)
    for key in ("sensors", "services", "actions", "ha_devices"):
        if key not in data:
            data[key] = INITIAL_STATE[key]
    # Keep action definitions in sync (add new, preserve last_triggered)
    existing = {a["id"]: a for a in data["actions"]}
    data["actions"] = [{**a, **{k: v for k, v in existing.get(a["id"], {}).items() if k != "id"}}
                       for a in HA_ACTIONS]
    return data


def update_sensors(state: dict, m: Metrics) -> dict:
    vals = {"cpu": m.cpu(), "memory": m.memory(), "disk": m.disk(), "net_rx": m.net_rx_kb()}
    for s in state.get("sensors", []):
        if s["id"] in vals:
            s["value"] = vals[s["id"]]
    return state


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("Real sensor collector starting — writing to %s", SENSORS_FILE.resolve())
    m  = Metrics()
    ha = HaClient(HA_URL, HA_TOKEN) if HA_TOKEN else None
    if ha:
        log.info("Home Assistant integration enabled — %s", HA_URL)
    else:
        log.warning("HA_TOKEN not set — Home Assistant integration disabled")

    while True:
        state = load_state()
        state = update_sensors(state, m)
        state["services"] = check_services()

        if ha:
            state = update_ha_sensors(state, ha)
            push_to_ha(state, ha)
            state["ha_devices"] = fetch_ha_devices(ha)

        radio = fetch_radio()
        if radio is not None:
            state["radio"] = radio

        SENSORS_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        log.debug("State updated")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
