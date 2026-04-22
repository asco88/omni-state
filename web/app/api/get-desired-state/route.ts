import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { resolveAgentEmail } from "@/lib/agent-auth";
import { userKeys } from "@/lib/kv-user";

export async function GET(req: NextRequest) {
  const result = await resolveAgentEmail(req);
  if (result instanceof NextResponse) return result;
  const keys = userKeys(result.email);

  const [state, rev] = await Promise.all([
    kv.get<unknown>(keys.desiredState),
    kv.get<number>(keys.desiredStateRev),
  ]);

  return NextResponse.json({ state: state ?? null, rev: rev ?? null });
}
