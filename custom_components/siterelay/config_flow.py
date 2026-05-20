from __future__ import annotations

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_URL, CONF_TOKEN


class SiteRelayConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            token = user_input[CONF_TOKEN].strip()
            try:
                session = async_get_clientsession(self.hass)
                async with session.get(
                    f"{url}/api/get-state",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        await self.async_set_unique_id(url)
                        self._abort_if_unique_id_configured()
                        return self.async_create_entry(
                            title="SiteRelay",
                            data={CONF_URL: url, CONF_TOKEN: token},
                        )
                    if resp.status == 401:
                        errors[CONF_TOKEN] = "invalid_auth"
                    else:
                        errors["base"] = "cannot_connect"
            except aiohttp.ClientConnectorError:
                errors["base"] = "cannot_connect"
            except Exception:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_URL, default="https://siterelay.app"): str,
                    vol.Required(CONF_TOKEN): str,
                }
            ),
            errors=errors,
        )
