// Pit Stop Shop — Redemptions API route
// Requirements: 5.8

import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { type Redemption } from "@/app/pit-stop-shop/utils";
import { type NextRequest, NextResponse } from "next/server";

/** Map raw Oracle row (uppercase keys) to Redemption. */
function mapRow(r: Record<string, unknown>): Redemption {
  return {
    id: r.ID as string,
    userId: r.USER_ID as string,
    rewardItemId: r.REWARD_ITEM_ID as string,
    nameSnapshot: r.NAME_SNAPSHOT as string,
    costSnapshot: r.COST_SNAPSHOT as number,
    redeemedAt: (r.REDEEMED_AT as Date).toISOString(),
  };
}

export async function GET(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Query Oracle ---
  const rows = await query<Record<string, unknown>>(
    `SELECT id, user_id, reward_item_id, name_snapshot, cost_snapshot, redeemed_at
     FROM redemptions
     WHERE user_id = :userId
     ORDER BY redeemed_at DESC`,
    { userId: token.id }
  );

  const redemptions: Redemption[] = rows.map(mapRow);

  return NextResponse.json(redemptions);
}
