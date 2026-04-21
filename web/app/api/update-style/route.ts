import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

// Called by the agent when omni-state-style.json changes on the server.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await kv.mset({ style_data: body, style_updated_at: Date.now() });
  return NextResponse.json({ ok: true });
}
