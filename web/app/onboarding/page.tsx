"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type IntegrationType = "home_assistant" | "custom_server";
type InstallTab = "hacs" | "manual";
type Step = 1 | 2 | 3;

// ── Root ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]           = useState<Step>(1);
  const [integration, setInteg]   = useState<IntegrationType | null>(null);
  const [token, setToken]         = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // If they already have a token, skip to step 2 (just need to connect HA)
  useEffect(() => {
    fetch("/api/token")
      .then(r => r.json())
      .then(d => {
        if (d.token) {
          setToken(d.token);
          setStep(2);
          setInteg("home_assistant");
        }
      });
  }, []);

  // Step 3: poll until server comes online
  useEffect(() => {
    if (step !== 3) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/get-state").then(r => r.json());
      if (res.serverOnline) {
        setConnected(true);
        clearInterval(id);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [step]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#0f172a", color: "#f1f5f9" }}
    >
      <div className="w-full max-w-xl flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <a
            href="/"
            className="text-sm font-bold tracking-tight mb-2 self-start"
            style={{ color: "#3b82f6" }}
          >
            OmniState
          </a>
          <StepIndicator current={step} />
        </div>

        {/* Step content */}
        {step === 1 && (
          <Step1
            onSelect={(t) => {
              setInteg(t);
              setStep(2);
            }}
          />
        )}
        {step === 2 && integration === "home_assistant" && (
          <Step2
            token={token}
            onTokenGenerated={setToken}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            connected={connected}
            onDone={() => router.replace("/dashboard")}
          />
        )}
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps = ["Choose integration", "Install & connect", "Go live"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const done    = current > n;
        const active  = current === n;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor: done ? "#22c55e" : active ? "#3b82f6" : "#1e293b",
                color: done || active ? "#fff" : "#475569",
              }}
            >
              {done ? "✓" : n}
            </div>
            <span
              className="text-sm hidden sm:inline"
              style={{ color: active ? "#f1f5f9" : "#475569" }}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="w-8 h-px mx-1" style={{ backgroundColor: "#1e293b" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Choose integration ────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (t: IntegrationType) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Add your first integration</h1>
        <p style={{ color: "#94a3b8" }}>
          Choose how you want to connect your home server to OmniState.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <IntegrationCard
          icon="🏠"
          title="Home Assistant"
          description="Sync sensors, entities, switches, and automations from your HA instance."
          available
          onClick={() => onSelect("home_assistant")}
        />
        <IntegrationCard
          icon="🖥️"
          title="Custom Server"
          description="Run a lightweight Python agent on any Linux machine."
          available={false}
          onClick={() => {}}
        />
      </div>

      <p className="text-xs text-center" style={{ color: "#475569" }}>
        More integrations coming — Proxmox, Synology, and others.
      </p>
    </div>
  );
}

function IntegrationCard({
  icon, title, description, available, onClick,
}: {
  icon: string; title: string; description: string; available: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      className="text-left rounded-2xl p-6 border flex flex-col gap-3 transition-colors"
      style={{
        backgroundColor: "#1e293b",
        borderColor: available ? "#334155" : "#1e293b",
        opacity: available ? 1 : 0.45,
        cursor: available ? "pointer" : "not-allowed",
      }}
      onMouseEnter={e => { if (available) (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6"; }}
      onMouseLeave={e => { if (available) (e.currentTarget as HTMLButtonElement).style.borderColor = "#334155"; }}
    >
      <span className="text-3xl">{icon}</span>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {!available && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#0f172a", color: "#475569" }}
            >
              soon
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: "#94a3b8" }}>{description}</p>
      </div>
    </button>
  );
}

// ── Step 2: Install guide + token ─────────────────────────────────────────────

function Step2({
  token,
  onTokenGenerated,
  onContinue,
}: {
  token: string | null;
  onTokenGenerated: (t: string) => void;
  onContinue: () => void;
}) {
  const [tab, setTab]         = useState<InstallTab>("hacs");
  const [generating, setGen]  = useState(false);
  const [copied, setCopied]   = useState(false);

  const DASHBOARD_URL = typeof window !== "undefined"
    ? window.location.origin
    : "https://omni-state.vercel.app";

  async function generateToken() {
    setGen(true);
    const d = await fetch("/api/token", { method: "POST" }).then(r => r.json());
    onTokenGenerated(d.token);
    setGen(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Install the Home Assistant integration</h1>
        <p style={{ color: "#94a3b8" }}>
          Follow the steps below, then generate your token and paste it into HA.
        </p>
      </div>

      {/* Install tabs */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "#334155" }}
      >
        <div
          className="flex border-b"
          style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
        >
          {(["hacs", "manual"] as InstallTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-3 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? "#f1f5f9" : "#64748b",
                borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
                backgroundColor: "transparent",
              }}
            >
              {t === "hacs" ? "HACS (recommended)" : "Manual"}
            </button>
          ))}
        </div>

        <div className="p-6 flex flex-col gap-4" style={{ backgroundColor: "#0f172a" }}>
          {tab === "hacs" ? <HacsSteps /> : <ManualSteps />}
        </div>
      </div>

      {/* Token section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Your integration token</h2>
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            Generate a token and paste it into the OmniState integration in HA.
          </p>
        </div>

        {token ? (
          <div className="flex flex-col gap-3">
            <div
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 border font-mono text-sm"
              style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
            >
              <span className="truncate" style={{ color: "#86efac" }}>{token}</span>
              <button
                onClick={() => copy(token)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: "#334155", color: copied ? "#22c55e" : "#cbd5e1" }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "#475569" }}>
              Keep this token private. You can regenerate it from the dashboard Settings at any time.
            </p>
          </div>
        ) : (
          <button
            onClick={generateToken}
            disabled={generating}
            className="self-start px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            {generating ? "Generating…" : "Generate token"}
          </button>
        )}
      </div>

      {/* HA connection details */}
      {token && (
        <div
          className="rounded-2xl border p-5 flex flex-col gap-4"
          style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
        >
          <p className="text-sm font-medium">
            In Home Assistant → Settings → Integrations → Add integration → search{" "}
            <span style={{ color: "#3b82f6" }}>OmniState</span>, then enter:
          </p>
          <div className="flex flex-col gap-2">
            <Field label="Dashboard URL" value={DASHBOARD_URL} onCopy={copy} />
            <Field label="Token" value={token} onCopy={copy} />
          </div>
        </div>
      )}

      {token && (
        <button
          onClick={onContinue}
          className="self-end px-5 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
        >
          I've connected it →
        </button>
      )}
    </div>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: "#64748b" }}>{label}</span>
      <div
        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-mono text-xs"
        style={{ backgroundColor: "#0f172a", color: "#cbd5e1" }}
      >
        <span className="truncate">{value}</span>
        <button
          onClick={() => onCopy(value)}
          className="shrink-0 text-xs px-2 py-1 rounded transition-colors"
          style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function HacsSteps() {
  return (
    <ol className="flex flex-col gap-4">
      {[
        <>Open HA → <b style={{ color: "#f1f5f9" }}>HACS</b> → click the three-dot menu → <b style={{ color: "#f1f5f9" }}>Custom repositories</b></>,
        <>Paste the repo URL: <Code>https://github.com/assafco/omni-state</Code> — category: <b style={{ color: "#f1f5f9" }}>Integration</b></>,
        <>Search for <b style={{ color: "#f1f5f9" }}>OmniState</b> in HACS and click <b style={{ color: "#f1f5f9" }}>Download</b></>,
        <>Restart Home Assistant</>,
      ].map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: "#1e293b", color: "#3b82f6" }}
          >
            {i + 1}
          </span>
          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{step}</p>
        </li>
      ))}
    </ol>
  );
}

