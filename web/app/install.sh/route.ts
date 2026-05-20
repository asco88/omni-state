import { NextResponse } from "next/server";

const SCRIPT = `#!/usr/bin/env bash
set -e

REPO="https://github.com/asco88/omni-state"
INSTALL_DIR="\$HOME/omni-state"
SERVICE="omnistate"

echo ""
echo "  OmniState Agent Installer"
echo "  ─────────────────────────"
echo ""

# ── Dependencies ──────────────────────────────────────────────────────────────

echo "Checking dependencies..."
python3 --version >/dev/null 2>&1 || { echo "Error: python3 not found"; exit 1; }
pip3 install --quiet requests psutil
echo "Dependencies OK"

# ── Clone / update repo ───────────────────────────────────────────────────────

if [ -d "\$INSTALL_DIR/.git" ]; then
  echo "Updating existing install at \$INSTALL_DIR..."
  git -C "\$INSTALL_DIR" pull --quiet
else
  echo "Cloning repo to \$INSTALL_DIR..."
  git clone --quiet "\$REPO" "\$INSTALL_DIR"
fi

cd "\$INSTALL_DIR"

# ── Config ────────────────────────────────────────────────────────────────────

if [ ! -f config.json ]; then
  cp config.json.example config.json
fi

DASHBOARD_URL="\${OMNISTATE_URL:-https://omni-state.vercel.app}"

# Prompt for token if not set
if [ -z "\$OMNISTATE_TOKEN" ]; then
  echo ""
  printf "Paste your OmniState token (from the onboarding wizard): "
  read -r OMNISTATE_TOKEN
fi

# Write minimal config
python3 - <<PYEOF
import json, os
path = "config.json"
with open(path) as f:
    cfg = json.load(f)
cfg["vercel_url"] = os.environ.get("OMNISTATE_URL", "https://omni-state.vercel.app")
cfg["api_key"]    = os.environ.get("OMNISTATE_TOKEN", "")
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF

# Inject the token we read
python3 -c "
import json
with open('config.json') as f: cfg = json.load(f)
cfg['api_key'] = '$OMNISTATE_TOKEN'
cfg['vercel_url'] = '$DASHBOARD_URL'
with open('config.json', 'w') as f: json.dump(cfg, f, indent=2)
"

echo "Config written."

# ── Systemd service ───────────────────────────────────────────────────────────

if command -v systemctl >/dev/null 2>&1; then
  SERVICE_FILE="/etc/systemd/system/\$SERVICE.service"
  sudo tee "\$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=OmniState Agent
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=\$INSTALL_DIR
ExecStart=/usr/bin/python3 \$INSTALL_DIR/agent.py
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable --quiet "\$SERVICE"
  sudo systemctl restart "\$SERVICE"

  echo ""
  echo "  Service '\$SERVICE' is running."
  echo "  Logs: journalctl -u \$SERVICE -f"
else
  echo ""
  echo "  systemd not found — starting agent directly."
  echo "  Run 'python3 \$INSTALL_DIR/agent.py' to start."
fi

echo ""
echo "  Done! Return to the OmniState dashboard and click 'I\\'ve started the agent'."
echo ""
`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "inline; filename=install.sh",
    },
  });
}
