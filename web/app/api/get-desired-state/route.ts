import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { checkAgentKey } from "@/lib/agent-auth";

export async function GET(req: NextRequest) {
  const denied = checkAgentKey(req);
  if (denied) return denied;

  const [state, rev] = await Promise.all([
    kv.get<unknown>("desired_state"),
    kv.get<number>("desired_state_rev"),
  ]);

  return NextResponse.json({ state: state ?? null, rev: rev ?? null });
}
