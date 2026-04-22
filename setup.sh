#!/usr/bin/env bash
# OmniState setup — installs dependencies, writes config, and registers systemd services.
# Run as a normal user (sudo is invoked only where needed).

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$DIR/config.json"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

say()  { echo -e "${CYAN}$*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         OmniState Setup              ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Read existing config so we can show defaults ───────────────────────────

read_cfg() {
  python3 -c "import json,os; d=json.load(open('$CONFIG')) if os.path.exists('$CONFIG') else {}; print(d.get('$1',''))" 2>/dev/null || true
}

default_vercel=$(read_cfg vercel_url)
default_ha_url=$(read_cfg ha_url)
default_ha_token=$(read_cfg ha_token)
default_api_key=$(read_cfg api_key)

[ -z "$default_ha_url" ] && default_ha_url="http://homeassistant.local:8123"

# ── 2. Prompt for values ──────────────────────────────────────────────────────

say "Step 1/5 — Vercel deployment URL"
echo "  This is the URL of your OmniState Vercel app."
echo "  Deploy first (see INSTALL.md) if you haven't already."
read -rp "  Vercel URL [$default_vercel]: " vercel_url
vercel_url="${vercel_url:-$default_vercel}"
vercel_url="${vercel_url%/}"

echo ""
say "Step 2/5 — Home Assistant URL"
echo "  The local network address of your HA instance."
read -rp "  HA URL [$default_ha_url]: " ha_url
ha_url="${ha_url:-$default_ha_url}"

echo ""
say "Step 3/5 — Home Assistant Long-Lived Access Token"
echo "  In HA: Profile → Security → Long-Lived Access Tokens → Create Token."
echo "  Leave blank to skip HA integration."
if [ -n "$default_ha_token" ]; then
  read -rp "  HA Token [keep existing]: " ha_token
  ha_token="${ha_token:-$default_ha_token}"
else
  read -rp "  HA Token: " ha_token
fi

echo ""
say "Step 4/5 — API Key"
if [ -n "$default_api_key" ]; then
  echo "  An API key already exists. Press Enter to keep it, or type a new one."
  read -rp "  API Key [keep existing]: " api_key
  api_key="${api_key:-$default_api_key}"
else
  echo "  Generating a random API key to secure the agent ↔ cloud connection…"
  api_key=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
  echo "  Generated: ${api_key:0:8}…"
fi

# ── 3. Write config.json ──────────────────────────────────────────────────────

echo ""
say "Step 5/5 — Writing config and installing services"

python3 - <<PYEOF
import json, pathlib
cfg = {
    "vercel_url": "$vercel_url",
    "api_key":    "$api_key",
    "ha_url":     "$ha_url",
    "ha_token":   "$ha_token",
}
pathlib.Path("$CONFIG").write_text(json.dumps(cfg, indent=2) + "\n")
print("  config.json written")
PYEOF

# ── 4. Install Python dependencies ────────────────────────────────────────────

echo ""
say "Installing Python dependencies…"
pip3 install --quiet watchdog requests
ok "watchdog + requests installed"

# ── 5. Install systemd services ───────────────────────────────────────────────

echo ""
say "Installing systemd services…"

sudo tee /etc/systemd/system/real-sensors.service > /dev/null <<EOF
[Unit]
Description=OmniState Real Sensor Collector
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
ExecStart=/usr/bin/python3 $DIR/real_sensors.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/omnistate.service > /dev/null <<EOF
[Unit]
Description=OmniState Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
ExecStart=/usr/bin/python3 $DIR/agent.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable real-sensors omnistate
sudo systemctl restart real-sensors omnistate

ok "real-sensors service enabled and started"
ok "omnistate service enabled and started"

# ── 6. Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
ok "OmniState is running!"
echo ""
echo "  Dashboard : $vercel_url"
echo "  HA        : $ha_url"
echo "  Config    : $CONFIG"
echo ""
warn "Add these environment variables to your Vercel project:"
echo ""
echo "  OMNISTATE_API_KEY = $api_key"
echo "  ALLOWED_EMAIL     = your.email@gmail.com"
echo "  AUTH_SECRET       = (run: openssl rand -base64 32)"
echo "  GOOGLE_CLIENT_ID  = (from Google Cloud Console)"
echo "  GOOGLE_CLIENT_SECRET = (from Google Cloud Console)"
echo ""
echo "  See INSTALL.md for step-by-step instructions."
echo ""
echo "  Check logs:"
echo "    journalctl -u omnistate -f"
echo "    journalctl -u real-sensors -f"
echo "═══════════════════════════════════════════════════"
echo ""
