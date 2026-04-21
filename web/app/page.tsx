"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Sensor = { id: string; label: string; value: number; unit: string; min: number; max: number };
type Toggle = { id: string; label: string; enabled: boolean };
type Slider = { id: string; label: string; value: number; min: number; max: number; unit: string };
type FileItem = { name: string; size: number; modified: number };
type FileGroup = { id: string; label: string; items: FileItem[] };

type SensorsState = {
  sensors: Sensor[];
  toggles: Toggle[];
  sliders: Slider[];
  files: FileGroup[];
};

interface StatePayload {
  state: unknown;
  updatedAt: number | null;
  serverOnline: boolean;
  serverLastSeen: number | null;
  hasPending: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSensorsState(v: unknown): v is SensorsState {
  return (
    typeof v === "object" && v !== null &&
    Array.isArray((v as SensorsState).sensors) &&
    Array.isArray((v as SensorsState).toggles)
  );
}

function formatTs(ts: number | null) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function ratioColor(r: number) {
  if (r < 0.6) return { bar: "bg-green-500", text: "text-green-400" };
  if (r < 0.8) return { bar: "bg-yellow-400", text: "text-yellow-300" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

const SENSOR_ICONS: Record<string, string> = {
  temp_living: "🌡️", humidity: "💧", cpu: "⚡", memory: "🧠",
};

// ── Components ────────────────────────────────────────────────────────────────

function SensorCard({ sensor }: { sensor: Sensor }) {
  const ratio = (sensor.value - sensor.min) / (sensor.max - sensor.min);
  const { bar, text } = ratioColor(ratio);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{sensor.label}</span>
        <span className="text-lg">{SENSOR_ICONS[sensor.id] ?? "📊"}</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${text}`}>
        {sensor.value}
        <span className="text-base font-normal text-gray-500 ml-1">{sensor.unit}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

function ToggleSwitch({ toggle, onToggle }: { toggle: Toggle; onToggle: (id: string) => void }) {
  return (
    <button
      onClick={() => onToggle(toggle.id)}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-gray-600 transition-colors w-full"
    >
      <span className="text-sm font-medium text-gray-200">{toggle.label}</span>
      <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${toggle.enabled ? "bg-blue-600" : "bg-gray-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${toggle.enabled ? "translate-x-5" : "translate-x-0"}`} />
      </div>
    </button>
  );
}

function VolumeSlider({
  slider,
  onCommit,
}: {
  slider: Slider;
  onCommit: (id: string, value: number) => void;
}) {
  const [localVal, setLocalVal] = useState(slider.value);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) setLocalVal(slider.value);
  }, [slider.value]);

  const ratio = (localVal - slider.min) / (slider.max - slider.min);
  const { bar, text } = ratioColor(ratio);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <span className="text-sm font-medium text-gray-200">{slider.label}</span>
        </div>
        <span className={`text-2xl font-bold tabular-nums ${text}`}>
          {localVal}
          <span className="text-sm font-normal text-gray-500 ml-1">{slider.unit}</span>
        </span>
      </div>

      {/* Track + invisible input stacked in a relative container */}
      <div className="relative w-full" style={{ height: "20px" }}>
        {/* Visual track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 bg-gray-800 rounded-full pointer-events-none">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${ratio * 100}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md border-2 border-gray-300"
            style={{ left: `calc(${ratio * 100}% - 8px)` }}
          />
        </div>
        {/* Interaction input — fully covers the track */}
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          value={localVal}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          onPointerDown={() => { isDragging.current = true; }}
          onChange={(e) => setLocalVal(Number(e.target.value))}
          onPointerUp={(e) => {
            isDragging.current = false;
            onCommit(slider.id, Number((e.target as HTMLInputElement).value));
          }}
        />
      </div>

      {/* Tick marks */}
      <div className="flex justify-between text-xs text-gray-600">
        <span>{slider.min}</span>
        <span>{Math.round((slider.max - slider.min) / 2)}</span>
        <span>{slider.max}</span>
      </div>
    </div>
  );
}

