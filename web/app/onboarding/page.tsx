"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type IntegrationType = "home_assistant" | "custom_server";
type HaTab     = "hacs" | "manual";
type AgentTab  = "guided" | "manual";
type Step = 1 | 2 | 3;

const REPO = "https://github.com/asco88/omni-state";

// ── Root ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]           = useState<Step>(1);
  const [integration, setInteg]   = useState<IntegrationType | null>(null);
  const [token, setToken]         = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // If they already have a token they've been through onboarding — send to dashboard
  useEffect(() => {
    fetch("/api/token")
      .then(r => r.json())
      .then(d => { if (d.token) router.replace("/dashboard"); });
  }, [router]);

  // Step 3: poll until server comes online
  useEffect(() => {
    if (step !== 3) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/get-state").then(r => r.json());
      if (res.serverOnline) { setConnected(true); clearInterval(id); }
    }, 3000);
    return () => clearInterval(id);
  }, [step]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#0f172a", color: "#f1f5f9" }}
    >
      <div className="w-full max-w-xl flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <a href="/" className="text-sm font-bold tracking-tight mb-2 self-start" style={{ color: "#3b82f6" }}>
            OmniState
          </a>
          <StepIndicator current={step} />
        </div>

        {step === 1 && (
          <Step1 onSelect={(t) => { setInteg(t); setStep(2); }} />
        )}
        {step === 2 && integration === "home_assistant" && (
          <Step2HA token={token} onTokenGenerated={setToken} onContinue={() => setStep(3)} />
        )}
        {step === 2 && integration === "custom_server" && (
          <Step2Agent token={token} onTokenGenerated={setToken} onContinue={() => setStep(3)} />
        )}
        {step === 3 && (
          <Step3
            integration={integration}
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
        const done = current > n, active = current === n;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: done ? "#22c55e" : active ? "#3b82f6" : "#1e293b", color: done || active ? "#fff" : "#475569" }}
            >
              {done ? "✓" : n}
            </div>
            <span className="text-sm hidden sm:inline" style={{ color: active ? "#f1f5f9" : "#475569" }}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-8 h-px mx-1" style={{ backgroundColor: "#1e293b" }} />}
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
        <p style={{ color: "#94a3b8" }}>Choose how you want to connect your home server to OmniState.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <IntegrationCard
          icon="🏠"
          title="Home Assistant"
          description="Sync sensors, entities, switches, and automations from your HA instance."
          onClick={() => onSelect("home_assistant")}
        />
        <IntegrationCard
          icon="🖥️"
          title="Custom Server"
          description="Run a lightweight Python agent on any Linux machine to push server metrics."
          onClick={() => onSelect("custom_server")}
        />
      </div>

      <p className="text-xs text-center" style={{ color: "#475569" }}>
        More integrations coming — Proxmox, Synology, and others.
      </p>
    </div>
  );
}

function IntegrationCard({ icon, title, description, onClick }: {
  icon: string; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl p-6 border flex flex-col gap-3 transition-colors"
      style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#334155"; }}
    >
      <span className="text-3xl">{icon}</span>
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        <p className="text-sm" style={{ color: "#94a3b8" }}>{description}</p>
      </div>
    </button>
  );
}

// ── Shared token UI ───────────────────────────────────────────────────────────

function TokenSection({ token, description, onGenerated }: {
  token: string | null;
  description: string;
  onGenerated: (t: string) => void;
}) {
  const [generating, setGen] = useState(false);
  const [copied, setCopied]  = useState(false);

  async function generate() {
    setGen(true);
    const d = await fetch("/api/token", { method: "POST" }).then(r => r.json());
    onGenerated(d.token);
    setGen(false);
  }

  function copy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Your integration token</h2>
        <p className="text-sm" style={{ color: "#94a3b8" }}>{description}</p>
      </div>
      {token ? (
        <div className="flex flex-col gap-3">
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 border font-mono text-sm"
            style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
          >
            <span className="truncate" style={{ color: "#86efac" }}>{token}</span>
            <button
              onClick={copy}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: "#334155", color: copied ? "#22c55e" : "#cbd5e1" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "#475569" }}>
            Keep this token private. Regenerate it any time from dashboard Settings.
          </p>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={generating}
          className="self-start px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
        >
          {generating ? "Generating…" : "Generate token"}
        </button>
      )}
    </div>
  );
}

// ── Step 2 — Home Assistant ───────────────────────────────────────────────────

