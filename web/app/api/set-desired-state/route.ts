import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rev = Date.now();
  await kv.mset({ desired_state: body, desired_state_rev: rev });

  return NextResponse.json({ ok: true, rev });
}