function FileCard({ group }: { group: FileGroup }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📁</span>
          <span className="text-sm font-medium text-gray-200">{group.label}</span>
        </div>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
          {group.items.length} files · read-only
        </span>
      </div>

      {group.items.length === 0 ? (
        <p className="text-xs text-gray-600 italic">No files found</p>
      ) : (
        <div className="divide-y divide-gray-800/60 max-h-48 overflow-y-auto">
          {group.items.map((f) => (
            <div key={f.name} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
              <span className="text-xs font-mono text-gray-300 truncate mr-4">{f.name}</span>
              <span className="text-xs text-gray-500 shrink-0 tabular-nums">{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [serverData, setServerData] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingValues, setPendingValues] = useState<Record<string, boolean | number>>({});

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/get-state");
        const json: StatePayload = await res.json();
        setServerData(json);

        if (isSensorsState(json.state)) {
          const s = json.state;
          setPendingValues((prev) => {
            const next = { ...prev };
            for (const t of s.toggles) {
              if (t.id in next && next[t.id] === t.enabled) delete next[t.id];
            }
            for (const sl of s.sliders ?? []) {
              if (sl.id in next && next[sl.id] === sl.value) delete next[sl.id];
            }
            return next;
          });
        }
      } catch {
        // keep stale on transient error
      } finally {
        setLoading(false);
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  async function postDesiredState(next: SensorsState) {
    await fetch("/api/set-desired-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  function handleToggle(id: string) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;

    const current = id in pendingValues ? (pendingValues[id] as boolean) : (base.toggles.find((t) => t.id === id)?.enabled ?? false);
    const newVal = !current;

    setPendingValues((p) => ({ ...p, [id]: newVal }));
    const next: SensorsState = { ...base, toggles: base.toggles.map((t) => t.id === id ? { ...t, enabled: newVal } : t) };
    postDesiredState(next);
  }

  function handleSlider(id: string, value: number) {
    const base = serverData?.state;
    if (!isSensorsState(base)) return;

    setPendingValues((p) => ({ ...p, [id]: value }));
    const next: SensorsState = { ...base, sliders: (base.sliders ?? []).map((s) => s.id === id ? { ...s, value } : s) };
    postDesiredState(next);
  }

  const base = serverData?.state;
  const sensorsView = isSensorsState(base)
    ? {
        ...base,
        toggles: base.toggles.map((t) => t.id in pendingValues ? { ...t, enabled: pendingValues[t.id] as boolean } : t),
        sliders: (base.sliders ?? []).map((s) => s.id in pendingValues ? { ...s, value: pendingValues[s.id] as number } : s),
      }
    : null;

  const hasPendingAny = serverData?.hasPending || Object.keys(pendingValues).length > 0;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-start p-6 gap-6">
      {/* Header */}
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight mb-1">OmniState</h1>
        <p className="text-gray-400 text-sm">Live sensor relay from your home server</p>
      </div>

      {/* Status bar */}
      <div className="w-full max-w-2xl bg-gray-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 border border-gray-800">
        <div className="flex items-center gap-2 flex-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${loading ? "bg-yellow-400 animate-pulse" : serverData?.serverOnline ? "bg-green-400" : "bg-red-500"}`} />
          <span className="text-sm font-medium">
            Local Server:{" "}
            {loading ? "Connecting…" : serverData?.serverOnline ? "Online" : "Offline"}
          </span>
          {hasPendingAny && (
            <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30 animate-pulse">
              Syncing…
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-0.5 text-right">
          <div>Heartbeat: {formatTs(serverData?.serverLastSeen ?? null)}</div>
          <div>Updated: {formatTs(serverData?.updatedAt ?? null)}</div>
        </div>
      </div>

      {sensorsView ? (
        <>
          {/* Sensors */}
          <div className="w-full max-w-2xl">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Sensors</h2>
            <div className="grid grid-cols-2 gap-3">
              {sensorsView.sensors.map((s) => <SensorCard key={s.id} sensor={s} />)}
            </div>
          </div>

          {/* Controls */}
          <div className="w-full max-w-2xl">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Controls</h2>
            <div className="grid grid-cols-2 gap-3 relative">
              {sensorsView.toggles.map((t) => <ToggleSwitch key={t.id} toggle={t} onToggle={handleToggle} />)}
              {(sensorsView.sliders ?? []).map((s) => <VolumeSlider key={s.id} slider={s} onCommit={handleSlider} />)}
            </div>
          </div>

          {/* Files */}
          {(sensorsView.files ?? []).length > 0 && (
            <div className="w-full max-w-2xl">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Files</h2>
              <div className="grid grid-cols-2 gap-3">
                {sensorsView.files.map((g) => <FileCard key={g.id} group={g} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-full max-w-2xl bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800">
            <span className="text-xs font-mono text-gray-400">state (raw)</span>
          </div>
          <textarea readOnly value={base != null ? JSON.stringify(base, null, 2) : ""} placeholder="Waiting for data…" className="w-full h-64 bg-transparent p-4 font-mono text-sm text-green-300 resize-none outline-none placeholder:text-gray-600" />
        </div>
      )}

      <p className="text-xs text-gray-600">Polls every 5 s · Controls sync within ~10 s</p>
    </main>
  );
}
