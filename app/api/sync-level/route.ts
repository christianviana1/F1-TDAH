// POST /api/sync-level — recalcula level_num a partir do XP atual
import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = token.id as string;

  const rows = await query<any>(
    `SELECT xp, level_num FROM users WHERE id = :b_userid`,
    { b_userid: userId }
  );

  if (!rows.length) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const xp: number = rows[0].XP ?? 0;
  const currentLevel: number = rows[0].LEVEL_NUM ?? 1;
  const correctLevel = Math.floor(xp / 500) + 1;

  if (correctLevel !== currentLevel) {
    await execute(
      `UPDATE users SET level_num = :b_lvl WHERE id = :b_uid`,
      { b_lvl: correctLevel, b_uid: userId }
    );
  }

  return NextResponse.json({ xp, level: correctLevel, synced: correctLevel !== currentLevel });
}
