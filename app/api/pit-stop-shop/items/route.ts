// Pit Stop Shop — Items API route
// Requirements: 5.3, 5.4

import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { type RewardItem, validateRewardItem } from "@/app/pit-stop-shop/utils";
import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/** Map raw Oracle row (uppercase keys) to RewardItem. */
function mapRow(r: Record<string, unknown>): RewardItem {
  return {
    id: r.ID as string,
    userId: r.USER_ID as string,
    name: r.NAME as string,
    description: (r.DESCRIPTION as string | null) ?? "",
    cost: r.COST as number,
    status: r.STATUS as RewardItem["status"],
    createdAt: (r.CREATED_AT as Date).toISOString(),
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
    `SELECT id, user_id, name, description, cost, status, created_at
     FROM reward_items
     WHERE user_id = :userId
       AND status = 'ACTIVE'
     ORDER BY created_at DESC`,
    { userId: token.id }
  );

  const items: RewardItem[] = rows.map(mapRow);

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Parse body ---
  const body = await request.json();
  const { name, description, cost } = body as {
    name: string;
    description?: string;
    cost: number;
  };

  // --- Validate (Requirement 5.3) ---
  const validation = validateRewardItem(name ?? "", description ?? "", cost);
  if (!validation.valid) {
    return NextResponse.json({ errors: validation.errors }, { status: 422 });
  }

  // --- Insert ---
  const id = randomUUID();
  await execute(
    `INSERT INTO reward_items (id, user_id, name, description, cost, status, created_at, updated_at)
     VALUES (:id, :userId, :name, :description, :cost, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    {
      id,
      userId: token.id,
      name,
      description: description ?? "",
      cost,
    }
  );

  // --- Fetch and return created item (Requirement 5.4) ---
  const rows = await query<Record<string, unknown>>(
    `SELECT id, user_id, name, description, cost, status, created_at
     FROM reward_items
     WHERE id = :id`,
    { id }
  );

  return NextResponse.json(mapRow(rows[0]), { status: 201 });
}
