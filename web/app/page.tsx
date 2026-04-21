"use client";

import { useEffect, useRef, useState } from "react";
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

type OmniStyle = {
  theme: "dark" | "light";
  accent: string;
  font: "sans" | "mono";
  sectionOrder: string[];
  cardOrder: Record<string, string[]>;
};

type SensorsState = {
  sensors:  Sensor[];
  toggles:  Toggle[];
  sliders:  Slider[];
  files:    FileGroup[];
  services: Service[];
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
  sectionOrder: ["sensors", "controls", "files", "services"],
  cardOrder: {
    sensors:  ["cpu", "memory", "disk", "net_rx", "ha_solar_power", "ha_solar_battery"],
    toggles:  ["ha_entry", "ha_front", "ha_left", "ha_parking"],
    sliders:  ["volume"],
    files:    ["documents"],
    services: ["services"],
  },
};

const SECTION_LABELS: Record<string, string> = {
  sensors:  "Sensors",
  controls: "Controls",
  files:    "Files",
  services: "Services",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSensorsState(v: unknown): v is SensorsState {
  return typeof v === "object" && v !== null &&
    Array.isArray((v as SensorsState).sensors) &&
    Array.isArray((v as SensorsState).toggles);
}

function mergeStyle(saved?: OmniStyle): OmniStyle {
  if (!saved) return DEFAULT_STYLE;
  const merged = { ...DEFAULT_STYLE, ...saved, cardOrder: { ...DEFAULT_STYLE.cardOrder, ...saved.cardOrder } };
  // Union any new sections from DEFAULT_STYLE not in saved sectionOrder
  for (const s of DEFAULT_STYLE.sectionOrder) {
    if (!merged.sectionOrder.includes(s)) merged.sectionOrder = [...merged.sectionOrder, s];
  }
  return merged;
}

function formatTs(ts: number | null) {
  return ts ? new Date(ts).toLocaleString() : "—";
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

function SortableCard({ id, children }: { id: string; children: DragRender }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

function SortableSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          {title}
        </h2>
        <button
          {...attributes} {...listeners}
          className="p-1.5 rounded cursor-grab active:cursor-grabbing transition-opacity opacity-40 hover:opacity-100"
          style={{ color: "var(--text-2)" }}
          title="Drag to reorder section"
        >
          <GripIcon />
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function SensorCard({ sensor, dragHandleProps }: { sensor: Sensor; dragHandleProps: Record<string, unknown> }) {
  const ratio = (sensor.value - sensor.min) / (sensor.max - sensor.min);
  const color = valueColor(ratio);
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 border cursor-grab active:cursor-grabbing select-none"
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
  toggle, onToggle, dragHandleProps,
}: { toggle: Toggle; onToggle: (id: string) => void; dragHandleProps: Record<string, unknown> }) {
  return (
    <div className="rounded-xl p-4 flex items-center justify-between border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="cursor-grab active:cursor-grabbing flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-2)" }}
          {...dragHandleProps}
        >
          <GripIcon />
        </span>
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

        <p className="text-xs mt-auto leading-relaxed" style={{ color: "var(--text-3)" }}>
          Drag section headers or sensor cards to reorder. All preferences sync to your server.
        </p>
      </div>
    </>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [serverData, setServerData]   = useState<StatePayload | null>(null);
  const [loading, setLoading]         = useState(true);
  const [pendingValues, setPending]   = useState<Record<string, boolean | number>>({});
  const [activeStyle, setActiveStyle] = useState<OmniStyle>(DEFAULT_STYLE);
  const [settingsOpen, setSettings]   = useState(false);

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

  function handleToggle(id: string) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    const cur = id in pendingValues ? (pendingValues[id] as boolean) : (base.toggles.find((t) => t.id === id)?.enabled ?? false);
    setPending((p) => ({ ...p, [id]: !cur }));
    pushState({ ...base, toggles: base.toggles.map((t) => t.id === id ? { ...t, enabled: !cur } : t) });
  }

  function handleSlider(id: string, value: number) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;
    setPending((p) => ({ ...p, [id]: value }));
    pushState({ ...base, sliders: (base.sliders ?? []).map((s) => s.id === id ? { ...s, value } : s) });
  }

  function handleStyleChange(newStyle: OmniStyle) {
    setActiveStyle(newStyle);
    pushStyle(newStyle);
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
    toggles:  base.toggles.map((t)  => t.id  in pendingValues ? { ...t,  enabled: pendingValues[t.id]  as boolean } : t),
    sliders:  (base.sliders ?? []).map((s) => s.id in pendingValues ? { ...s, value: pendingValues[s.id] as number  } : s),
    services: (base.services ?? []),
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

      <SettingsPanel open={settingsOpen} onClose={() => setSettings(false)} style={activeStyle} onChange={handleStyleChange} />

      {/* Header */}
      <div className="w-full max-w-2xl flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">OmniState</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Live sensor relay from your home server</p>
        </div>
        <button
          onClick={() => setSettings(true)}
          className="mt-1 p-2.5 rounded-xl border transition-colors"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-2)" }}
          title="Appearance settings"
        >
          ⚙️
        </button>
      </div>

      {/* Status bar */}
      <div className="w-full max-w-2xl rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
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
          <div>Heartbeat: {formatTs(serverData?.serverLastSeen ?? null)}</div>
          <div>Updated:   {formatTs(serverData?.updatedAt ?? null)}</div>
        </div>
      </div>

      {sv ? (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeStyle.sectionOrder.map((s) => `section:${s}`)} strategy={verticalListSortingStrategy}>
            <div className="w-full max-w-2xl flex flex-col gap-6">

              {activeStyle.sectionOrder.map((sid) => (
                <SortableSection key={sid} id={`section:${sid}`} title={SECTION_LABELS[sid] ?? sid}>

                  {sid === "sensors" && (
                    <SortableContext items={activeStyle.cardOrder.sensors.map((id) => `sensor:${id}`)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3">
                        {sorted(sv.sensors, "sensors").map((s) => (
                          <SortableCard key={s.id} id={`sensor:${s.id}`}>
                            {({ dragHandleProps }) => <SensorCard sensor={s} dragHandleProps={dragHandleProps} />}
                          </SortableCard>
                        ))}
                      </div>
                    </SortableContext>
                  )}

                  {sid === "controls" && (
                    <SortableContext items={activeStyle.cardOrder.toggles.map((id) => `toggle:${id}`)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3 relative">
                        {sorted(sv.toggles, "toggles").map((t) => (
                          <SortableCard key={t.id} id={`toggle:${t.id}`}>
                            {({ dragHandleProps }) => <ToggleSwitch toggle={t} onToggle={handleToggle} dragHandleProps={dragHandleProps} />}
                          </SortableCard>
                        ))}
                        {sv.sliders.map((s) => (
                          <VolumeSlider key={s.id} slider={s} onCommit={handleSlider} />
                        ))}
                      </div>
                    </SortableContext>
                  )}

                  {sid === "files" && (
                    <div className="grid grid-cols-2 gap-3">
                      {sv.files.map((g) => <FileCard key={g.id} group={g} />)}
                    </div>
                  )}

                  {sid === "services" && sv.services.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <ServicesCard services={sv.services} />
                    </div>
                  )}

                </SortableSection>
              ))}
            </div>
          </SortableContext>
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
