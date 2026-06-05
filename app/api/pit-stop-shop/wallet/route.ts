// Pit Stop Shop — Wallet API route
// Requirements: 5.1, 5.9

import { getAuthToken } from "@/lib/get-token";
import { query } from "@/lib/oracle";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // --- Auth ---
  const token = await getAuthToken(request);
  if (!token?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // --- Query Oracle ---
  const rows = await query<Record<string, unknown>>(
    `SELECT xp_wallet FROM users WHERE id = :userId`,
    { userId: token.id }
  );

  if (!rows.length) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const walletBalance = rows[0].XP_WALLET as number;

  return NextResponse.json({ walletBalance });
}
