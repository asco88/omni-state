from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
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

    entities = [
        SiteRelaySwitch(coordinator, entry.entry_id, url, toggle)
        for toggle in (coordinator.data or {}).get("state", {}).get("toggles", [])
    ]
    async_add_entities(entities)


class SiteRelaySwitch(SiteRelayEntity, SwitchEntity):
    def __init__(self, coordinator, entry_id, url, toggle: dict) -> None:
        super().__init__(coordinator, entry_id, url)
        self._id = toggle["id"]
        self._attr_name = toggle["label"]
        self._attr_unique_id = f"{entry_id}_switch_{self._id}"
        self._optimistic: bool = bool(toggle.get("enabled", False))

    @property
    def is_on(self) -> bool:
        for t in self._state().get("toggles", []):
            if t["id"] == self._id:
                return bool(t.get("enabled", False))
        return self._optimistic

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._optimistic = True
        await self._send(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._optimistic = False
        await self._send(False)

    async def _send(self, on: bool) -> None:
        toggles = self._state().get("toggles", [])
        updated = [
            {**t, "enabled": on} if t["id"] == self._id else t for t in toggles
        ]
        await self.coordinator.async_send_command({"toggles": updated})
        self.async_write_ha_state()
