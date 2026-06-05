// PATCH /api/friends/[id]  — aceitar ou rejeitar pedido (body: { action: 'accept'|'reject' })
// DELETE /api/friends/[id] — remover amizade
import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: friendshipId } = await props.params;
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: "accept" | "reject" };

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "action deve ser 'accept' ou 'reject'" }, { status: 400 });
  }

  const rows = await query<any>(
    `SELECT id, status FROM friendships WHERE id = :b_fid AND friend_id = :b_uid`,
    { b_fid: friendshipId, b_uid: token.id }
  );

  if (!rows.length) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (rows[0].STATUS !== "PENDING") return NextResponse.json({ error: "Pedido não está pendente" }, { status: 400 });

  const newStatus = action === "accept" ? "ACCEPTED" : "REJECTED";
  await execute(
    `UPDATE friendships SET status = :b_st WHERE id = :b_fid`,
    { b_st: newStatus, b_fid: friendshipId }
  );

  return NextResponse.json({ message: action === "accept" ? "Amizade aceita 🏎️" : "Pedido rejeitado" });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: friendshipId } = await props.params;
  const userId = token.id as string;

  const rows = await query<any>(
    `SELECT id FROM friendships WHERE id = :b_fid AND (user_id = :b_uid1 OR friend_id = :b_uid2)`,
    { b_fid: friendshipId, b_uid1: userId, b_uid2: userId }
  );

  if (!rows.length) return NextResponse.json({ error: "Amizade não encontrada" }, { status: 404 });

  await execute(`DELETE FROM friendships WHERE id = :b_fid`, { b_fid: friendshipId });
  return NextResponse.json({ message: "Amizade removida" });
}
