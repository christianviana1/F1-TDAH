// Pit Stop Shop — Redeem API route
// Requirements: 5.6 (debit wallet + record redemption with snapshots),
//               5.7 (reject if insufficient balance),
//               5.11 (reject if item inactive)

import { getAuthToken } from "@/lib/get-token";
import { getPool } from "@/lib/oracle";
import { debitWallet } from "@/lib/xp-wallet";
import { type NextRequest, NextResponse } from "next/server";
import oracledb from "oracledb";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const userId = token.id as string;

  // --- Parse & validate body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).rewardItemId !== "string" ||
    !(body as Record<string, unknown>).rewardItemId
  ) {
    return NextResponse.json({ error: "rewardItemId é obrigatório" }, { status: 400 });
  }

  const { rewardItemId } = body as { rewardItemId: string };

  // --- Get a raw connection (needed by debitWallet which manages its own commit) ---
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    // --- Fetch the reward item ---
    type ItemRow = { ID: string; USER_ID: string; NAME: string; COST: number; STATUS: string };
    const itemResult = await conn.execute<ItemRow>(
      `SELECT id, user_id, name, cost, status
       FROM reward_items
       WHERE id = :rewardItemId AND user_id = :userId`,
      { rewardItemId, userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );

    const itemRows = itemResult.rows ?? [];
    if (itemRows.length === 0) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    const item = itemRows[0];

    // Req 5.11: reject if item is not ACTIVE
    if (item.STATUS !== "ACTIVE") {
      return NextResponse.json(
        { error: "Este item não está mais disponível" },
        { status: 410 }
      );
    }

    // --- Debit wallet (Req 5.7) ---
    // debitWallet handles SELECT FOR UPDATE, balance check, UPDATE, and commit/rollback internally.
    const debitResult = await debitWallet(conn, userId, item.COST);

    if (!debitResult.success) {
      // Req 5.7: insufficient balance — 402 with the Portuguese message from debitWallet
      return NextResponse.json({ error: debitResult.error }, { status: 402 });
    }

    // --- Record redemption with snapshots (Req 5.6) ---
    // debitWallet already committed the wallet debit; now insert the redemption record.
    const redemptionId = randomUUID();
    const nameSnapshot = item.NAME;
    const costSnapshot = item.COST;

    await conn.execute(
      `INSERT INTO redemptions (id, user_id, reward_item_id, name_snapshot, cost_snapshot, redeemed_at)
       VALUES (:id, :userId, :rewardItemId, :nameSnapshot, :costSnapshot, CURRENT_TIMESTAMP)`,
      { id: redemptionId, userId, rewardItemId, nameSnapshot, costSnapshot },
      { autoCommit: false }
    );
    await conn.commit();

    // --- Fetch the redemption timestamp to include in the response ---
    type RedemptionRow = { REDEEMED_AT: Date };
    const redemptionResult = await conn.execute<RedemptionRow>(
      `SELECT redeemed_at FROM redemptions WHERE id = :id`,
      { id: redemptionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );

    const redemptionRows = redemptionResult.rows ?? [];
    const redeemedAt =
      redemptionRows.length > 0
        ? (redemptionRows[0].REDEEMED_AT as Date).toISOString()
        : new Date().toISOString();

    // --- Success response (Req 5.6) ---
    return NextResponse.json({
      success: true,
      newWalletBalance: debitResult.newBalance,
      redemption: {
        id: redemptionId,
        nameSnapshot,
        costSnapshot,
        redeemedAt,
      },
    });
  } finally {
    await conn.close();
  }
}
