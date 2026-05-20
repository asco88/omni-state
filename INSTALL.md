# SiteRelay — Installation Guide

SiteRelay is a personal server dashboard that shows live system metrics and smart-home controls in a cloud-hosted UI. It has two parts:

- **Cloud UI** — a Next.js app deployed on Vercel (free tier works fine)
- **Server agent** — two Python scripts that run on your home server (Linux / Ubuntu)

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu/Debian server on your LAN | Raspberry Pi works too |
| Python 3.10+ | `python3 --version` |
| pip3 | `sudo apt install python3-pip` |
| Vercel account | [vercel.com](https://vercel.com) — free |
| Home Assistant (optional) | For smart-home integration |

---

## Step 1 — Deploy the Cloud UI

1. Fork or clone this repo to your machine.
2. Inside the `web/` directory, deploy to Vercel:

   ```bash
   cd web
   npm install
   npx vercel          # follow prompts to link/create the project
   npx vercel --prod   # deploy to production
   ```

3. Note the production URL shown at the end (e.g. `https://siterelay.vercel.app`).

> You only do this once. After that, `npx vercel --prod` redeploys in ~30 s.

---

## Step 2 — Get a Home Assistant Token (optional)

Skip this section if you don't use Home Assistant.

1. In the HA web UI, click your **profile picture** (bottom-left).
2. Scroll to **Security → Long-Lived Access Tokens**.
3. Click **Create Token**, give it a name (e.g. "SiteRelay"), and copy the token.

   > The token is shown only once — save it somewhere safe.

4. Note your HA local URL (e.g. `http://10.0.0.173:8123` or `http://homeassistant.local:8123`).

---

## Step 3 — Run the Setup Script on Your Server

Copy the project files to your server:

```bash
# From your dev machine
rsync -az --exclude='node_modules' --exclude='.git' \
  /path/to/siterelay/ user@your-server:~/siterelay/
```

SSH into your server and run the guided installer:

```bash
ssh user@your-server
cd ~/siterelay
bash setup.sh
```

The script will ask for three things:

| Prompt | Example value |
|--------|---------------|
| Vercel URL | `https://siterelay.vercel.app` |
| HA URL | `http://homeassistant.local:8123` |
| HA Token | `eyJhbGci...` (from Step 2) |

It then:
- Writes `config.json` with your settings
- Installs Python dependencies (`watchdog`, `requests`)
- Registers and starts two systemd services (`real-sensors`, `siterelay`)

That's it. Open your Vercel URL — data should appear within 10 seconds.

---

## What runs on the server

| Service | Script | Role |
|---------|--------|------|
| `real-sensors` | `real_sensors.py` | Reads CPU/memory/disk/network every 5 s; pulls HA sensor states |
| `siterelay` | `agent.py` | Watches for file changes and syncs them to Vercel KV; relays UI commands to HA |

Both services start automatically on boot and restart on failure.

---

## Configuration

All settings live in `config.json` in the project directory:

```json
{
  "vercel_url": "https://your-project.vercel.app",
  "ha_url":     "http://homeassistant.local:8123",
  "ha_token":   "YOUR_LONG_LIVED_ACCESS_TOKEN"
}
```

Re-run `bash setup.sh` any time to update values. Environment variables (`OMNISTATE_URL`, `HA_URL`, `HA_TOKEN`) override `config.json` if set.

---

## Home Assistant Integration

Once connected, SiteRelay automatically:

- **Pulls** solar power, battery level, and any other sensors you configure
- **Reflects** all switch/light/input_boolean states in real time
- **Pushes** server metrics (CPU, memory, disk, network) back to HA as virtual sensors (`sensor.siterelay_*`)
- **Controls** switches and lights bidirectionally from the dashboard
- **Triggers** HA automations via remote action buttons

To browse and pin HA devices to your dashboard, click the **🔌 Integrations** button in the top-right of the UI.

---

## Troubleshooting

**No data in the UI**
```bash
journalctl -u siterelay -n 50
# Look for: "OMNISTATE_URL is not set" or connection errors
```

**HA devices not appearing**
```bash
journalctl -u real-sensors -n 50
# Look for: "HA get_all_states" errors
# Verify: curl -s http://YOUR_HA_URL/api/ -H "Authorization: Bearer YOUR_TOKEN"
```

**Switches not responding**
- Check `journalctl -u siterelay -f` for HA service call errors
- Confirm the HA token has not expired (create a new one if needed)

**Services not starting after reboot**
```bash
sudo systemctl status real-sensors siterelay
sudo systemctl enable real-sensors siterelay   # if not already enabled
```

---

## Updating

Pull the latest code and re-run setup:

```bash
git pull
bash setup.sh   # re-registers services; your config.json is preserved
```

To redeploy the UI:

```bash
cd web
npx vercel --prod
```
