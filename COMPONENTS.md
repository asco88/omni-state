# OmniState UI Components

All components live in `web/app/page.tsx`. They read from `sensors.json` (via KV) and write desired state back through the same KV layer.

---

## Data types

| Type | Fields | Source |
|------|--------|--------|
| `Sensor` | `id, label, value, unit, min, max` | `sensors.json → sensors[]` |
| `Toggle` | `id, label, enabled` | `sensors.json → toggles[]` |
| `Slider` | `id, label, value, min, max, unit` | `sensors.json → sliders[]` |
| `FileGroup` | `id, label, items: FileItem[]` | `sensors.json → files[]` |
| `Service` | `id, label, active` | `sensors.json → services[]` |
| `Action` | `id, label, last_triggered?` | `sensors.json → actions[]` |
| `HaDevice` | `id, name, state, unit?, media_title?, media_artist?, volume?, brightness?` | `sensors.json → ha_devices[group][]` |
| `HaDevices` | `Record<group, HaDevice[]>` — groups: `switches, lights, media, binary_sensors, sensors` | agent → real_sensors.py |

---

## Dashboard sections

Sections appear in the order stored in `OmniStyle.sectionOrder`. Each section is wrapped in `SortableSection` (drag to reorder).

| Section key | Label | Component rendered |
|-------------|-------|--------------------|
| `sensors` | Sensors | `SensorCard` grid |
| `controls` | Controls | `ToggleSwitch` + `VolumeSlider` grid |
| `files` | Files | `FileCard` |
| `actions` | Automations | `ActionButton` grid |
| `services` | Services | `ServicesCard` |
| `devices` | HA Devices | `HaDeviceBrowser` (pinned only) |

---

## Component reference

### `SensorCard`
Displays a numeric metric with a colored progress bar.

```
sensors.json → sensors[]
{ id, label, value, unit, min, max }
```

- Value color: green < 60 %, yellow < 80 %, red ≥ 80 %
- Icon lookup via `SENSOR_ICONS[id]` (falls back to 📊)
- Drag-to-reorder within the sensors grid
- **To add**: push a new object into `sensors[]` in `sensors.json`

---

### `ToggleSwitch`
On/off toggle that sends `enabled` back to the server.

```
sensors.json → toggles[]
{ id, label, enabled }
```

- Optimistic UI — flips immediately, reverts if server doesn't confirm within 15 s
- Drag-to-reorder within the controls grid
- **To add**: push a new object into `toggles[]` in `sensors.json`

---

### `VolumeSlider`
Full-width range slider for any numeric value.

```
sensors.json → sliders[]
{ id, label, value, min, max, unit }
```

- Optimistic UI — updates on pointer-up, reverts if unconfirmed after 15 s
- Color matches value ratio (same green/yellow/red thresholds as SensorCard)
- Spans 2 columns
- **To add**: push a new object into `sliders[]` in `sensors.json`

---

### `FileCard`
Read-only file browser listing names and sizes.

```
sensors.json → files[]
{ id, label, items: [{ name, size, modified }] }
```

- Scrollable, max height 192 px
- Spans 2 columns
- **To add**: push a new FileGroup into `files[]`; populate `items` from the agent

---

### `ActionButton`
Trigger button for one-shot automations (e.g. "All lights off").

```
sensors.json → actions[]
{ id, label, last_triggered? }
```

- Flashes accent color + "Triggered!" for 2 s after click
- Shows last trigger time when idle
- Agent reads the updated `last_triggered` timestamp and runs the corresponding logic
- **To add**: push a new object into `actions[]`; handle `action.id` in `agent.py`

---

### `ServicesCard`
Status grid of named system services (active / inactive).

```
sensors.json → services[]
{ id, label, active }
```

- Green dot = active, red dot = inactive
- Spans 2 columns, hidden when `services[]` is empty
- **To add**: push objects into `services[]`; set `active` from systemd/process checks in agent

---

### `DeviceRow`
Single HA entity row used inside both the dashboard and the integrations panel.

Props:
- `dev: HaDevice` — entity data
- `group: string` — domain key (`switches`, `lights`, `media`, `binary_sensors`, `sensors`)
- `onCommand(id, service)` — called when toggle is flipped
- `pinned?` / `onTogglePin?` — shows ★/☆ pin button when provided
- `customName?` — replaces `dev.name` in display
- `showOriginalName?` — appends `(OriginalName)` in small text when renamed

Behaviour by group:
- `switches` / `lights` → renders a toggle (calls `turn_on` / `turn_off`)
- `media` → read-only badge + media title/artist subtitle
- `binary_sensors` / `sensors` → read-only state badge with unit

---

### `HaDeviceBrowser`
Renders a set of `DeviceRow` items grouped by HA domain.

```
sensors.json → ha_devices
{ switches: HaDevice[], lights: HaDevice[], media: HaDevice[], ... }
```

- Used on the dashboard with only pinned devices (`filterPinnedDevices`)
- Used in `IntegrationsPanel` with all devices
- Shows "No devices" / `emptyHint` when empty
- **To populate**: `real_sensors.py → fetch_ha_devices()` groups HA entities by domain

---

### `IntegrationsPanel`
Slide-in right drawer (width 384 px) listing all available integrations.

Currently shows **Home Assistant**:
- Entity count + pinned count
- Per-domain device groups with `DeviceRow` (pin + rename per entity)
- Inline rename: click ✎ → type → Enter/Save commits, ✕ clears rename, Escape cancels
- Renamed name saved in `OmniStyle.deviceNames`, pinned IDs in `OmniStyle.pinnedDevices`

Opened via the 🔌 button in the header. Badge shows pinned device count.

**To add a new integration**: add a new section inside the panel's scrollable body, styled to match the HA card pattern.

---

### `SettingsPanel`
Slide-in right drawer (width 288 px) for appearance settings.

Controls:
- **Theme** — `dark` / `light` (CSS variable swap via `data-theme` attribute)
- **Accent color** — 8 presets, stored in `OmniStyle.accent`
- **Font** — `sans` / `mono`

All changes call `pushStyle()` and persist to KV.

---

## Style persistence (`OmniStyle`)

```ts
{
  theme: "dark" | "light"
  accent: string            // hex color
  font: "sans" | "mono"
  sectionOrder: string[]    // dashboard section order
  cardOrder: Record<string, string[]>  // per-section card order
  pinnedDevices: string[]   // HA entity IDs pinned to dashboard
  deviceNames: Record<string, string>  // entity_id → custom name
}
```

- Saved to KV via `POST /api/set-style`
- Agent polls `GET /api/get-style?desired=1` and writes to `omni-state-style.json`
- Dashboard reads `GET /api/get-style` on load

---

## CSS variables

Set on `<html>` based on `data-theme`:

| Variable | Role |
|----------|------|
| `--bg-app` | Page background |
| `--bg-card` | Card / panel background |
| `--bg-input` | Input / muted surface |
| `--border` | Border color |
| `--text-1` | Primary text |
| `--text-2` | Secondary text |
| `--text-3` | Muted / label text |
| `--accent` | Accent color (set inline from `OmniStyle.accent`) |

---

## Adding a new section (checklist)

1. Add an entry to `sensors.json` (new array key)
2. Add the TypeScript type to `SensorsState` in `page.tsx`
3. Add the section key + label to `SECTION_LABELS`
4. Add the key to `DEFAULT_STYLE.sectionOrder`
5. Render the section inside the `sectionOrder.map()` block
6. Handle the new data in `agent.py` / `real_sensors.py` if it comes from a live source
