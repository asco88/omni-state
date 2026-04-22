import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { userKeys } from "@/lib/kv-user";

const OFFLINE_THRESHOLD_MS = 60_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = userKeys(session.user.email);

  const [stateData, stateUpdatedAt, serverLastSeen, desiredStateRev] =
    await Promise.all([
      kv.get<unknown>(keys.stateData),
      kv.get<number>(keys.stateUpdatedAt),
      kv.get<number>(keys.serverLastSeen),
      kv.get<number>(keys.desiredStateRev),
    ]);

  const now = Date.now();
  const isOnline   = serverLastSeen !== null && now - serverLastSeen < OFFLINE_THRESHOLD_MS;
  const hasPending = desiredStateRev !== null && (stateUpdatedAt === null || desiredStateRev > stateUpdatedAt);

  return NextResponse.json({
    state:          stateData ?? null,
    updatedAt:      stateUpdatedAt ?? null,
    serverOnline:   isOnline,
    serverLastSeen: serverLastSeen ?? null,
    hasPending,
  });
}
