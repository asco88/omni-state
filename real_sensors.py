#!/usr/bin/env python3
"""
Real sensor collector for OmniState.
Reads actual system metrics every 5 s and checks service health.
No external dependencies — pure stdlib.
"""

import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

SENSORS_FILE = Path(os.environ.get("OMNISTATE_FILE", "sensors.json"))
FILES_DIR    = SENSORS_FILE.parent / "mock-files"
NET_IFACE    = os.environ.get("OMNISTATE_NET_IFACE", "ens18")
INTERVAL     = 5

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

INITIAL_STATE: dict = {
    "sensors": [
        {"id": "cpu",    "label": "CPU Usage",   "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "memory", "label": "Memory",      "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "disk",   "label": "Disk /",      "value": 0.0, "unit": "%",    "min": 0, "max": 100},
        {"id": "net_rx", "label": "Network RX",  "value": 0.0, "unit": "KB/s", "min": 0, "max": 5000},
    ],
    "toggles": [
        {"id": "fan",    "label": "Fan",              "enabled": False},
        {"id": "lights", "label": "Lights",           "enabled": True},
        {"id": "ac",     "label": "Air Conditioning", "enabled": False},
        {"id": "alarm",  "label": "Alarm",            "enabled": False},
    ],
    "sliders": [
        {"id": "volume", "label": "Master Volume", "value": 65, "min": 0, "max": 100, "unit": "%"},
    ],
    "files": [
        {"id": "documents", "label": "Mock Files", "items": []},
    ],
    "services": [],
}


# ── Metrics ───────────────────────────────────────────────────────────────────

class Metrics:
    def __init__(self) -> None:
        self._cpu_prev  = self._cpu_stat()
        self._net_prev  = self._net_stat()
        self._net_time  = time.time()

    def _cpu_stat(self) -> tuple[int, int]:
        parts = Path("/proc/stat").read_text().split("\n")[0].split()
        vals  = [int(x) for x in parts[1:8]]
        return sum(vals), vals[3]  # total, idle

    def _net_stat(self) -> tuple[int, int]:
        for line in Path("/proc/net/dev").read_text().split("\n"):
            if NET_IFACE in line:
                cols = line.split(":")[1].split()
                return int(cols[0]), int(cols[8])  # rx_bytes, tx_bytes
        return 0, 0

    def cpu(self) -> float:
        curr  = self._cpu_stat()
        dt    = curr[0] - self._cpu_prev[0]
        di    = curr[1] - self._cpu_prev[1]
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
        now  = time.time()
        curr = self._net_stat()
        elapsed = now - self._net_time
        rx_kb = round((curr[0] - self._net_prev[0]) / max(elapsed, 1) / 1024, 1) if elapsed else 0.0
        self._net_prev = curr
        self._net_time = now
        return max(0.0, rx_kb)


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
    vals = {
        "cpu":    m.cpu(),
        "memory": m.memory(),
        "disk":   m.disk(),
        "net_rx": m.net_rx_kb(),
    }
    for s in state.get("sensors", []):
        if s["id"] in vals:
            s["value"] = vals[s["id"]]
    return state


def main() -> None:
    log.info("Real sensor collector starting — writing to %s", SENSORS_FILE.resolve())
    m = Metrics()
    while True:
        state = load_state()
        state = update_sensors(state, m)
        state = scan_files(state)
        state["services"] = check_services()
        SENSORS_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        log.debug("State updated")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
