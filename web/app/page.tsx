import Image from "next/image";
import { auth } from "@/auth";
import { signIn } from "@/auth";

export const metadata = {
  title: "SiteRelay — Your home server dashboard",
  description:
    "Remote dashboard for self-hosters. Monitor your home server, Home Assistant, and connected devices from anywhere — no VPN, no port forwarding.",
};

export default async function LandingPage() {
  const session = await auth();

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: "#0f172a", color: "#f1f5f9" }}>
      <Nav user={session?.user ?? null} />
      <Hero />
      <Features />
      <HowItWorks />
      <Footer />
    </main>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ user }: { user: { name?: string | null; email?: string | null; image?: string | null } | null }) {
  return (
    <header
      className="flex items-center justify-between px-6 py-4 border-b"
      style={{ borderColor: "#1e293b" }}
    >
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="SiteRelay" width={160} height={87} priority />
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: "#1e293b", color: "#64748b" }}
        >
          beta
        </span>
      </div>
      <div className="flex items-center gap-4">
        <a
          href="https://github.com/asco88/siterelay"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:block text-sm transition-colors"
          style={{ color: "#64748b" }}
        >
          GitHub
        </a>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm" style={{ color: "#64748b" }}>
              {user.name ?? user.email}
            </span>
            <a
              href="/dashboard"
              className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#3b82f6", color: "#fff" }}
            >
              Dashboard →
            </a>
          </div>
        ) : (
          <SignInButton label="Sign In" />
        )}
      </div>
    </header>
  );
}

function SignInButton({ label = "Get Started Free" }: { label?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#3b82f6", color: "#fff" }}
      >
        {label}
      </button>
    </form>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 pt-14 sm:pt-24 pb-20 gap-8 max-w-3xl mx-auto w-full">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
          Your home server,{" "}
          <span style={{ color: "#3b82f6" }}>visible from anywhere</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto" style={{ color: "#94a3b8" }}>
          SiteRelay is a real-time remote dashboard for self-hosters. Connect
          your Home Assistant instance or Linux server and see everything — live
          — from any browser, no VPN or port forwarding needed.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <SignInButton />
        <a
          href="https://github.com/asco88/siterelay"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm px-4 py-2 rounded-lg font-medium border transition-colors hover:border-slate-500"
          style={{ borderColor: "#334155", color: "#cbd5e1" }}
        >
          View on GitHub
        </a>
      </div>

      <p className="text-xs" style={{ color: "#475569" }}>
        Free tier · No credit card · Open source
      </p>

      <DashboardPreview />
    </section>
  );
}

function DashboardPreview() {
  return (
    <div
      className="w-full rounded-2xl border overflow-hidden text-left"
      style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
    >
      {/* window chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
      >
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
        <span className="ml-3 text-xs" style={{ color: "#475569" }}>
          siterelay.app
        </span>
      </div>

      {/* mock dashboard content */}
      <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MOCK_SENSORS.map((s) => (
          <SensorCard key={s.label} {...s} />
        ))}
      </div>
      <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MockServiceCard />
        <MockActionsCard />
      </div>
    </div>
  );
}

const MOCK_SENSORS = [
  { label: "CPU", value: "4%",  sub: "0.3 avg",   dot: "#22c55e" },
  { label: "Memory", value: "29%", sub: "2.3 / 8 GB", dot: "#3b82f6" },
  { label: "Disk", value: "33%", sub: "82 / 256 GB",  dot: "#3b82f6" },
  { label: "Solar", value: "1.9 kW", sub: "battery 100%", dot: "#f59e0b" },
];

function SensorCard({ label, value, sub, dot }: { label: string; value: string; sub: string; dot: string }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1 border"
      style={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
    >
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-xs font-medium" style={{ color: "#64748b" }}>{label}</span>
      </div>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs" style={{ color: "#475569" }}>{sub}</span>
    </div>
  );
}

