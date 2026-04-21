import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

// GET /api/get-style — used by UI (reads style_data)
// GET /api/get-style?desired=1 — used by agent (reads desired_style + rev)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("desired") === "1") {
    const [style, rev] = await Promise.all([
      kv.get<unknown>("desired_style"),
      kv.get<number>("desired_style_rev"),
    ]);
    return NextResponse.json({ style: style ?? null, rev: rev ?? null });
  }

  const [style, updatedAt] = await Promise.all([
    kv.get<unknown>("style_data"),
    kv.get<number>("style_updated_at"),
  ]);
  return NextResponse.json({ style: style ?? null, updatedAt: updatedAt ?? null });
}
