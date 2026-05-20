# Home Assistant Integration

OmniState connects to Home Assistant over your local network using its built-in REST API. No add-ons, no HACS, no custom components required.

---

## What you need

- Home Assistant running on your LAN (any installation method)
- A **Long-Lived Access Token** from HA (see Step 1)
- The **local URL** of your HA instance (e.g. `http://homeassistant.local:8123`)

The server running OmniState must be able to reach HA over the network. If they're on the same LAN this just works.

---

## Step 1 — Create an access token

1. Open Home Assistant in your browser
2. Click your **profile picture** in the bottom-left
3. Scroll down to **Security → Long-Lived Access Tokens**
4. Click **Create Token**, give it a name like `OmniState`, and copy the token

> The token is shown only once. Keep it somewhere safe.

To verify the token works, run this from your server (replace the values):

```bash
curl -s http://homeassistant.local:8123/api/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | python3 -m json.tool
```

You should see `{"message": "API running."}`.

---

## Step 2 — Add to config.json

Open `config.json` in the OmniState directory and add your HA URL and token:

```json
{
  "vercel_url": "https://your-project.vercel.app",
  "api_key":    "...",

  "ha_url":   "http://homeassistant.local:8123",
  "ha_token": "eyJhbGci..."
}
```

Then restart the services:

```bash
sudo systemctl restart real-sensors omnistate
```

That's it — the integration is live. Check logs to confirm:

```bash
journalctl -u real-sensors -f
# should show: Home Assistant integration enabled — http://...
```

---

## What you get immediately

Once connected, OmniState automatically:

- **Discovers all your entities** — every switch, light, sensor, media player, binary sensor, and input boolean
- **Shows live states** — updated every 5 seconds
- **Lets you control devices** — toggle switches and lights directly from the dashboard

To access this, click **Integrations** (🔌) in the top-right of the dashboard. You'll see all your HA entities grouped by type. Click any device to control it. Click the pin icon to add it to your main dashboard as a persistent card.

---

## Optional: Sensor bar charts

To pull specific HA sensor values into the Sensors section (the progress bars at the top of the dashboard), add an `ha_sensors` array to `config.json`:

```json
"ha_sensors": [
  {
    "id":     "solar_power",
    "entity": "sensor.solaredge_current_power",
    "label":  "Solar Power",
    "unit":   "kW",
    "min":    0,
    "max":    12
  },
  {
    "id":     "solar_battery",
    "entity": "sensor.solaredge_storage_level",
    "label":  "Solar Battery",
    "unit":   "%",
    "min":    0,
    "max":    100
  }
]
```

**How to find your entity IDs:** In HA, go to **Settings → Devices & Services → Entities**, search for the sensor name, and copy the Entity ID (e.g. `sensor.living_room_temperature`).

---

## Built-in: OmniState status sensor

Whenever the OmniState agent is running and connected to Home Assistant, it automatically pushes a `sensor.omnistate_status` entity. No configuration needed.

In HA, go to **Settings → Devices & Services → Entities** and search for `omnistate_status`. You'll see:

| Attribute | Value |
|-----------|-------|
| State | `online` |
| `last_seen` | ISO timestamp of last update |
| `last_updated` | HA's internal timestamp (when it last received data) |

> **Important:** HA's virtual sensor injection does not auto-expire — the sensor stays at `online` even after the agent stops. Use the `last_updated` attribute or the template below to detect actual downtime.

### Alert when OmniState goes offline

Create a HA automation that notifies you if the agent hasn't checked in for more than 2 minutes:

```yaml
alias: OmniState offline alert
trigger:
  - platform: template
    value_template: >
      {{ (now().timestamp() - state_attr('sensor.omnistate_status', 'last_seen')
          | as_datetime | as_timestamp) > 120 }}
action:
  - service: notify.notify
    data:
      message: "OmniState agent has been offline for more than 2 minutes."
```

Or add it to a HA dashboard card to see freshness at a glance:

```yaml
type: entity
entity: sensor.omnistate_status
name: OmniState
secondary_info: last-updated
```

---

## Optional: Named toggle controls

To expose specific switches or input_booleans as named toggle controls in the Controls section, add `ha_switches`:

```json
"ha_switches": [
  { "id": "garden_lights", "label": "Garden Lights", "entity": "switch.garden_lights"         },
  { "id": "entry_light",   "label": "Entry Light",   "entity": "input_boolean.entry_light"    },
  { "id": "fans",          "label": "Ceiling Fans",  "entity": "switch.ceiling_fans"          }
]
```

