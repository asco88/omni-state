import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { resolveEmail } from "@/lib/auth-any";
import { userKeys } from "@/lib/kv-user";

export async function POST(req: NextRequest) {
  const result = await resolveEmail(req);
  if (result instanceof NextResponse) return result;
  const keys = userKeys(result);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rev = Date.now();
  await kv.mset({ [keys.desiredState]: body, [keys.desiredStateRev]: rev });
  return NextResponse.json({ ok: true, rev });
}
