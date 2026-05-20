import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { resolveEmail } from "@/lib/auth-any";
import { userKeys } from "@/lib/kv-user";

const OFFLINE_THRESHOLD_MS = 60_000;

export async function GET(req: NextRequest) {
  const result = await resolveEmail(req);
  if (result instanceof NextResponse) return result;
  const keys = userKeys(result);

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
