import { NextRequest, NextResponse } from "next/server";

export function checkAgentKey(req: NextRequest): NextResponse | null {
  const key = process.env.OMNISTATE_API_KEY;
  if (!key) return null; // key not configured → allow (backward compat)
  if (req.headers.get("authorization") === `Bearer ${key}`) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
