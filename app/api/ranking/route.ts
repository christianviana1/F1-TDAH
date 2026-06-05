import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { getAuthToken } from "@/lib/get-token";

// Fallback: ranking global dos top usuários
async function globalRanking() {
  const rows = await query<any>(
    `SELECT id, name, xp, level_num FROM users ORDER BY xp DESC FETCH FIRST 10 ROWS ONLY`
  );
  return rows.map((r: any) => ({ id: r.ID, name: r.NAME, xp: r.XP, level: r.LEVEL_NUM }));
}

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = token.id as string;

  // Step 1: collect friend IDs (two separate queries to avoid repeated bind names)
  let friendIds: string[] = [userId];

  try {
    const ra = await query<any>(
      `SELECT friend_id AS fid FROM friendships WHERE user_id = :a AND status = 'ACCEPTED'`,
      { a: userId }
    );
    const rb = await query<any>(
      `SELECT user_id AS fid FROM friendships WHERE friend_id = :b AND status = 'ACCEPTED'`,
      { b: userId }
    );
    friendIds = [...new Set([userId, ...ra.map((r: any) => r.FID as string), ...rb.map((r: any) => r.FID as string)])];
  } catch (err: any) {
    // Table doesn't exist yet — fall back to global ranking
    if (err?.errorNum === 942) return NextResponse.json(await globalRanking());
    throw err;
  }

  // Step 2: fetch user rows one by one and merge (avoids IN with dynamic bind names)
  try {
    const userRows = await Promise.all(
      friendIds.map((uid) =>
        query<any>(
          `SELECT id, name, xp, level_num FROM users WHERE id = :uid`,
          { uid }
        ).then((rows) => rows[0] ?? null)
      )
    );

    const ranking = userRows
      .filter(Boolean)
      .map((r: any) => ({ id: r.ID, name: r.NAME, xp: r.XP, level: r.LEVEL_NUM }))
      .sort((a, b) => b.xp - a.xp);

    return NextResponse.json(ranking);
  } catch {
    return NextResponse.json(await globalRanking());
  }
}
