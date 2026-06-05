// Pit Stop Shop — Item by ID API route
// Requirements: 5.5

import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { type RewardItem } from "@/app/pit-stop-shop/utils";
import { type NextRequest, NextResponse } from "next/server";

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

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await props.params;

  // --- Ownership check ---
  const existing = await query<Record<string, unknown>>(
    `SELECT id, user_id, name, description, cost, status, created_at
     FROM reward_items
     WHERE id = :id`,
    { id }
  );

  if (!existing.length || (existing[0].USER_ID as string) !== token.id) {
    return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  }

  // --- Parse body ---
  const body = await request.json();
  const { name, description, cost, status } = body as {
    name?: string;
    description?: string;
    cost?: number;
    status?: "ACTIVE" | "INACTIVE";
  };

  // --- Validate cost if provided (Requirement 5.5) ---
  if (cost !== undefined) {
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json(
        { errors: ["Custo deve ser um número inteiro maior que zero"] },
        { status: 422 }
      );
    }
  }

  // --- Validate status if provided ---
  if (status !== undefined && status !== "ACTIVE" && status !== "INACTIVE") {
    return NextResponse.json(
      { errors: ["Status deve ser ACTIVE ou INACTIVE"] },
      { status: 422 }
    );
  }

  // --- Build dynamic UPDATE SET clause (Requirement 5.5) ---
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binds: Record<string, any> = { id, userId: token.id };

  if (name !== undefined) {
    setClauses.push("name = :name");
    binds.name = name;
  }

  if (description !== undefined) {
    setClauses.push("description = :description");
    binds.description = description;
  }

  if (cost !== undefined) {
    setClauses.push("cost = :cost");
    binds.cost = cost;
  }

  if (status !== undefined) {
    // status: 'INACTIVE' just sets the field — does NOT delete (Requirement 5.5)
    setClauses.push("status = :status");
    binds.status = status;
  }

  // --- Execute UPDATE (ownership enforced in WHERE clause) ---
  await execute(
    `UPDATE reward_items
     SET ${setClauses.join(", ")}
     WHERE id = :id AND user_id = :userId`,
    binds
  );

  // --- Return updated item ---
  const rows = await query<Record<string, unknown>>(
    `SELECT id, user_id, name, description, cost, status, created_at
     FROM reward_items
     WHERE id = :id`,
    { id }
  );

  return NextResponse.json(mapRow(rows[0]));
}
