from __future__ import annotations

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import OmniStateCoordinator


class OmniStateEntity(CoordinatorEntity[OmniStateCoordinator]):
    """Base entity: provides shared device_info and state helpers."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: OmniStateCoordinator, entry_id: str, url: str) -> None:
        super().__init__(coordinator)
        self._entry_id = entry_id
        self._url = url

    @property
    def device_info(self) -> dict:
        return {
            "identifiers": {(DOMAIN, self._entry_id)},
            "name": "OmniState",
            "manufacturer": "OmniState",
            "model": "Server Dashboard",
            "configuration_url": self._url,
        }

    def _state(self) -> dict:
        return (self.coordinator.data or {}).get("state") or {}
