import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { tokenLookupKey } from "./kv-user";

export async function resolveAgentEmail(
  req: NextRequest,
): Promise<{ email: string } | NextResponse> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = header.slice(7);
  const email = await kv.get<string>(tokenLookupKey(token));
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { email };
}
