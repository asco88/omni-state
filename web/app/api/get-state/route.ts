import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

const OFFLINE_THRESHOLD_MS = 60_000; // 60s — 2× the heartbeat interval

export async function GET() {
  const [stateData, stateUpdatedAt, serverLastSeen, desiredStateRev] =
    await Promise.all([
      kv.get<unknown>("state_data"),
      kv.get<number>("state_updated_at"),
      kv.get<number>("server_last_seen"),
      kv.get<number>("desired_state_rev"),
    ]);

  const now = Date.now();
  const isOnline =
    serverLastSeen !== null && now - serverLastSeen < OFFLINE_THRESHOLD_MS;

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
