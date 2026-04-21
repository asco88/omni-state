#!/usr/bin/env python3
"""
Real sensor collector for OmniState.
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

SENSORS_FILE = Path(os.environ.get("OMNISTATE_FILE", "sensors.json"))
FILES_DIR    = SENSORS_FILE.parent / "mock-files"
NET_IFACE    = os.environ.get("OMNISTATE_NET_IFACE", "ens18")
INTERVAL     = 5

HA_URL   = os.environ.get("HA_URL",   "http://10.0.0.173:8123")
HA_TOKEN = os.environ.get("HA_TOKEN", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("real-sensors")

WATCHED_SERVICES = [
    ("nginx",            "nginx"),
    ("docker",           "Docker"),
    ("gitlab_runner",    "GitLab Runner"),
    ("oref_monitor",     "OREF Monitor"),
    ("lang_learn",       "LangLearn"),
    ("home_data_share",  "HomeShare"),
    ("server_dashboard", "Server Dashboard"),
    ("omnistate",        "OmniState Agent"),
]

# HA sensor entities → pulled into OmniState sensors section
# (omnistate_id, ha_entity_id, label, unit, min, max)
HA_SENSOR_MAP = [
    ("ha_solar_power",   "sensor.solaredge_current_power", "Solar Power",   "kW", 0, 12),
    ("ha_solar_battery", "sensor.solaredge_storage_level", "Solar Battery", "%",  0, 100),
]

# HA switch/boolean entities → pulled into OmniState toggles (bidirectional)
# (omnistate_id, ha_entity_id, label)
HA_SWITCH_MAP = [
    ("ha_entry",   "input_boolean.entry_light",         "Entry Light"),
    ("ha_front",   "switch.right_switch_2",             "Front"),
    ("ha_left",    "switch.wifi_smart_switch_switch_2", "Left Switch"),
    ("ha_parking", "switch.wifi_smart_switch_switch_3", "Parking"),
]

# Ubuntu metrics to push back into HA as virtual sensor entities
# (omnistate_sensor_id, ha_entity_id, ha_friendly_name, unit, icon)
HA_PUSH_MAP = [
    ("cpu",    "sensor.omnistate_cpu",    "OmniState CPU",     "%",    "mdi:cpu-64-bit"),
    ("memory", "sensor.omnistate_memory", "OmniState Memory",  "%",    "mdi:memory"),
    ("disk",   "sensor.omnistate_disk",   "OmniState Disk",    "%",    "mdi:harddisk"),
    ("net_rx", "sensor.omnistate_net_rx", "OmniState Network", "KB/s", "mdi:network"),
]

INITIAL_STATE: dict = {
    "sensors": [
        {"id": "cpu",             "label": "CPU Usage",    "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "memory",          "label": "Memory",       "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "disk",            "label": "Disk /",       "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "net_rx",          "label": "Network RX",   "value": 0.0, "unit": "KB/s", "min": 0, "max": 5000},
        {"id": "ha_solar_power",  "label": "Solar Power",  "value": 0.0, "unit": "kW",   "min": 0, "max": 12},
        {"id": "ha_solar_battery","label": "Solar Battery","value": 0.0, "unit": "%",    "min": 0, "max": 100},
    ],
    "toggles": [
        {"id": "ha_entry",   "label": "Entry Light", "enabled": False},
        {"id": "ha_front",   "label": "Front",       "enabled": False},
        {"id": "ha_left",    "label": "Left Switch",  "enabled": False},
        {"id": "ha_parking", "label": "Parking",     "enabled": False},
    ],
    "sliders": [
        {"id": "volume", "label": "Master Volume", "value": 65, "min": 0, "max": 100, "unit": "%"},
    ],
    "files": [
        {"id": "documents", "label": "Mock Files", "items": []},
    ],
    "services": [],
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

    def set_entity(self, entity_id: str, on: bool) -> bool:
        domain  = entity_id.split(".")[0]
        service = "turn_on" if on else "turn_off"
        # lights use light domain, everything else matches domain name
        svc_domain = domain if domain in ("switch", "input_boolean", "light") else "switch"
        try:
            payload = json.dumps({"entity_id": entity_id}).encode()
            req = urllib.request.Request(
                f"{self._url}/api/services/{svc_domain}/{service}",
                data=payload, headers=self._headers(), method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
            log.info("HA %s → %s", entity_id, "on" if on else "off")
            return True
        except Exception as exc:
            log.warning("HA set_entity %s failed: %s", entity_id, exc)
            return False

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


# ── HA Integration ─────────────────────────────────────────────────────────────

_last_ha_switch: dict[str, bool] = {}


def sync_ha_switches(state: dict, ha: HaClient) -> dict:
    """Read desired toggle state; if UI changed it push to HA; then sync actual HA state back."""
    sw_map = {oid: eid for oid, eid, _ in HA_SWITCH_MAP}
    lbl_map = {oid: lbl for oid, _, lbl in HA_SWITCH_MAP}

    # Ensure all HA switches exist in toggles list
    existing = {t["id"] for t in state.get("toggles", [])}
    for oid, _, lbl in HA_SWITCH_MAP:
        if oid not in existing:
            state.setdefault("toggles", []).append({"id": oid, "label": lbl, "enabled": False})

    # Remove non-HA toggles (old mock ones like fan/lights/ac/alarm)
    state["toggles"] = [t for t in state["toggles"] if t["id"] in sw_map or t["id"] not in
                        {"fan", "lights", "ac", "alarm"}]

    for toggle in state["toggles"]:
        tid     = toggle["id"]
        eid     = sw_map.get(tid)
        if not eid:
            continue
        desired    = toggle["enabled"]
        last_known = _last_ha_switch.get(tid)

        if last_known is not None and desired != last_known:
            ha.set_entity(eid, desired)

        raw = ha.get_state(eid)
        if raw is not None:
            actual = raw == "on"
            toggle["enabled"] = actual
            _last_ha_switch[tid] = actual

    return state


def update_ha_sensors(state: dict, ha: HaClient) -> dict:
    """Pull HA sensor values into OmniState sensors list."""
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
    """Push Ubuntu server metrics to HA as virtual sensor entities."""
    vals = {s["id"]: s["value"] for s in state.get("sensors", [])}
    for sid, eid, name, unit, icon in HA_PUSH_MAP:
        if sid in vals:
            ha.push_sensor(eid, str(vals[sid]), {
                "friendly_name": name,
                "unit_of_measurement": unit,
                "icon": icon,
                "source": "omnistate",
            })


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


def scan_files(state: dict) -> dict:
    items = []
    if FILES_DIR.is_dir():
        for entry in sorted(FILES_DIR.iterdir()):
            if entry.is_file():
                s = entry.stat()
                items.append({"name": entry.name, "size": s.st_size, "modified": int(s.st_mtime * 1000)})
    for group in state.get("files", []):
        if group.get("id") == "documents":
            group["items"] = items
    return state


def load_state() -> dict:
    try:
        data = json.loads(SENSORS_FILE.read_text(encoding="utf-8"))
        for key in ("sensors", "toggles", "sliders", "files", "services"):
            if key not in data:
                data[key] = INITIAL_STATE[key]
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        return json.loads(json.dumps(INITIAL_STATE))


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
        state = scan_files(state)
        state["services"] = check_services()

        if ha:
            state = sync_ha_switches(state, ha)
            state = update_ha_sensors(state, ha)
            push_to_ha(state, ha)

        SENSORS_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        log.debug("State updated")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