function Step2HA({ token, onTokenGenerated, onContinue }: {
  token: string | null; onTokenGenerated: (t: string) => void; onContinue: () => void;
}) {
  const [tab, setTab] = useState<HaTab>("hacs");
  const DASHBOARD_URL = typeof window !== "undefined" ? window.location.origin : "https://omni-state.vercel.app";

  function copy(text: string) { navigator.clipboard.writeText(text); }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Install the Home Assistant integration</h1>
        <p style={{ color: "#94a3b8" }}>
          Follow the steps below, then generate your token and paste it into HA.
        </p>
      </div>

      <Tabs
        tabs={[{ id: "hacs", label: "HACS (recommended)" }, { id: "manual", label: "Manual" }]}
        active={tab}
        onChange={t => setTab(t as HaTab)}
      >
        {tab === "hacs" ? (
          <Steps items={[
            <>Open HA → <B>HACS</B> → three-dot menu → <B>Custom repositories</B></>,
            <>Add <Code>{REPO}</Code> — category: <B>Integration</B></>,
            <>Search for <B>OmniState</B> in HACS → <B>Download</B></>,
            <>Restart Home Assistant</>,
          ]} />
        ) : (
          <Steps items={[
            <>Copy <Code>custom_components/omnistate/</Code> from the <a href={REPO} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>GitHub repo</a> into your HA <Code>/config/custom_components/</Code> directory</>,
            <>Restart Home Assistant</>,
          ]} />
        )}
      </Tabs>

      <TokenSection
        token={token}
        description="Generate a token and paste it into the OmniState integration in HA."
        onGenerated={onTokenGenerated}
      />

      {token && (
        <div
          className="rounded-2xl border p-5 flex flex-col gap-4"
          style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
        >
          <p className="text-sm font-medium">
            In Home Assistant → Settings → Integrations → Add → search <span style={{ color: "#3b82f6" }}>OmniState</span>, then enter:
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

// ── Step 2 — Custom Server (Python agent) ─────────────────────────────────────

function Step2Agent({ token, onTokenGenerated, onContinue }: {
  token: string | null; onTokenGenerated: (t: string) => void; onContinue: () => void;
}) {
  const [tab, setTab] = useState<AgentTab>("guided");
  const DASHBOARD_URL = typeof window !== "undefined" ? window.location.origin : "https://omni-state.vercel.app";

  const configSnippet = `{
  "vercel_url": "${DASHBOARD_URL}",
  "api_key": "${token ?? "<paste-token-here>"}"
}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Install the server agent</h1>
        <p style={{ color: "#94a3b8" }}>
          A lightweight Python process that collects metrics and pushes them to OmniState every 15 seconds.
          Runs on any Ubuntu / Debian machine.
        </p>
      </div>

      <Tabs
        tabs={[{ id: "guided", label: "Guided installer (recommended)" }, { id: "manual", label: "Manual" }]}
        active={tab}
        onChange={t => setTab(t as AgentTab)}
      >
        {tab === "guided" ? (
          <div className="flex flex-col gap-4">
            <Steps items={[
              <>Generate your token below, then run this on your server:</>,
            ]} />
            <ShellBlock>{`curl -fsSL ${DASHBOARD_URL}/install.sh | bash`}</ShellBlock>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              The installer will prompt for your token and set up a systemd service automatically.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Steps items={[
              <>Clone the repo on your server:</>,
            ]} />
            <ShellBlock>{`git clone ${REPO}
cd omni-state
pip install requests psutil`}</ShellBlock>
            <Steps items={[
              <>Copy the example config and fill in your token:</>,
            ]} />
            <ShellBlock>{`cp config.json.example config.json`}</ShellBlock>
            <Steps items={[
              <>Edit <Code>config.json</Code> and set these two fields:</>,
            ]} />
            <ShellBlock>{configSnippet}</ShellBlock>
            <Steps items={[
              <>Start the agent:</>,
            ]} />
            <ShellBlock>{`python3 agent.py`}</ShellBlock>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              To run as a persistent service, see the{" "}
              <a href={`${REPO}#linux-server-agent`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
                README
              </a>{" "}
              for systemd setup instructions.
            </p>
          </div>
        )}
      </Tabs>

      <TokenSection
        token={token}
        description="Generate a token, then paste it when the installer asks or set it in config.json."
        onGenerated={onTokenGenerated}
      />

      {token && (
        <button
          onClick={onContinue}
          className="self-end px-5 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
        >
          I've started the agent →
        </button>
      )}
    </div>
  );
}

// ── Step 3: Waiting for connection ────────────────────────────────────────────

function Step3({ integration, connected, onDone }: {
  integration: IntegrationType | null; connected: boolean; onDone: () => void;
}) {
  const source = integration === "custom_server" ? "your server" : "your Home Assistant instance";
  return (
    <div className="flex flex-col items-center gap-8 py-8 text-center">
      {connected ? (
        <>
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: "#14532d" }}>
            ✓
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Connected!</h1>
            <p style={{ color: "#94a3b8" }}>OmniState is receiving data from {source}.</p>
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
              Checking every few seconds. Make sure the agent is running and the token matches.
            </p>
          </div>
          <button onClick={onDone} className="text-sm" style={{ color: "#475569" }}>
            Skip and go to dashboard anyway →
          </button>
        </>
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Tabs({ tabs, active, onChange, children }: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#334155" }}>
      <div className="flex border-b" style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="px-5 py-3 text-sm font-medium"
            style={{
              color: active === t.id ? "#f1f5f9" : "#64748b",
              borderBottom: active === t.id ? "2px solid #3b82f6" : "2px solid transparent",
              backgroundColor: "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-6 flex flex-col gap-4" style={{ backgroundColor: "#0f172a" }}>
        {children}
      </div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: "#1e293b", color: "#3b82f6" }}
          >
            {i + 1}
          </span>
          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{item}</p>
        </li>
      ))}
    </ol>
  );
}

function ShellBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div
      className="relative rounded-xl px-4 py-3 font-mono text-xs leading-relaxed"
      style={{ backgroundColor: "#1e293b", color: "#7dd3fc" }}
    >
      <pre className="whitespace-pre-wrap pr-12">{children}</pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded"
        style={{ backgroundColor: "#334155", color: copied ? "#22c55e" : "#94a3b8" }}
      >
        {copied ? "✓" : "Copy"}
      </button>
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
          className="shrink-0 text-xs px-2 py-1 rounded"
          style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-xs mx-0.5" style={{ backgroundColor: "#1e293b", color: "#7dd3fc" }}>
      {children}
    </code>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <b style={{ color: "#f1f5f9" }}>{children}</b>;
}

function Spinner() {
  return (
    <div
      className="w-12 h-12 rounded-full border-4 animate-spin"
      style={{ borderColor: "#1e293b", borderTopColor: "#3b82f6" }}
    />
  );
}
