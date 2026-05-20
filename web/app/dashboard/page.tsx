"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ─────────────────────────────────────────────────────────────────────

type Sensor    = { id: string; label: string; value: number; unit: string; min: number; max: number };
type Toggle    = { id: string; label: string; enabled: boolean };
type Slider    = { id: string; label: string; value: number; min: number; max: number; unit: string };
type FileItem  = { name: string; size: number; modified: number };
type FileGroup = { id: string; label: string; items: FileItem[] };
type Service   = { id: string; label: string; active: boolean };
type Action    = { id: string; label: string; last_triggered?: number | null };

type HaDevice = {
  id: string; name: string; state: string;
  unit?: string;
  media_title?: string; media_artist?: string; volume?: number;
  brightness?: number;
};
type HaDevices = Record<string, HaDevice[]>;

type RadioStation = { id: string; name: string; favicon: string; genre: string };
type RadioState = {
  playing: boolean;
  station: { id: string; name: string; favicon: string } | null;
  stations: RadioStation[];
  cast: {
    active: boolean;
    device: { id: string; name: string } | null;
    station: { name: string; favicon: string } | null;
  };
};
type RadioCommand = { action: string; stationId?: string; deviceId?: string; level?: number; ts: number };

type OmniStyle = {
  theme: "dark" | "light";
  accent: string;
  font: "sans" | "mono";
  sectionOrder: string[];
  cardOrder: Record<string, string[]>;
  pinnedDevices: string[];
  deviceNames: Record<string, string>;
  hiddenSections: string[];
  desktopLayout: "single" | "twoCol";
  sectionColumns: Record<string, 0 | 1>;
};

type SensorsState = {
  sensors:       Sensor[];
  toggles:       Toggle[];
  sliders:       Slider[];
  files?:        FileGroup[];
  services?:     Service[];
  actions?:      Action[];
  ha_devices?:   HaDevices;
  ha_command?:   { entity_id: string; service: string; ts: number };
  radio?:        RadioState;
  radio_command?: RadioCommand;
};

interface StatePayload {
  state: unknown;
  updatedAt: number | null;
  serverOnline: boolean;
  serverLastSeen: number | null;
  hasPending: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#f97316",
];

const DEFAULT_STYLE: OmniStyle = {
  theme: "dark",
  accent: "#3b82f6",
  font: "sans",
  sectionOrder: ["sensors", "radio", "controls", "files", "services", "actions", "devices"],
  cardOrder: {
    sensors:  ["cpu", "memory", "disk", "net_rx", "ha_solar_power", "ha_solar_battery"],
    toggles:  ["ha_entry", "ha_front", "ha_left", "ha_parking"],
    sliders:  ["volume"],
    services: ["services"],
  },
  pinnedDevices: [],
  deviceNames: {},
  hiddenSections: [],
  desktopLayout: "single",
  sectionColumns: { sensors: 0, radio: 0, controls: 0, files: 0, actions: 0, services: 1, devices: 1 },
};

const SECTION_LABELS: Record<string, string> = {
  sensors:  "Sensors",
  radio:    "Radio",
  controls: "Controls",
  files:    "Files",
  services: "Services",
  actions:  "Automations",
  devices:  "HA Devices",
};

const HA_DOMAIN_LABELS: Record<string, string> = {
  switches:       "Switches",
  lights:         "Lights",
  media:          "Media Players",
  binary_sensors: "Binary Sensors",
  sensors:        "Sensors",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSensorsState(v: unknown): v is SensorsState {
  return typeof v === "object" && v !== null &&
    Array.isArray((v as SensorsState).sensors) &&
    Array.isArray((v as SensorsState).toggles);
}

function mergeStyle(saved?: OmniStyle): OmniStyle {
  if (!saved) return DEFAULT_STYLE;
  const merged = {
    ...DEFAULT_STYLE, ...saved,
    cardOrder:     { ...DEFAULT_STYLE.cardOrder, ...saved.cardOrder },
    pinnedDevices:  saved.pinnedDevices  ?? DEFAULT_STYLE.pinnedDevices,
    deviceNames:    saved.deviceNames    ?? DEFAULT_STYLE.deviceNames,
    hiddenSections: saved.hiddenSections ?? DEFAULT_STYLE.hiddenSections,
    desktopLayout:  saved.desktopLayout  ?? DEFAULT_STYLE.desktopLayout,
    sectionColumns: { ...DEFAULT_STYLE.sectionColumns, ...(saved.sectionColumns ?? {}) },
  };
  for (const s of DEFAULT_STYLE.sectionOrder) {
    if (!merged.sectionOrder.includes(s)) merged.sectionOrder = [...merged.sectionOrder, s];
  }
  return merged;
}

function activeSections(sv: SensorsState, pinnedDevices: string[]): string[] {
  const present: string[] = [];
  if (sv.sensors?.length)                                               present.push("sensors");
  if (sv.radio)                                                         present.push("radio");
  if (sv.toggles?.length || sv.sliders?.length)                        present.push("controls");
  if (sv.files?.length)                                                 present.push("files");
  if (sv.services?.length)                                              present.push("services");
  if (sv.actions?.length)                                               present.push("actions");
  if (Object.keys(sv.ha_devices ?? {}).length || pinnedDevices.length) present.push("devices");
  return present;
}

function filterPinnedDevices(devices: HaDevices, pinned: string[]): HaDevices {
  const set = new Set(pinned);
  const result: HaDevices = {};
  for (const [group, items] of Object.entries(devices)) {
    const filtered = items.filter((d) => set.has(d.id));
    if (filtered.length) result[group] = filtered;
  }
  return result;
}

function formatTs(ts: number | null) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function valueColor(ratio: number) {
  if (ratio < 0.6) return "#22c55e";
  if (ratio < 0.8) return "#facc15";
  return "#ef4444";
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const SENSOR_ICONS: Record<string, string> = {
  temp_living: "🌡️", humidity: "💧", cpu: "⚡", memory: "🧠", disk: "💾", net_rx: "📡",
  ha_solar_power: "☀️", ha_solar_battery: "🔋",
};

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3"  r="1.2" /><circle cx="10" cy="3"  r="1.2" />
      <circle cx="4" cy="7"  r="1.2" /><circle cx="10" cy="7"  r="1.2" />
      <circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" />
    </svg>
  );
}

