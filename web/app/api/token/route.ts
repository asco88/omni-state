import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { userKeys, tokenLookupKey } from "@/lib/kv-user";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await kv.get<string>(userKeys(session.user.email).userToken);
  return NextResponse.json({ token: token ?? null });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.user.email;
  const keys  = userKeys(email);

  const oldToken = await kv.get<string>(keys.userToken);
  if (oldToken) await kv.del(tokenLookupKey(oldToken));

  const token = randomBytes(32).toString("hex");
  await kv.set(tokenLookupKey(token), email);
  await kv.set(keys.userToken, token);

  return NextResponse.json({ token });
}
