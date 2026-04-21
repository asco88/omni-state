import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

// Called by the UI when the user changes appearance settings.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rev = Date.now();
  await kv.mset({ desired_style: body, desired_style_rev: rev });
  return NextResponse.json({ ok: true, rev });
}
