import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { checkAgentKey } from "@/lib/agent-auth";

export async function POST(req: NextRequest) {
  const denied = checkAgentKey(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await kv.mset({ style_data: body, style_updated_at: Date.now() });
  return NextResponse.json({ ok: true });
}