Supported entity types: `switch.*`, `light.*`, `input_boolean.*`

---

## Optional: Automation / script buttons

To expose HA automations or scripts as one-tap action buttons in the Automations section, add `ha_actions`:

```json
"ha_actions": [
  { "id": "all_off",   "label": "All Lights OFF", "entity": "automation.turn_all_lights_off"    },
  { "id": "goodnight", "label": "Goodnight",      "entity": "script.goodnight_routine"          },
  { "id": "movie",     "label": "Movie Mode",     "entity": "automation.activate_movie_mode"    }
]
```

Supported entity types: `automation.*` (triggers the automation), `script.*` (runs the script)

---

## Optional: Push server metrics back to HA

OmniState can push your server's CPU, memory, disk, and network usage back into Home Assistant as virtual sensor entities. This lets you use them in HA dashboards, automations, and alerts.

Add `ha_push` to `config.json`:

```json
"ha_push": [
  { "metric": "cpu",    "entity": "sensor.omnistate_cpu",    "label": "Server CPU",     "unit": "%",    "icon": "mdi:cpu-64-bit" },
  { "metric": "memory", "entity": "sensor.omnistate_memory", "label": "Server Memory",  "unit": "%",    "icon": "mdi:memory"     },
  { "metric": "disk",   "entity": "sensor.omnistate_disk",   "label": "Server Disk",    "unit": "%",    "icon": "mdi:harddisk"   },
  { "metric": "net_rx", "entity": "sensor.omnistate_net_rx", "label": "Server Network", "unit": "KB/s", "icon": "mdi:network"    }
]
```

The entities appear in HA automatically (no restart needed) and update every 5 seconds. Available `metric` values: `cpu`, `memory`, `disk`, `net_rx`.

---

## Full example config.json

```json
{
  "vercel_url": "https://your-project.vercel.app",
  "api_key":    "your-api-key",

  "ha_url":   "http://homeassistant.local:8123",
  "ha_token": "eyJhbGci...",

  "ha_sensors": [
    { "id": "solar_power",   "entity": "sensor.solaredge_current_power", "label": "Solar Power",   "unit": "kW", "min": 0, "max": 12  },
    { "id": "solar_battery", "entity": "sensor.solaredge_storage_level", "label": "Solar Battery", "unit": "%",  "min": 0, "max": 100 }
  ],

  "ha_switches": [
    { "id": "garden", "label": "Garden Lights", "entity": "switch.garden_lights"      },
    { "id": "entry",  "label": "Entry Light",   "entity": "input_boolean.entry_light" }
  ],

  "ha_actions": [
    { "id": "all_off",   "label": "All Lights OFF", "entity": "automation.turn_all_lights_off" },
    { "id": "goodnight", "label": "Goodnight",      "entity": "script.goodnight_routine"       }
  ],

  "ha_push": [
    { "metric": "cpu",    "entity": "sensor.omnistate_cpu",    "label": "Server CPU",    "unit": "%",    "icon": "mdi:cpu-64-bit" },
    { "metric": "memory", "entity": "sensor.omnistate_memory", "label": "Server Memory", "unit": "%",    "icon": "mdi:memory"     },
    { "metric": "disk",   "entity": "sensor.omnistate_disk",   "label": "Server Disk",   "unit": "%",    "icon": "mdi:harddisk"   },
    { "metric": "net_rx", "entity": "sensor.omnistate_net_rx", "label": "Server Network","unit": "KB/s", "icon": "mdi:network"    }
  ]
}
```

After any config change:

```bash
sudo systemctl restart real-sensors omnistate
```

---

## Troubleshooting

**Token test fails:**
```bash
curl -v http://homeassistant.local:8123/api/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- `401` — token is wrong or expired, create a new one
- `Connection refused` — wrong URL or HA is down
- No response — server can't reach HA (check network/firewall)

**Devices not appearing in the Integrations panel:**
```bash
journalctl -u real-sensors -n 50 | grep -i "ha\|error"
```

**Switches not responding to dashboard commands:**
```bash
journalctl -u omnistate -f
# look for lines starting with "HA switch" or "HA service"
```

**HA sensors not updating:**

Confirm the entity ID is exact (case-sensitive, underscores not dashes):
```bash
curl -s http://homeassistant.local:8123/api/states/sensor.your_entity_id \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```
