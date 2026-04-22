import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveAgentEmail } from "@/lib/agent-auth";
import { userKeys } from "@/lib/kv-user";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("desired") === "1") {
    const result = await resolveAgentEmail(req);
    if (result instanceof NextResponse) return result;
    const keys = userKeys(result.email);

    const [style, rev] = await Promise.all([
      kv.get<unknown>(keys.desiredStyle),
      kv.get<number>(keys.desiredStyleRev),
    ]);
    return NextResponse.json({ style: style ?? null, rev: rev ?? null });
  }

  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = userKeys(session.user.email);

  const [style, updatedAt] = await Promise.all([
    kv.get<unknown>(keys.styleData),
    kv.get<number>(keys.styleUpdatedAt),
  ]);
  return NextResponse.json({ style: style ?? null, updatedAt: updatedAt ?? null });
}
