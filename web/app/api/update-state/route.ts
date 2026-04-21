import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isHeartbeat =
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).type === "heartbeat";

  const now = Date.now();

  if (isHeartbeat) {
    await kv.set("server_last_seen", now);
    return NextResponse.json({ ok: true, type: "heartbeat" });
  }

  await kv.mset({
    state_data: body,
    state_updated_at: now,
    server_last_seen: now,
  });

  return NextResponse.json({ ok: true, type: "state_update" });
}