function MockServiceCard() {
  return (
    <div
      className="rounded-xl p-4 border flex flex-col gap-3"
      style={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Services</span>
      {[
        { name: "radio-player", ok: true },
        { name: "home-data-share", ok: true },
        { name: "real-sensors", ok: true },
      ].map((s) => (
        <div key={s.name} className="flex items-center justify-between">
          <span className="text-sm">{s.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#14532d", color: "#86efac" }}>
            running
          </span>
        </div>
      ))}
    </div>
  );
}

function MockActionsCard() {
  return (
    <div
      className="rounded-xl p-4 border flex flex-col gap-3"
      style={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Automations</span>
      {["Good morning", "Away mode", "Movie time"].map((a) => (
        <div key={a} className="flex items-center justify-between">
          <span className="text-sm">{a}</span>
          <div
            className="text-xs px-3 py-1 rounded-lg border cursor-default"
            style={{ borderColor: "#334155", color: "#94a3b8" }}
          >
            Run
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "⚡",
    title: "Real-time sync",
    body: "State pushes from your server every 15 seconds via a lightweight agent. No websockets, no open ports — just a Python script polling from the inside.",
  },
  {
    icon: "🏠",
    title: "Home Assistant native",
    body: "Install the SiteRelay custom integration via HACS or manually. All your HA sensors, switches, and automations appear as HA entities — no extra config.",
  },
  {
    icon: "🔒",
    title: "Privacy first",
    body: "Your server sends only what you configure. The agent is a single readable Python file. No telemetry, no black box. Self-host the whole stack if you want.",
  },
  {
    icon: "🌐",
    title: "Access from anywhere",
    body: "The dashboard is a plain HTTPS URL. Open it on your phone, tablet, or any browser — no VPN, no dynamic DNS, no port forwarding required.",
  },
  {
    icon: "🎨",
    title: "Fully customizable",
    body: "Dark and light themes, accent colors, drag-to-reorder sections, hide what you don't need. The layout persists across devices.",
  },
  {
    icon: "🔓",
    title: "Open source",
    body: "MIT licensed. Explore the code, contribute integrations, or self-host the entire stack. The community shapes what SiteRelay becomes.",
  },
];

function Features() {
  return (
    <section
      className="px-6 py-20 border-t"
      style={{ borderColor: "#1e293b" }}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="text-center flex flex-col gap-2">
          <h2 className="text-3xl font-bold">Everything you need, nothing you don't</h2>
          <p style={{ color: "#64748b" }}>Built for self-hosters who value simplicity and control.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-6 border flex flex-col gap-3"
              style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "1",
    title: "Sign up with Google",
    body: "One click, no forms. Your account is scoped to your email — nothing is shared between users.",
  },
  {
    n: "2",
    title: "Add an integration",
    body: "Choose Home Assistant or Custom Server. The app walks you through the setup and generates a unique token.",
  },
  {
    n: "3",
    title: "Install on your server",
    body: "Drop the HACS integration into HA, or run a one-line installer on your Linux machine. Paste the token when prompted.",
  },
  {
    n: "4",
    title: "Watch it go live",
    body: "Return to SiteRelay and your dashboard populates automatically. Sensors, services, controls — all there.",
  },
];

function HowItWorks() {
  return (
    <section
      className="px-6 py-20 border-t"
      style={{ borderColor: "#1e293b" }}
    >
      <div className="max-w-3xl mx-auto flex flex-col gap-12">
        <div className="text-center flex flex-col gap-2">
          <h2 className="text-3xl font-bold">Up and running in minutes</h2>
          <p style={{ color: "#64748b" }}>No devops experience required.</p>
        </div>
        <ol className="flex flex-col gap-6">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-5 items-start"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                style={{ backgroundColor: "#1e3a5f", color: "#3b82f6" }}
              >
                {s.n}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex justify-center">
          <SignInButton />
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="mt-auto border-t px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
      style={{ borderColor: "#1e293b", color: "#475569" }}
    >
      <span>SiteRelay — MIT License</span>
      <div className="flex items-center gap-6">
        <a
          href="https://github.com/asco88/siterelay"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-300 transition-colors"
        >
          GitHub
        </a>
        <a href="/login" className="hover:text-slate-300 transition-colors">
          Sign in
        </a>
      </div>
    </footer>
  );
}
