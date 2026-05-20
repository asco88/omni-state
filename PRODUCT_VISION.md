# SiteRelay — Product Vision

## What It Is

SiteRelay is an open-source remote monitoring and control platform that works at any scale — from a single Raspberry Pi at home to a fleet of on-premises servers across multiple company sites.

It gives you a single dashboard, accessible from anywhere, that shows the live state of every connected server and device. Agents run on each machine and push state outward through the cloud. No inbound ports, no VPN, no firewall changes — the attack surface is zero on the server side.

### Two audiences, one product

**Self-hosters and home users**
A single web page that shows your home server, Home Assistant entities, solar data, and running services — accessible from your phone while you're away. Free, no credit card, sign in with Google.

**Small and medium businesses**
Aggregate multiple on-premises servers or branch office machines into a single pane of glass. Operations teams can monitor health, trigger automations, and control services remotely — without exposing any machine directly to the internet. The cloud acts purely as a relay; credentials and commands never leave the encrypted channel.

---

## User Journey

### 1. Discovery
A user finds SiteRelay on GitHub, the Home Assistant community forum, or HACS. The public landing page shows a live demo, key features, and a "Get Started Free" button. The GitHub repo is open so they can read the code before trusting it.

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
1. Open HACS → Custom Repositories → add the SiteRelay repo URL
2. Install the SiteRelay integration from HACS
3. Restart Home Assistant

**Option B — Manual**
```bash
curl -sL https://siterelay.vercel.app/install.sh | bash
```
*(or copy the `custom_components/siterelay/` folder into HA's config directory)*

### 6. Generate a Token
Before finishing the guide, the app shows a **Generate Token** button. One click produces a unique integration token. The user copies it — they'll need it on the HA side.

### 7. Connect in Home Assistant
In HA → Settings → Integrations → Add → SiteRelay, the user pastes:
- Dashboard URL: `https://siterelay.vercel.app`
- Token: *(the token they just generated)*

HA validates the token and creates all entities automatically.

### 8. Live Dashboard
The user returns to SiteRelay. Their integration now shows as connected, with a card for each entity — sensors, binary sensors, switches, and action buttons. Everything updates in real time.

---

## Design Principles

- **Zero inbound exposure** — agents push state out; nothing listens for inbound connections. No open ports, no VPN, no dynamic DNS. The security model is the same whether it's a home lab or a corporate branch office.
- **Privacy first** — the server agent only pushes what you configure; no telemetry, no black box. Self-host the whole stack if you need data sovereignty.
- **Scale-agnostic** — the same agent and the same dashboard work for one machine or a hundred. Multi-site aggregation is a first-class concern, not an afterthought.
- **Open contribution** — integrations are modular; the community can add new machine types, sensors, and control surfaces via PRs.
- **Free tier first** — basic real-time sync forever free; enterprise features (multi-user access, audit logs, SSO) on a paid tier.

---

## Roadmap (rough order)

### Consumer / self-hoster tier
1. ✅ Public landing page
2. ✅ Empty-state onboarding flow and integration wizard
3. ✅ HACS store listing (PR submitted)
4. ✅ Custom Server integration (Python agent, guided installer)
5. Multiple integrations per user account (HA + server simultaneously)
6. Notification rules (offline alerts, threshold triggers)
7. Additional integrations (Proxmox, Synology, Pi-hole, etc.)

### Enterprise tier
8. Multi-site dashboard — aggregate N servers/sites into one view with per-site status cards
9. Team accounts — shared access, role-based permissions (viewer / operator / admin)
10. Audit log — timestamped record of every command sent and by whom
11. SSO / SAML — sign in with company identity provider
12. Self-hosted deployment guide — full Docker Compose stack for air-gapped environments
13. SLA-grade uptime and support tiers

### Platform
14. Rename / rebrand to domain-neutral name (decision pending)
15. Plugin/SDK — documented interface for community-contributed integrations
16. CLI — `siterelay status`, `siterelay run <action>` for scripting and CI pipelines
