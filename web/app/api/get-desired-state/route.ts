import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export async function GET() {
  const [state, rev] = await Promise.all([
    kv.get<unknown>("desired_state"),
    kv.get<number>("desired_state_rev"),
  ]);

  return NextResponse.json({ state: state ?? null, rev: rev ?? null });
}
