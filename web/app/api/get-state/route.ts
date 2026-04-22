import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const OFFLINE_THRESHOLD_MS = 60_000;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [stateData, stateUpdatedAt, serverLastSeen, desiredStateRev] =
    await Promise.all([
      kv.get<unknown>("state_data"),
      kv.get<number>("state_updated_at"),
      kv.get<number>("server_last_seen"),
      kv.get<number>("desired_state_rev"),
    ]);

  const now = Date.now();
  const isOnline = serverLastSeen !== null && now - serverLastSeen < OFFLINE_THRESHOLD_MS;
  const hasPending =
    desiredStateRev !== null &&
    (stateUpdatedAt === null || desiredStateRev > stateUpdatedAt);

  return NextResponse.json({
    state: stateData ?? null,
    updatedAt: stateUpdatedAt ?? null,
    serverOnline: isOnline,
    serverLastSeen: serverLastSeen ?? null,
    hasPending,
  });
}
