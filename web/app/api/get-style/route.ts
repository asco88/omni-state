import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkAgentKey } from "@/lib/agent-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isAgentRequest = searchParams.get("desired") === "1";

  if (isAgentRequest) {
    const denied = checkAgentKey(req);
    if (denied) return denied;

    const [style, rev] = await Promise.all([
      kv.get<unknown>("desired_style"),
      kv.get<number>("desired_style_rev"),
    ]);
    return NextResponse.json({ style: style ?? null, rev: rev ?? null });
  }

  // Browser request — require session
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [style, updatedAt] = await Promise.all([
    kv.get<unknown>("style_data"),
    kv.get<number>("style_updated_at"),
  ]);
  return NextResponse.json({ style: style ?? null, updatedAt: updatedAt ?? null });
}
