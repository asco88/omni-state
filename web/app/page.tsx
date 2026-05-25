import Image from "next/image";
import { auth } from "@/auth";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 backdrop-blur-sm sticky top-0 z-50" style={{ backgroundColor: "rgba(15,23,42,0.9)" }}>
      <div className="flex items-center gap-2">
        <Image src="/logo-v2.png" alt="SiteRelay" width={160} height={90} priority />
        <Badge variant="outline" className="text-xs border-white/20 text-slate-400">beta</Badge>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="https://github.com/asco88/siterelay"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:block text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          GitHub
        </a>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-400">{user.name ?? user.email}</span>
            <Button size="sm" onClick={undefined}>
              <a href="/dashboard" className="contents">Dashboard →</a>
            </Button>
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
      <Button type="submit" size="sm">{label}</Button>
    </form>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 pt-20 sm:pt-28 pb-20 gap-8 max-w-3xl mx-auto w-full">
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
          Your home server,{" "}
          <span className="text-blue-400">visible from anywhere</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto text-slate-400">
          SiteRelay is a real-time remote dashboard for self-hosters. Connect
          your Home Assistant instance or Linux server and see everything — live
          — from any browser, no VPN or port forwarding needed.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <SignInButton label="Get Started Free" />
        <a
          href="https://github.com/asco88/siterelay"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/40 hover:text-white"
        >
          View on GitHub
        </a>
      </div>

      <p className="text-xs text-slate-500">Free tier · No credit card · Open source</p>

      <DashboardPreview />
    </section>
  );
}

function DashboardPreview() {
  return (
    <Card className="w-full text-left border-white/10 bg-slate-900/80 shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-slate-950/60 rounded-t-xl">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-3 text-xs text-slate-500">siterelay.app</span>
      </div>
      <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MOCK_SENSORS.map((s) => (
          <MockSensorCard key={s.label} {...s} />
        ))}
      </CardContent>
      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MockServiceCard />
        <MockActionsCard />
      </div>
    </Card>
  );
}

const MOCK_SENSORS = [
  { label: "CPU",    value: 4,  display: "4%",       sub: "0.3 avg",      color: "bg-green-500",  pct: 4  },
  { label: "Memory", value: 29, display: "29%",       sub: "2.3 / 8 GB",   color: "bg-blue-500",   pct: 29 },
  { label: "Disk",   value: 33, display: "33%",       sub: "82 / 256 GB",  color: "bg-blue-500",   pct: 33 },
  { label: "Solar",  value: 80, display: "1.9 kW",    sub: "battery 100%", color: "bg-yellow-500", pct: 80 },
];

function MockSensorCard({ label, display, sub, color, pct }: { label: string; display: string; sub: string; color: string; pct: number }) {
  return (
    <Card className="bg-slate-950/60 border-white/10">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-xs font-medium text-slate-400">{label}</span>
        </div>
        <span className="text-xl font-bold text-white">{display}</span>
        <Progress value={pct} className="h-1.5" />
        <span className="text-xs text-slate-500">{sub}</span>
      </CardContent>
    </Card>
  );
}

function MockServiceCard() {
  return (
    <Card className="bg-slate-950/60 border-white/10">
      <CardContent className="p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Services</span>
        {["radio-player", "home-data-share", "real-sensors"].map((name) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-sm text-slate-200">{name}</span>
            <Badge className="bg-green-950 text-green-400 border-green-800 text-xs">running</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MockActionsCard() {
  return (
    <Card className="bg-slate-950/60 border-white/10">
      <CardContent className="p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Automations</span>
        {["Good morning", "Away mode", "Movie time"].map((a) => (
          <div key={a} className="flex items-center justify-between">
            <span className="text-sm text-slate-200">{a}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs border-white/20 text-slate-400 bg-transparent hover:bg-white/10">
              Run
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
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
    <section className="px-6 py-20 border-t border-white/10">
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="text-center flex flex-col gap-2">
          <h2 className="text-3xl font-bold text-white">Everything you need, nothing you don't</h2>
          <p className="text-slate-400">Built for self-hosters who value simplicity and control.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <Card key={f.title} className="bg-slate-800/60 border-white/10 hover:border-white/20 transition-colors">
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.body}</p>
              </CardContent>
            </Card>
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
    <section className="px-6 py-20 border-t border-white/10">
      <div className="max-w-3xl mx-auto flex flex-col gap-12">
        <div className="text-center flex flex-col gap-2">
          <h2 className="text-3xl font-bold text-white">Up and running in minutes</h2>
          <p className="text-slate-400">No devops experience required.</p>
        </div>
        <ol className="flex flex-col gap-6">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-5 items-start">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 bg-blue-950 text-blue-400 border border-blue-800">
                {s.n}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex justify-center">
          <SignInButton label="Get Started Free" />
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
      <span>SiteRelay — MIT License</span>
      <div className="flex items-center gap-6">
        <a href="https://github.com/asco88/siterelay" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
          GitHub
        </a>
        <a href="/login" className="hover:text-slate-300 transition-colors">Sign in</a>
      </div>
    </footer>
  );
}
