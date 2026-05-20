from __future__ import annotations

import logging
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


class OmniStateCoordinator(DataUpdateCoordinator):
    def __init__(self, hass: HomeAssistant, url: str, token: str) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=SCAN_INTERVAL),
        )
        self._url = url.rstrip("/")
        self._token = token
        self._session = async_get_clientsession(hass)

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}"}

    async def _async_update_data(self) -> dict:
        try:
            async with self._session.get(
                f"{self._url}/api/get-state",
                headers=self._headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                return await resp.json()
        except aiohttp.ClientResponseError as err:
            raise UpdateFailed(f"Auth error ({err.status}): check your API token") from err
        except Exception as err:
            raise UpdateFailed(f"Cannot reach OmniState at {self._url}: {err}") from err

    async def async_send_command(self, payload: dict) -> None:
        try:
            async with self._session.post(
                f"{self._url}/api/set-desired-state",
                headers={**self._headers, "Content-Type": "application/json"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to send OmniState command: %s", err)
