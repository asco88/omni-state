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
  python3 -c "import json,sys; d=json.load(open('$CONFIG')) if __import__('os').path.exists('$CONFIG') else {}; print(d.get('$1',''))" 2>/dev/null || true
}

default_vercel=$(read_cfg vercel_url)
default_ha_url=$(read_cfg ha_url)
default_ha_token=$(read_cfg ha_token)

[ -z "$default_ha_url" ] && default_ha_url="http://homeassistant.local:8123"

# ── 2. Prompt for values ──────────────────────────────────────────────────────

say "Step 1/4 — Vercel deployment URL"
echo "  This is the URL of your OmniState Vercel app."
echo "  Deploy first (see INSTALL.md) if you haven't already."
read -rp "  Vercel URL [$default_vercel]: " vercel_url
vercel_url="${vercel_url:-$default_vercel}"
vercel_url="${vercel_url%/}"   # strip trailing slash

echo ""
say "Step 2/4 — Home Assistant URL"
echo "  The local network address of your HA instance."
read -rp "  HA URL [$default_ha_url]: " ha_url
ha_url="${ha_url:-$default_ha_url}"

echo ""
say "Step 3/4 — Home Assistant Long-Lived Access Token"
echo "  In HA: Profile → Security → Long-Lived Access Tokens → Create Token."
echo "  Leave blank to skip HA integration."
if [ -n "$default_ha_token" ]; then
  read -rp "  HA Token [keep existing]: " ha_token
  ha_token="${ha_token:-$default_ha_token}"
else
  read -rp "  HA Token: " ha_token
fi

# ── 3. Write config.json ──────────────────────────────────────────────────────

echo ""
say "Step 4/4 — Writing config and installing services"

python3 - <<PYEOF
import json, pathlib
cfg = {
    "vercel_url": "$vercel_url",
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
echo "═══════════════════════════════════════"
ok "OmniState is running!"
echo ""
echo "  Dashboard : $vercel_url"
echo "  HA        : $ha_url"
echo "  Config    : $CONFIG"
echo ""
echo "  Check logs:"
echo "    journalctl -u omnistate -f"
echo "    journalctl -u real-sensors -f"
echo "═══════════════════════════════════════"
echo ""
