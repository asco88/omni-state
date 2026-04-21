# OmniState

Stateful relay — sync local app state to a cloud dashboard without port forwarding.

```
[Ubuntu server]  →  POST /api/update-state  →  [Vercel + Upstash KV]  →  [Browser dashboard]
```

## Project layout

```
omni-state/
├── web/          # Next.js app (deploy to Vercel)
├── agent.py      # Python watcher (run on home server)
├── data.json     # File the agent watches
└── README.md
```

---

## Part 1 — Deploy the cloud UI to Vercel

### Prerequisites

- Node 18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

### Steps

```bash
cd web
vercel link          # link to your Vercel project
vercel env pull .env.local   # pull KV credentials
npm install
npm run dev          # preview locally at http://localhost:3000
vercel --prod        # deploy to production
```

The Upstash KV store is provisioned automatically via the Vercel integration.  
If it's missing, run: `vercel integration add upstash-kv`

---

## Part 2 — Run the Python agent on the home server

### Prerequisites

```bash
pip install watchdog requests
```

### Run

```bash
export OMNISTATE_URL=https://<your-vercel-deployment>.vercel.app
python agent.py
```

Optional — change the watched file:

```bash
export OMNISTATE_FILE=/path/to/your/data.json
```

### Run as a systemd service (Ubuntu)

Create `/etc/systemd/system/omnistate.service`:

```ini
[Unit]
Description=OmniState Agent
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/omni-state
Environment="OMNISTATE_URL=https://<your-vercel-deployment>.vercel.app"
ExecStart=/usr/bin/python3 /home/ubuntu/omni-state/agent.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable omnistate
sudo systemctl start omnistate
sudo journalctl -u omnistate -f   # follow logs
```

---

## How it works

| Component | Behaviour |
|-----------|-----------|
| `agent.py` | Watches `data.json` with `watchdog`. On change, POSTs JSON to `/api/update-state`. Every 30 s sends `{"type":"heartbeat"}` to the same endpoint. |
| `/api/update-state` | Writes payload + timestamp to Upstash KV. Heartbeats update `server_last_seen`. |
| `/api/get-state` | Returns current state + timestamps. Server is "Offline" if last heartbeat > 60 s ago. |
| Dashboard | Polls `/api/get-state` every 5 s, shows state, last-updated time, and server online/offline indicator. |

No inbound ports are required on the home server.