// ── Sortable wrappers ─────────────────────────────────────────────────────────

type DragRender = (p: { dragHandleProps: Record<string, unknown> }) => React.ReactNode;

function SortableCard({ id, editMode, children }: { id: string; editMode: boolean; children: DragRender }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editMode });
  return (
    <div ref={setNodeRef} style={{ transform: editMode ? CSS.Transform.toString(transform) : undefined, transition: editMode ? transition : undefined, opacity: isDragging ? 0.4 : 1 }}>
      {children({ dragHandleProps: editMode ? { ...attributes, ...listeners } : {} })}
    </div>
  );
}

function SortableSection({ id, title, editMode, onHide, children }: {
  id: string; title: string; editMode: boolean; onHide: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editMode });
  return (
    <div ref={setNodeRef} style={{ transform: editMode ? CSS.Transform.toString(transform) : undefined, transition: editMode ? transition : undefined, opacity: isDragging ? 0.4 : 1 }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          {title}
        </h2>
        {editMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={onHide}
              className="px-2 py-1 rounded text-xs transition-opacity opacity-60 hover:opacity-100"
              style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}
              title="Hide section"
            >
              Hide
            </button>
            <button
              {...attributes} {...listeners}
              className="p-1.5 rounded cursor-grab active:cursor-grabbing transition-opacity opacity-40 hover:opacity-100"
              style={{ color: "var(--text-2)" }}
              title="Drag to reorder"
            >
              <GripIcon />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function PlainSection({ id, title, editMode, onHide, columnSide, onMoveColumn, children }: {
  id: string; title: string; editMode: boolean; onHide: () => void;
  columnSide: "left" | "right"; onMoveColumn: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editMode });
  return (
    <div ref={setNodeRef} style={{ transform: editMode ? CSS.Transform.toString(transform) : undefined, transition: editMode ? transition : undefined, opacity: isDragging ? 0.4 : 1 }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{title}</h2>
        {editMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={onMoveColumn}
              className="px-2 py-1 rounded text-xs transition-opacity opacity-60 hover:opacity-100"
              style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}
              title={columnSide === "left" ? "Move to right column" : "Move to left column"}
            >
              {columnSide === "left" ? "→" : "←"}
            </button>
            <button
              onClick={onHide}
              className="px-2 py-1 rounded text-xs transition-opacity opacity-60 hover:opacity-100"
              style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}
            >
              Hide
            </button>
            <button
              {...attributes} {...listeners}
              className="p-1.5 rounded cursor-grab active:cursor-grabbing transition-opacity opacity-40 hover:opacity-100"
              style={{ color: "var(--text-2)" }}
              title="Drag to reorder"
            >
              <GripIcon />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function SensorCard({ sensor, dragHandleProps, editMode }: { sensor: Sensor; dragHandleProps: Record<string, unknown>; editMode: boolean }) {
  const ratio = (sensor.value - sensor.min) / (sensor.max - sensor.min);
  const color = valueColor(ratio);
  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-3 border select-none ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      {...dragHandleProps}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-2)" }}>{sensor.label}</span>
        <span className="text-lg">{SENSOR_ICONS[sensor.id] ?? "📊"}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>
        {sensor.value}
        <span className="text-base font-normal ml-1" style={{ color: "var(--text-3)" }}>{sensor.unit}</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-input)" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ToggleSwitch({
  toggle, onToggle, dragHandleProps, editMode,
}: { toggle: Toggle; onToggle: (id: string) => void; dragHandleProps: Record<string, unknown>; editMode: boolean }) {
  return (
    <div className="rounded-xl p-4 flex items-center justify-between border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0">
        {editMode && (
          <span
            className="cursor-grab active:cursor-grabbing flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
            style={{ color: "var(--text-2)" }}
            {...dragHandleProps}
          >
            <GripIcon />
          </span>
        )}
        <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{toggle.label}</span>
      </div>
      <button onClick={() => onToggle(toggle.id)} className="flex-shrink-0 ml-2">
        <div
          className="relative w-11 h-6 rounded-full transition-colors duration-200"
          style={{ backgroundColor: toggle.enabled ? "var(--accent)" : "var(--bg-input)" }}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${toggle.enabled ? "translate-x-5" : "translate-x-0"}`} />
        </div>
      </button>
    </div>
  );
}

function VolumeSlider({ slider, onCommit }: { slider: Slider; onCommit: (id: string, v: number) => void }) {
  const [localVal, setLocalVal] = useState(slider.value);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) setLocalVal(slider.value);
  }, [slider.value]);

  const ratio = (localVal - slider.min) / (slider.max - slider.min);
  const color = valueColor(ratio);

  return (
    <div className="rounded-xl p-4 col-span-2 flex flex-col gap-3 border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{slider.label}</span>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {localVal}<span className="text-sm font-normal ml-1" style={{ color: "var(--text-3)" }}>{slider.unit}</span>
        </span>
      </div>
      <div className="relative w-full" style={{ height: 20 }}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full pointer-events-none" style={{ backgroundColor: "var(--bg-input)" }}>
          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md" style={{ left: `calc(${ratio * 100}% - 8px)` }} />
        </div>
        <input
          type="range" min={slider.min} max={slider.max} value={localVal}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          onPointerDown={() => { isDragging.current = true; }}
          onChange={(e) => setLocalVal(Number(e.target.value))}
          onPointerUp={(e) => { isDragging.current = false; onCommit(slider.id, Number((e.target as HTMLInputElement).value)); }}
        />
      </div>
      <div className="flex justify-between text-xs" style={{ color: "var(--text-3)" }}>
        <span>{slider.min}</span><span>{Math.round((slider.max - slider.min) / 2)}</span><span>{slider.max}</span>
      </div>
    </div>
  );
}

function FileCard({ group }: { group: FileGroup }) {
  return (
    <div className="rounded-xl p-4 col-span-2 flex flex-col gap-3 border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📁</span>
          <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{group.label}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: "var(--text-3)", backgroundColor: "var(--bg-input)" }}>
          {group.items.length} files · read-only
        </span>
      </div>
      {group.items.length === 0 ? (
        <p className="text-xs italic" style={{ color: "var(--text-3)" }}>No files found</p>
      ) : (
        <div className="max-h-48 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
          {group.items.map((f) => (
            <div key={f.name} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-mono truncate mr-4" style={{ color: "var(--text-2)" }}>{f.name}</span>
              <span className="text-xs shrink-0 tabular-nums" style={{ color: "var(--text-3)" }}>{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, onTrigger }: { action: Action; onTrigger: (id: string) => void }) {
  const [fired, setFired] = useState(false);
  function handleClick() {
    onTrigger(action.id);
    setFired(true);
    setTimeout(() => setFired(false), 2000);
  }
  return (
    <button
      onClick={handleClick}
      className="rounded-xl p-4 flex items-center gap-3 border transition-all duration-150 active:scale-95 text-left w-full"
      style={{
        backgroundColor: fired ? "var(--accent)" : "var(--bg-card)",
        borderColor: fired ? "var(--accent)" : "var(--border)",
      }}
    >
      <span className="text-lg flex-shrink-0">{fired ? "✅" : "▶️"}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: fired ? "#fff" : "var(--text-1)" }}>
          {fired ? "Triggered!" : action.label}
        </div>
        {action.last_triggered && !fired && (
          <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            Last: {new Date(action.last_triggered).toLocaleTimeString()}
          </div>
        )}
      </div>
    </button>
  );
}

function DeviceRow({
  dev, group, onCommand, pinned, onTogglePin, customName, showOriginalName,
}: {
  dev: HaDevice; group: string;
  onCommand: (id: string, svc: string) => void;
  pinned?: boolean; onTogglePin?: (id: string) => void;
  customName?: string; showOriginalName?: boolean;
}) {
  const on = dev.state === "on" || dev.state === "playing";
  const toggleable = group === "switches" || group === "lights";
  const displayName = customName || dev.name;
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>
          {displayName}
          {showOriginalName && customName && (
            <span className="ml-1.5 font-normal" style={{ color: "var(--text-3)", fontSize: "0.7rem" }}>
              ({dev.name})
            </span>
          )}
        </div>
        {group === "media" && dev.media_title && (
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-3)" }}>
            {dev.media_title}{dev.media_artist ? ` · ${dev.media_artist}` : ""}
          </div>
        )}
      </div>

      {toggleable ? (
        <button onClick={() => onCommand(dev.id, on ? "turn_off" : "turn_on")} className="flex-shrink-0" title={on ? "Turn off" : "Turn on"}>
          <div className="relative w-10 h-5 rounded-full transition-colors duration-200" style={{ backgroundColor: on ? "var(--accent)" : "var(--bg-input)" }}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
          </div>
        </button>
      ) : (
        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums"
          style={{ backgroundColor: on ? "rgba(34,197,94,0.12)" : "var(--bg-input)", color: on ? "#22c55e" : "var(--text-3)" }}>
          {group === "sensors" ? `${dev.state}${dev.unit ? ` ${dev.unit}` : ""}` : dev.state}
        </span>
      )}

      {onTogglePin && (
        <button
          onClick={() => onTogglePin(dev.id)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all text-sm"
          style={{ backgroundColor: pinned ? "var(--accent)" : "var(--bg-input)", color: pinned ? "#fff" : "var(--text-3)" }}
          title={pinned ? "Remove from dashboard" : "Pin to dashboard"}
        >
          {pinned ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}

function HaDeviceBrowser({
  devices, onCommand, emptyHint, deviceNames,
}: { devices: HaDevices; onCommand: (entity_id: string, service: string) => void; emptyHint?: string; deviceNames?: Record<string, string> }) {
  const groups = Object.keys(HA_DOMAIN_LABELS).filter((g) => devices[g]?.length);
  if (groups.length === 0) return (
    <div className="rounded-xl p-4 col-span-2 text-sm border text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-3)" }}>
      {emptyHint ?? "No devices"}
    </div>
  );
  return (
    <div className="col-span-2 flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group} className="rounded-xl border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-input)" }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{HA_DOMAIN_LABELS[group]}</span>
            <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-3)", backgroundColor: "var(--border)" }}>{devices[group].length}</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {devices[group].map((dev) => (
              <DeviceRow key={dev.id} dev={dev} group={group} onCommand={onCommand} customName={deviceNames?.[dev.id]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsPanel({
  open, onClose, devices, pinnedDevices, deviceNames, onTogglePin, onCommand, onRename,
}: {
  open: boolean; onClose: () => void;
  devices: HaDevices; pinnedDevices: string[]; deviceNames: Record<string, string>;
  onTogglePin: (id: string) => void;
  onCommand: (entity_id: string, service: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename(id: string) {
    setRenamingId(id);
    setRenameValue(deviceNames[id] ?? "");
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }

  function commitRename() {
    if (renamingId) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  }

  const pinnedSet = new Set(pinnedDevices);
  const groups = Object.keys(HA_DOMAIN_LABELS).filter((g) => devices[g]?.length);
  const totalEntities = groups.reduce((n, g) => n + devices[g].length, 0);

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div
        className={`fixed top-0 right-0 h-full w-96 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Integrations</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-sm" style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          {/* HA integration header card */}
          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-app)" }}>
            <span className="text-xl">🏠</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Home Assistant</div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                {totalEntities > 0 ? `${totalEntities} entities · ${pinnedDevices.length} on dashboard` : "Waiting for data…"}
              </div>
            </div>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: totalEntities > 0 ? "#22c55e" : "#6b7280" }} />
          </div>

          {totalEntities > 0 && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              ★ pins to dashboard · ✎ renames · controls work directly here
            </p>
          )}

          {/* Device groups */}
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <div className="text-xs font-semibold uppercase tracking-widest px-1 mb-1" style={{ color: "var(--text-3)" }}>
                {HA_DOMAIN_LABELS[group]}
              </div>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-app)" }}>
                {devices[group].map((dev, i) => (
                  <div key={dev.id} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--border)" }}>
                    {renamingId === dev.id ? (
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                          placeholder={dev.name}
                          className="flex-1 text-sm bg-transparent outline-none rounded px-2 py-1 border"
                          style={{ color: "var(--text-1)", borderColor: "var(--accent)" }}
                        />
                        {renameValue && (
                          <button onClick={() => { onRename(dev.id, ""); setRenamingId(null); }}
                            className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-3)", backgroundColor: "var(--bg-input)" }}
                            title="Clear rename">✕</button>
                        )}
                        <button onClick={commitRename}
                          className="text-xs px-2 py-1 rounded font-medium"
                          style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <div className="flex-1 min-w-0">
                          <DeviceRow
                            dev={dev} group={group} onCommand={onCommand}
                            pinned={pinnedSet.has(dev.id)} onTogglePin={onTogglePin}
                            customName={deviceNames[dev.id]} showOriginalName
                          />
                        </div>
                        <button
                          onClick={() => startRename(dev.id)}
                          className="flex-shrink-0 mr-3 w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-opacity opacity-40 hover:opacity-100"
                          style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}
                          title="Rename"
                        >✎</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <p className="text-xs text-center py-10" style={{ color: "var(--text-3)" }}>No HA data yet — make sure the server agent is running.</p>
          )}
        </div>
      </div>
    </>
  );
}

