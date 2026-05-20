from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CONF_URL
from .coordinator import SiteRelayCoordinator
from .entity import SiteRelayEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: SiteRelayCoordinator = hass.data[DOMAIN][entry.entry_id]
    url = entry.data[CONF_URL]

    entities: list[SiteRelayEntity] = [SiteRelayServerSensor(coordinator, entry.entry_id, url)]

    for svc in (coordinator.data or {}).get("state", {}).get("services", []):
        entities.append(SiteRelayServiceSensor(coordinator, entry.entry_id, url, svc))

    async_add_entities(entities)


class SiteRelayServerSensor(SiteRelayEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_name = "Server"

    def __init__(self, coordinator, entry_id, url):
        super().__init__(coordinator, entry_id, url)
        self._attr_unique_id = f"{entry_id}_server_online"

    @property
    def is_on(self) -> bool:
        return bool((self.coordinator.data or {}).get("serverOnline", False))


class SiteRelayServiceSensor(SiteRelayEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator, entry_id, url, svc: dict) -> None:
        super().__init__(coordinator, entry_id, url)
        self._id = svc["id"]
        self._attr_name = svc["label"]
        self._attr_unique_id = f"{entry_id}_service_{self._id}"

    @property
    def is_on(self) -> bool:
        for svc in self._state().get("services", []):
            if svc["id"] == self._id:
                return bool(svc.get("active", False))
        return False
