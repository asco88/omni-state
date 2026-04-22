import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { userKeys } from "@/lib/kv-user";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = userKeys(session.user.email);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rev = Date.now();
  await kv.mset({ [keys.desiredStyle]: body, [keys.desiredStyleRev]: rev });
  return NextResponse.json({ ok: true, rev });
}