function RadioCard({ radio, onCommand }: { radio: RadioState; onCommand: (cmd: RadioCommand) => void }) {
  const nowPlaying = radio.station ?? (radio.cast.active ? radio.cast.station : null);
  const isPlaying  = radio.playing || radio.cast.active;

  return (
    <div className="rounded-xl col-span-2 border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      {/* Now-playing bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-input)" }}>
        <span className="text-2xl flex-shrink-0">{nowPlaying?.favicon ?? "📻"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: isPlaying ? "var(--accent)" : "var(--text-3)" }}>
            {nowPlaying?.name ?? "Not playing"}
          </div>
          {radio.cast.active && radio.cast.device && (
            <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-3)" }}>
              Cast → {radio.cast.device.name}
            </div>
          )}
        </div>
        {isPlaying ? (
          <button
            onClick={() => onCommand({ action: radio.cast.active ? "cast_stop" : "stop", ts: Date.now() })}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            ■ Stop
          </button>
        ) : (
          <span className="text-xs px-2 py-1 rounded-lg flex-shrink-0" style={{ color: "var(--text-3)", backgroundColor: "var(--bg-app)" }}>Idle</span>
        )}
      </div>

      {/* Station list */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {radio.stations.map((s) => {
          const isActive = radio.station?.id === s.id || (radio.cast.active && radio.cast.station?.name === s.name);
          return (
            <button
              key={s.id}
              onClick={() => onCommand({ action: "play", stationId: s.id, ts: Date.now() })}
              className="w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left active:scale-[0.99]"
              style={{ backgroundColor: isActive ? "var(--bg-input)" : "transparent" }}
            >
              <span className="text-base flex-shrink-0">{s.favicon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: isActive ? "var(--accent)" : "var(--text-1)" }}>{s.name}</div>
                {s.genre && <div className="text-xs truncate" style={{ color: "var(--text-3)" }}>{s.genre}</div>}
              </div>
              {isActive && (
                <span className="text-xs flex-shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ServicesCard({ services }: { services: Service[] }) {
  if (services.length === 0) return null;
  return (
    <div className="rounded-xl p-4 col-span-2 flex flex-col gap-3 border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">🖥️</span>
        <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>System Services</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ color: "var(--text-3)", backgroundColor: "var(--bg-input)" }}>
          {services.filter((s) => s.active).length}/{services.length} active
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {services.map((svc) => (
          <div key={svc.id} className="flex items-center gap-2 py-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: svc.active ? "#22c55e" : "#ef4444" }}
            />
            <span className="text-xs truncate" style={{ color: svc.active ? "var(--text-1)" : "var(--text-3)" }}>
              {svc.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Server Setup panel ────────────────────────────────────────────────────────

function ServerSetupPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown]     = useState(false);
  const [copied, setCopied]   = useState(false);
  const [regen, setRegen]     = useState(false);

  useEffect(() => {
    if (!open || token !== null) return;
    setLoading(true);
    fetch("/api/token").then(r => r.json()).then(d => { setToken(d.token ?? null); setLoading(false); });
  }, [open, token]);

  async function regenerate() {
    if (token && !confirm("Regenerate token? The old token will stop working immediately.")) return;
    setLoading(true); setRegen(true);
    const d = await fetch("/api/token", { method: "POST" }).then(r => r.json());
    setToken(d.token ?? null);
    setLoading(false); setRegen(false); setShown(true);
  }

  function copy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const origin  = typeof window !== "undefined" ? window.location.origin : "https://omni-state.vercel.app";
  const masked  = token ? `${token.slice(0, 8)}${"·".repeat(20)}${token.slice(-4)}` : "—";
  const display = loading ? "Loading…" : (shown && token ? token : masked);

  const configSnippet = `{\n  "vercel_url": "${origin}",\n  "api_key": "${shown && token ? token : "<paste-token-here>"}"\n}`;

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-80 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}>

        <div className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Server Setup</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-sm" style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
            Install <code className="px-1 rounded" style={{ backgroundColor: "var(--bg-input)" }}>agent.py</code> and <code className="px-1 rounded" style={{ backgroundColor: "var(--bg-input)" }}>real_sensors.py</code> on your home server, then point them at this deployment using the token below.
          </p>

          {/* Token */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>API Token</span>
            <div className="rounded-xl px-3 py-2.5 border font-mono text-xs break-all select-all" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-2)" }}>
              {display}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => setShown(s => !s)} className="py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80" style={{ backgroundColor: "var(--bg-input)", color: "var(--text-2)" }}>
                {shown ? "Hide" : "Show"}
              </button>
              <button onClick={copy} className="py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80" style={{ backgroundColor: "var(--bg-input)", color: copied ? "#22c55e" : "var(--text-2)" }}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={regenerate} disabled={regen} className="py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80 disabled:opacity-40" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                {regen ? "…" : "Regen"}
              </button>
            </div>
            {token === null && !loading && (
              <p className="text-xs" style={{ color: "#f59e0b" }}>No token yet — click Regen to create one.</p>
            )}
          </div>

          {/* config.json snippet */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>config.json</span>
            <pre className="rounded-xl px-3 py-2.5 border text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border)", color: "#86efac" }}>
              {configSnippet}
            </pre>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Place this file next to <code className="px-1 rounded" style={{ backgroundColor: "var(--bg-input)" }}>agent.py</code> on your server.
            </p>
          </div>

          {/* Quick start */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Quick Start</span>
            <pre className="rounded-xl px-3 py-2.5 border text-xs leading-relaxed" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border)", color: "#86efac" }}>
{`pip install watchdog requests
python3 real_sensors.py &
python3 agent.py`}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({ open, onClose, style, onChange }: {
  open: boolean; onClose: () => void;
  style: OmniStyle; onChange: (s: OmniStyle) => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div
        className={`fixed top-0 right-0 h-full w-72 z-50 flex flex-col gap-6 p-6 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Appearance</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors" style={{ color: "var(--text-2)", backgroundColor: "var(--bg-input)" }}>✕</button>
        </div>

        {/* Theme */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Theme</span>
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => onChange({ ...style, theme: t })}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: style.theme === t ? "var(--accent)" : "var(--bg-input)", color: style.theme === t ? "#fff" : "var(--text-2)" }}>
                {t === "dark" ? "🌙 Dark" : "☀️ Light"}
              </button>
            ))}
          </div>
        </div>

        {/* Accent */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Accent color</span>
          <div className="grid grid-cols-4 gap-2">
            {ACCENT_COLORS.map((c) => (
              <button key={c} onClick={() => onChange({ ...style, accent: c })}
                className="h-9 rounded-lg transition-transform hover:scale-110 border-2"
                style={{ backgroundColor: c, borderColor: style.accent === c ? "var(--text-1)" : "transparent" }} />
            ))}
          </div>
        </div>

        {/* Font */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Font</span>
          <div className="flex gap-2">
            {(["sans", "mono"] as const).map((f) => (
              <button key={f} onClick={() => onChange({ ...style, font: f })}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: style.font === f ? "var(--accent)" : "var(--bg-input)",
                  color: style.font === f ? "#fff" : "var(--text-2)",
                  fontFamily: f === "mono" ? "monospace" : "system-ui",
                }}>
                {f === "sans" ? "Sans" : "Mono"}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>Desktop Layout</span>
          <div className="flex gap-2">
            {(["single", "twoCol"] as const).map((l) => (
              <button key={l} onClick={() => onChange({ ...style, desktopLayout: l })}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: style.desktopLayout === l ? "var(--accent)" : "var(--bg-input)",
                  color: style.desktopLayout === l ? "#fff" : "var(--text-2)",
                }}>
                {l === "single" ? "▬ Single" : "▬ ▬ Two Col"}
              </button>
            ))}
          </div>
          {style.desktopLayout === "twoCol" && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Use Edit mode to move sections between columns with ← →.</p>
          )}
        </div>

        <p className="text-xs mt-auto leading-relaxed" style={{ color: "var(--text-3)" }}>
          Drag section headers or sensor cards to reorder. All preferences sync to your server.
        </p>
      </div>
    </>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [serverData, setServerData]        = useState<StatePayload | null>(null);
  const [loading, setLoading]              = useState(true);
  const [pendingValues, setPending]        = useState<Record<string, boolean | number>>({});
  const [activeStyle, setActiveStyle]      = useState<OmniStyle>(DEFAULT_STYLE);
  const [settingsOpen, setSettings]        = useState(false);
  const [integrationsOpen, setIntegrations] = useState(false);
  const [editMode, setEditMode]            = useState(false);
  const [serverSetupOpen, setServerSetup]  = useState(false);

  useEffect(() => {
    fetch("/api/token")
      .then(r => r.json())
      .then(d => { if (!d.token) router.replace("/onboarding"); });
  }, [router]);

  // Apply CSS variables + font whenever style changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", activeStyle.theme);
    root.style.setProperty("--accent", activeStyle.accent);
    document.body.style.fontFamily =
      activeStyle.font === "mono" ? '"Courier New", monospace' : "system-ui, -apple-system, sans-serif";
  }, [activeStyle]);

  // Load style once on mount, then poll independently
  useEffect(() => {
    async function loadStyle() {
      try {
        const res = await fetch("/api/get-style");
        const json = await res.json();
        if (json.style) setActiveStyle(mergeStyle(json.style));
      } catch { /* keep default */ }
    }
    loadStyle();
  }, []);

  useEffect(() => {
    async function poll() {
      try {
        const res  = await fetch("/api/get-state");
        const json: StatePayload = await res.json();
        setServerData(json);
        if (isSensorsState(json.state)) {
          const s = json.state;
          setPending((prev) => {
            const next = { ...prev };
            for (const t of s.toggles)       if (t.id in next && next[t.id] === t.enabled) delete next[t.id];
            for (const sl of s.sliders ?? []) if (sl.id in next && next[sl.id] === sl.value) delete next[sl.id];
            return next;
          });
        }
      } catch { /* keep stale */ }
      finally { setLoading(false); }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  async function pushState(next: SensorsState) {
    await fetch("/api/set-desired-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  async function pushStyle(style: OmniStyle) {
    await fetch("/api/set-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(style),
    });
  }

  const PENDING_TIMEOUT_MS = 15_000;

  function handleToggle(id: string) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    const cur = id in pendingValues ? (pendingValues[id] as boolean) : (base.toggles.find((t) => t.id === id)?.enabled ?? false);
    setPending((p) => ({ ...p, [id]: !cur }));
    pushState({ ...base, toggles: base.toggles.map((t) => t.id === id ? { ...t, enabled: !cur } : t) });
    setTimeout(() => setPending((p) => { const n = { ...p }; delete n[id]; return n; }), PENDING_TIMEOUT_MS);
  }

  function handleSlider(id: string, value: number) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    setPending((p) => ({ ...p, [id]: value }));
    pushState({ ...base, sliders: (base.sliders ?? []).map((s) => s.id === id ? { ...s, value } : s) });
    setTimeout(() => setPending((p) => { const n = { ...p }; delete n[id]; return n; }), PENDING_TIMEOUT_MS);
  }

  function handleAction(id: string) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    const ts = Date.now();
    const actions = (base.actions ?? []).map((a) => a.id === id ? { ...a, last_triggered: ts } : a);
    pushState({ ...base, actions });
  }

  function handleHaCommand(entity_id: string, service: string) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    pushState({ ...base, ha_command: { entity_id, service, ts: Date.now() } });
  }

  function handleRadioCommand(cmd: RadioCommand) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    pushState({ ...base, radio_command: cmd });
  }

  function handleTogglePin(entityId: string) {
    const pinned = activeStyle.pinnedDevices ?? [];
    const newPinned = pinned.includes(entityId)
      ? pinned.filter((id) => id !== entityId)
      : [...pinned, entityId];
    handleStyleChange({ ...activeStyle, pinnedDevices: newPinned });
  }

  function handleRename(entityId: string, name: string) {
    const names = { ...(activeStyle.deviceNames ?? {}) };
    if (name) names[entityId] = name; else delete names[entityId];
    handleStyleChange({ ...activeStyle, deviceNames: names });
  }

  function handleStyleChange(newStyle: OmniStyle) {
    setActiveStyle(newStyle);
    pushStyle(newStyle);
  }

  function moveSectionColumn(sid: string) {
    const current = (activeStyle.sectionColumns ?? {})[sid] ?? 0;
    handleStyleChange({
      ...activeStyle,
      sectionColumns: { ...(activeStyle.sectionColumns ?? {}), [sid]: current === 0 ? 1 : 0 },
    });
  }

  function hideSection(sid: string) {
    const hidden = [...(activeStyle.hiddenSections ?? [])];
    if (!hidden.includes(sid)) hidden.push(sid);
    handleStyleChange({ ...activeStyle, hiddenSections: hidden });
  }

  function showSection(sid: string) {
    handleStyleChange({ ...activeStyle, hiddenSections: (activeStyle.hiddenSections ?? []).filter(s => s !== sid) });
  }

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const aid = String(active.id);
    const oid = String(over.id);
    const ns: OmniStyle = { ...activeStyle, cardOrder: { ...activeStyle.cardOrder } };

    if (aid.startsWith("section:")) {
      const from = ns.sectionOrder.indexOf(aid.slice(8));
      const to   = ns.sectionOrder.indexOf(oid.slice(8));
      if (from !== -1 && to !== -1) ns.sectionOrder = arrayMove(ns.sectionOrder, from, to);
    } else if (aid.startsWith("sensor:")) {
      const ids = ns.cardOrder.sensors;
      const from = ids.indexOf(aid.slice(7));
      const to   = ids.indexOf(oid.slice(7));
      if (from !== -1 && to !== -1) ns.cardOrder.sensors = arrayMove(ids, from, to);
    } else if (aid.startsWith("toggle:")) {
      const ids = ns.cardOrder.toggles;
      const from = ids.indexOf(aid.slice(7));
      const to   = ids.indexOf(oid.slice(7));
      if (from !== -1 && to !== -1) ns.cardOrder.toggles = arrayMove(ids, from, to);
    }

    handleStyleChange(ns);
  }

  const base = serverData?.state;
  const sv = isSensorsState(base) ? {
    ...base,
    toggles:    base.toggles.map((t)  => t.id  in pendingValues ? { ...t,  enabled: pendingValues[t.id]  as boolean } : t),
    sliders:    (base.sliders ?? []).map((s) => s.id in pendingValues ? { ...s, value: pendingValues[s.id] as number  } : s),
    files:      base.files      ?? [],
    services:   base.services   ?? [],
    actions:    base.actions    ?? [],
    ha_devices: base.ha_devices ?? {},
  } : null;

  function sorted<T extends { id: string }>(items: T[], key: string) {
    const order = activeStyle.cardOrder[key] ?? [];
    return [...items].sort((a, b) => {
      const ai = order.indexOf(a.id); const bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 transition-colors duration-300" style={{ backgroundColor: "var(--bg-app)", color: "var(--text-1)" }}>

      <ServerSetupPanel open={serverSetupOpen} onClose={() => setServerSetup(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettings(false)} style={activeStyle} onChange={handleStyleChange} />
      <IntegrationsPanel
        open={integrationsOpen} onClose={() => setIntegrations(false)}
        devices={sv?.ha_devices ?? {}}
        pinnedDevices={activeStyle.pinnedDevices ?? []}
        deviceNames={activeStyle.deviceNames ?? {}}
        onTogglePin={handleTogglePin}
        onCommand={handleHaCommand}
        onRename={handleRename}
      />

      {/* Header */}
      <div className={`w-full flex items-start justify-between ${activeStyle.desktopLayout === "twoCol" ? "max-w-2xl lg:max-w-5xl" : "max-w-2xl"}`}>
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">OmniState</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Live sensor relay from your home server</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setEditMode(e => !e)}
            className="px-3 py-2 rounded-xl border text-xs font-medium transition-all"
            style={{
              backgroundColor: editMode ? "var(--accent)" : "var(--bg-card)",
              borderColor: editMode ? "var(--accent)" : "var(--border)",
              color: editMode ? "#fff" : "var(--text-2)",
            }}
            title="Edit layout"
          >
            {editMode ? "✓ Done" : "Edit"}
          </button>
          <button
            onClick={() => setServerSetup(true)}
            className="p-2.5 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-2)" }}
            title="Server setup"
          >
            🔑
          </button>
          <button
            onClick={() => setIntegrations(true)}
            className="relative p-2.5 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-2)" }}
            title="Integrations"
          >
            🔌
            {(activeStyle.pinnedDevices?.length ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "var(--accent)", fontSize: 10 }}>
                {activeStyle.pinnedDevices.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSettings(true)}
            className="p-2.5 rounded-xl border transition-colors"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-2)" }}
            title="Appearance settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2.5 rounded-xl border transition-colors text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-3)" }}
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className={`w-full rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 border ${activeStyle.desktopLayout === "twoCol" ? "max-w-2xl lg:max-w-5xl" : "max-w-2xl"}`} style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 flex-1">
          <span className={`w-2.5 h-2.5 rounded-full inline-block ${loading ? "animate-pulse" : ""}`}
            style={{ backgroundColor: loading ? "#facc15" : serverData?.serverOnline ? "#22c55e" : "#ef4444" }} />
          <span className="text-sm font-medium">
            Local Server: {loading ? "Connecting…" : serverData?.serverOnline ? "Online" : "Offline"}
          </span>
          {(serverData?.hasPending || Object.keys(pendingValues).length > 0) && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full border animate-pulse"
              style={{ color: "#fde047", backgroundColor: "rgba(234,179,8,0.1)", borderColor: "rgba(234,179,8,0.3)" }}>
              Syncing…
            </span>
          )}
        </div>
        <div className="text-xs space-y-0.5 text-right" style={{ color: "var(--text-3)" }}>
          {serverData && !serverData.serverOnline ? (
            <>
              <div style={{ color: "#f87171" }}>
                Last seen: {timeAgo(serverData.serverLastSeen)} ({formatTs(serverData.serverLastSeen)})
              </div>
              <div style={{ color: "var(--text-3)" }}>
                Check: <code>sudo systemctl status omnistate</code>
              </div>
            </>
          ) : (
            <>
              <div>Heartbeat: {formatTs(serverData?.serverLastSeen ?? null)}</div>
              <div>Updated:   {formatTs(serverData?.updatedAt ?? null)}</div>
            </>
          )}
        </div>
      </div>

      {sv ? (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {(() => {
            const svDef          = sv!;
            const allActive      = activeSections(svDef, activeStyle.pinnedDevices ?? []);
            const hiddenSet      = new Set(activeStyle.hiddenSections ?? []);
            const active         = new Set(allActive.filter(s => !hiddenSet.has(s)));
            const visible        = [
              ...activeStyle.sectionOrder.filter(s => active.has(s)),
              ...[...active].filter(s => !activeStyle.sectionOrder.includes(s)),
            ];
            const hiddenWithData = allActive.filter(s => hiddenSet.has(s));
            const isTwoCol       = activeStyle.desktopLayout === "twoCol";
            const cols           = activeStyle.sectionColumns ?? {};
            const leftSections   = visible.filter(s => (cols[s] ?? 0) === 0);
            const rightSections  = visible.filter(s => (cols[s] ?? 0) === 1);

            function body(sid: string) {
              return (
                <>
                  {sid === "sensors" && (
                    <SortableContext items={activeStyle.cardOrder.sensors.map(id => `sensor:${id}`)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3">
                        {sorted(svDef.sensors, "sensors").map(s => (
                          <SortableCard key={s.id} id={`sensor:${s.id}`} editMode={editMode}>
                            {({ dragHandleProps }) => <SensorCard sensor={s} dragHandleProps={dragHandleProps} editMode={editMode} />}
                          </SortableCard>
                        ))}
                      </div>
                    </SortableContext>
                  )}
                  {sid === "radio" && svDef.radio && (
                    <div className="grid grid-cols-2 gap-3">
                      <RadioCard radio={svDef.radio} onCommand={handleRadioCommand} />
                    </div>
                  )}
                  {sid === "controls" && (
                    <SortableContext items={activeStyle.cardOrder.toggles.map(id => `toggle:${id}`)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3">
                        {sorted(svDef.toggles, "toggles").map(t => (
                          <SortableCard key={t.id} id={`toggle:${t.id}`} editMode={editMode}>
                            {({ dragHandleProps }) => <ToggleSwitch toggle={t} onToggle={handleToggle} dragHandleProps={dragHandleProps} editMode={editMode} />}
                          </SortableCard>
                        ))}
                        {svDef.sliders.map(s => <VolumeSlider key={s.id} slider={s} onCommit={handleSlider} />)}
                      </div>
                    </SortableContext>
                  )}
                  {sid === "files" && (
                    <div className="grid grid-cols-2 gap-3">
                      {(svDef.files ?? []).map(g => <FileCard key={g.id} group={g} />)}
                    </div>
                  )}
                  {sid === "actions" && (
                    <div className="grid grid-cols-2 gap-3">
                      {(svDef.actions ?? []).map(a => <ActionButton key={a.id} action={a} onTrigger={handleAction} />)}
                    </div>
                  )}
                  {sid === "services" && (
                    <div className="grid grid-cols-2 gap-3">
                      <ServicesCard services={svDef.services ?? []} />
                    </div>
                  )}
                  {sid === "devices" && (
                    <div className="grid grid-cols-2 gap-3">
                      <HaDeviceBrowser
                        devices={filterPinnedDevices(svDef.ha_devices ?? {}, activeStyle.pinnedDevices ?? [])}
                        onCommand={handleHaCommand}
                        deviceNames={activeStyle.deviceNames ?? {}}
                        emptyHint="No pinned devices — open Integrations (🔌) to add some."
                      />
                    </div>
                  )}
                </>
              );
            }

            const hiddenRestore = editMode && hiddenWithData.length > 0 ? (
              <div className="rounded-xl p-4 border flex flex-wrap items-center gap-2" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <span className="text-xs font-semibold uppercase tracking-widest mr-1" style={{ color: "var(--text-3)" }}>Hidden</span>
                {hiddenWithData.map(sid => (
                  <button key={sid} onClick={() => showSection(sid)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
                    style={{ backgroundColor: "var(--bg-input)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                    + {SECTION_LABELS[sid] ?? sid}
                  </button>
                ))}
              </div>
            ) : null;

            return (
              <>
                {/* Mobile + single-column desktop */}
                <SortableContext items={visible.map(s => `section:${s}`)} strategy={verticalListSortingStrategy}>
                  <div className={`${isTwoCol ? "lg:hidden" : ""} w-full max-w-2xl flex flex-col gap-6`}>
                    {visible.map(sid => (
                      <SortableSection key={sid} id={`section:${sid}`} title={SECTION_LABELS[sid] ?? sid} editMode={editMode} onHide={() => hideSection(sid)}>
                        {body(sid)}
                      </SortableSection>
                    ))}
                    {hiddenRestore}
                  </div>
                </SortableContext>

                {/* Desktop two-column (lg+ only) */}
                {isTwoCol && (
                  <div className="hidden lg:flex flex-col gap-6 w-full max-w-5xl">
                    <div className="flex gap-8">
                      {([leftSections, rightSections] as const).map((col, colIdx) => (
                        <SortableContext key={colIdx} items={col.map(s => `section:${s}`)} strategy={verticalListSortingStrategy}>
                          <div className="flex-1 min-w-0 flex flex-col gap-6">
                            {col.map(sid => (
                              <PlainSection key={sid} id={`section:${sid}`} title={SECTION_LABELS[sid] ?? sid} editMode={editMode} onHide={() => hideSection(sid)} columnSide={colIdx === 0 ? "left" : "right"} onMoveColumn={() => moveSectionColumn(sid)}>
                                {body(sid)}
                              </PlainSection>
                            ))}
                          </div>
                        </SortableContext>
                      ))}
                    </div>
                    {hiddenRestore}
                  </div>
                )}
              </>
            );
          })()}
        </DndContext>
      ) : (
        <div className="w-full max-w-2xl rounded-xl border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>state (raw)</span>
          </div>
          <textarea readOnly value={base != null ? JSON.stringify(base, null, 2) : ""} placeholder="Waiting for data…"
            className="w-full h-64 bg-transparent p-4 font-mono text-sm resize-none outline-none"
            style={{ color: "#86efac" }} />
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-3)" }}>Polls every 5 s · Controls sync within ~10 s</p>
    </main>
  );
}
