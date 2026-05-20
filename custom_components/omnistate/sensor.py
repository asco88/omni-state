from __future__ import annotations

import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CONF_URL
from .coordinator import OmniStateCoordinator
from .entity import OmniStateEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: OmniStateCoordinator = hass.data[DOMAIN][entry.entry_id]
    url = entry.data[CONF_URL]

    entities: list[OmniStateEntity] = [OmniStateLastSeenSensor(coordinator, entry.entry_id, url)]

    for sensor_def in (coordinator.data or {}).get("state", {}).get("sensors", []):
        entities.append(OmniStateMetricSensor(coordinator, entry.entry_id, url, sensor_def))

    async_add_entities(entities)


class OmniStateMetricSensor(OmniStateEntity, SensorEntity):
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry_id, url, sensor_def: dict) -> None:
        super().__init__(coordinator, entry_id, url)
        self._id = sensor_def["id"]
        self._attr_name = sensor_def["label"]
        self._attr_unique_id = f"{entry_id}_sensor_{self._id}"
        self._attr_native_unit_of_measurement = sensor_def.get("unit", "")

    @property
    def native_value(self) -> float | None:
        for s in self._state().get("sensors", []):
            if s["id"] == self._id:
                return s.get("value")
        return None


class OmniStateLastSeenSensor(OmniStateEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_name = "Last Seen"

    def __init__(self, coordinator, entry_id, url) -> None:
        super().__init__(coordinator, entry_id, url)
        self._attr_unique_id = f"{entry_id}_last_seen"

    @property
    def native_value(self) -> datetime.datetime | None:
        ts = (self.coordinator.data or {}).get("serverLastSeen")
        if not ts:
            return None
        return datetime.datetime.fromtimestamp(ts / 1000, tz=datetime.timezone.utc)
