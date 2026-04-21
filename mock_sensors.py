#!/usr/bin/env python3
"""
Mock sensor simulator for OmniState.
- Updates sensor values every 5 s (random walk).
- Scans mock-files/ directory and includes file metadata.
- Preserves toggle and slider values set by the cloud.
"""

import json
import logging
import os
import random
from pathlib import Path
import time

SENSORS_FILE = Path(os.environ.get("OMNISTATE_FILE", "sensors.json"))
FILES_DIR = SENSORS_FILE.parent / "mock-files"
UPDATE_INTERVAL = 5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mock-sensors")

INITIAL_STATE: dict = {
    "sensors": [
        {"id": "temp_living", "label": "Living Room Temp", "value": 22.0, "unit": "°C", "min": 0,  "max": 50},
        {"id": "humidity",    "label": "Humidity",          "value": 65.0, "unit": "%",  "min": 0,  "max": 100},
        {"id": "cpu",         "label": "CPU Usage",         "value": 30.0, "unit": "%",  "min": 0,  "max": 100},
        {"id": "memory",      "label": "Memory Usage",      "value": 55.0, "unit": "%",  "min": 0,  "max": 100},
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
}


def load_state() -> dict:
    try:
        data = json.loads(SENSORS_FILE.read_text(encoding="utf-8"))
        # Ensure all top-level keys exist (forward-compat with older state)
        for key in ("sensors", "toggles", "sliders", "files"):
            if key not in data:
                data[key] = INITIAL_STATE[key]
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        return json.loads(json.dumps(INITIAL_STATE))


def update_sensors(state: dict) -> dict:
    for s in state.get("sensors", []):
        delta = random.uniform(-1.5, 1.5)
        s["value"] = round(max(s["min"], min(s["max"], s["value"] + delta)), 1)
    return state


def scan_files(state: dict) -> dict:
    items = []
    if FILES_DIR.is_dir():
        for entry in sorted(FILES_DIR.iterdir()):
            if entry.is_file():
                stat = entry.stat()
                items.append({
                    "name": entry.name,
                    "size": stat.st_size,
                    "modified": int(stat.st_mtime * 1000),
                })
    for group in state.get("files", []):
        if group.get("id") == "documents":
            group["items"] = items
    return state


def main() -> None:
    log.info("Mock sensor simulator starting — writing to %s", SENSORS_FILE.resolve())
    while True:
        state = load_state()
        state = update_sensors(state)
        state = scan_files(state)
        SENSORS_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        log.debug("State updated")
        time.sleep(UPDATE_INTERVAL)


if __name__ == "__main__":
    main()
