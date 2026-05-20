# OmniState — Product Vision

## What It Is

OmniState is a free, open-source remote dashboard for self-hosters. It gives you a single web page — accessible from anywhere — that shows the live state of your home server, Home Assistant instance, and connected devices. No port forwarding, no VPN, no cloud subscription required for the core experience.

---

## User Journey

### 1. Discovery
A user finds OmniState on GitHub, the Home Assistant community forum, or HACS. The public landing page shows a live demo, key features, and a "Get Started Free" button. The GitHub repo is open so they can read the code before trusting it.

### 2. Sign Up
They sign in with Google. No forms, no credit card. They land on their personal dashboard for the first time.

### 3. Empty State
The dashboard greets them with:
> "You have no integrations yet. Add your first one to get started."

A prominent button opens the integration wizard.

### 4. Choose an Integration
The wizard shows a list of available integration types:
- **Home Assistant** — sync entities, sensors, and controls directly from HA
- **Custom Server** — run a lightweight Python agent on any Linux machine
- *(More integrations in the future)*

### 5. Follow the Setup Guide
After selecting Home Assistant, the app shows a step-by-step guide:

**Option A — HACS (recommended)**
1. Open HACS → Custom Repositories → add the OmniState repo URL
2. Install the OmniState integration from HACS
3. Restart Home Assistant

**Option B — Manual**
```bash
curl -sL https://omni-state.vercel.app/install.sh | bash
```
*(or copy the `custom_components/omnistate/` folder into HA's config directory)*

### 6. Generate a Token
Before finishing the guide, the app shows a **Generate Token** button. One click produces a unique integration token. The user copies it — they'll need it on the HA side.

### 7. Connect in Home Assistant
In HA → Settings → Integrations → Add → OmniState, the user pastes:
- Dashboard URL: `https://omni-state.vercel.app`
- Token: *(the token they just generated)*

HA validates the token and creates all entities automatically.

### 8. Live Dashboard
The user returns to OmniState. Their integration now shows as connected, with a card for each entity — sensors, binary sensors, switches, and action buttons. Everything updates in real time.

---

## Design Principles

- **Privacy first** — the server agent only pushes what you configure; no telemetry
- **Self-hostable** — the whole stack (Next.js + Upstash) can be self-hosted; the agent is a single Python file
- **Open contribution** — integrations are modular; the community can add new ones via PRs
- **Free tier first** — basic real-time sync, up to X entities, forever free

---

## Roadmap (rough order)

1. Public landing page with demo/screenshots
2. Empty-state onboarding flow and integration wizard
3. Token management UI (generate, revoke, label)
4. Multiple integrations per user account
5. HACS store listing (requires public repo)
6. Custom Server integration (Python agent guide in-app)
7. Notification rules (e.g. alert when server goes offline)
8. Additional integrations (Proxmox, Synology, etc.)
