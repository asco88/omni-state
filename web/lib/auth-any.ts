import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { tokenLookupKey } from "./kv-user";

/**
 * Resolves the caller's email from either a Bearer token (agent/HA integration)
 * or a Google OAuth session (browser dashboard). Bearer token takes precedence.
 */
export async function resolveEmail(
  req: NextRequest,
): Promise<string | NextResponse> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    const email = await kv.get<string>(tokenLookupKey(token));
    if (email) return email;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await auth();
  if (session?.user?.email) return session.user.email;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