function ManualSteps() {
  return (
    <ol className="flex flex-col gap-4">
      {[
        <>Download the latest release from GitHub or clone the repo</>,
        <>Copy the <Code>custom_components/omnistate/</Code> folder into your HA <Code>/config/custom_components/</Code> directory</>,
        <>Restart Home Assistant</>,
      ].map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: "#1e293b", color: "#3b82f6" }}
          >
            {i + 1}
          </span>
          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{step}</p>
        </li>
      ))}
    </ol>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded text-xs mx-0.5"
      style={{ backgroundColor: "#1e293b", color: "#7dd3fc" }}
    >
      {children}
    </code>
  );
}

// ── Step 3: Waiting for connection ────────────────────────────────────────────

function Step3({ connected, onDone }: { connected: boolean; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-8 text-center">
      {connected ? (
        <>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: "#14532d" }}
          >
            ✓
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Connected!</h1>
            <p style={{ color: "#94a3b8" }}>
              OmniState is receiving data from your Home Assistant instance.
            </p>
          </div>
          <button
            onClick={onDone}
            className="px-6 py-3 rounded-xl font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            Go to dashboard →
          </button>
        </>
      ) : (
        <>
          <Spinner />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Waiting for first connection…</h1>
            <p style={{ color: "#94a3b8" }}>
              Checking every few seconds. Make sure you've restarted HA and added the integration.
            </p>
          </div>
          <button
            onClick={onDone}
            className="text-sm transition-colors"
            style={{ color: "#475569" }}
          >
            Skip and go to dashboard anyway →
          </button>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
      style={{ borderColor: "#1e293b", borderTopColor: "#3b82f6" }}
    />
  );
}
