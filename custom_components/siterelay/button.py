from __future__ import annotations

import time

from homeassistant.components.button import ButtonEntity
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
        SiteRelayButton(coordinator, entry.entry_id, url, action)
        for action in (coordinator.data or {}).get("state", {}).get("actions", [])
    ]
    async_add_entities(entities)


class SiteRelayButton(SiteRelayEntity, ButtonEntity):
    def __init__(self, coordinator, entry_id, url, action: dict) -> None:
        super().__init__(coordinator, entry_id, url)
        self._id = action["id"]
        self._attr_name = action["label"]
        self._attr_unique_id = f"{entry_id}_action_{self._id}"

    async def async_press(self) -> None:
        actions = self._state().get("actions", [])
        now_ms = int(time.time() * 1000)
        updated = [
            {**a, "last_triggered": now_ms} if a["id"] == self._id else a
            for a in actions
        ]
        await self.coordinator.async_send_command({"actions": updated})
