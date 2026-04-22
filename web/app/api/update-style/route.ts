import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgentEmail } from "@/lib/agent-auth";
import { userKeys } from "@/lib/kv-user";

export async function POST(req: NextRequest) {
  const result = await resolveAgentEmail(req);
  if (result instanceof NextResponse) return result;
  const keys = userKeys(result.email);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await kv.mset({
    [keys.styleData]:      body,
    [keys.styleUpdatedAt]: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
