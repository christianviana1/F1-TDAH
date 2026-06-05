// GET  /api/friends  — lista amigos aceitos + pedidos pendentes
// POST /api/friends  — envia pedido de amizade (body: { email })
import { getAuthToken } from "@/lib/get-token";
import { query, execute } from "@/lib/oracle";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = token.id as string;

  try {
    // Amigos aceitos — caso 1: eu sou user_id
    const acceptedA = await query<any>(
      `SELECT u.id, u.name, u.email, u.xp, u.level_num AS lvl, f.id AS friendship_id
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = :b_uid AND f.status = 'ACCEPTED'
       ORDER BY u.xp DESC`,
      { b_uid: userId }
    );

    // Amigos aceitos — caso 2: eu sou friend_id
    const acceptedB = await query<any>(
      `SELECT u.id, u.name, u.email, u.xp, u.level_num AS lvl, f.id AS friendship_id
       FROM friendships f
       JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = :b_uid AND f.status = 'ACCEPTED'
       ORDER BY u.xp DESC`,
      { b_uid: userId }
    );

    const accepted = [...acceptedA, ...acceptedB]
      .sort((a: any, b: any) => (b.XP ?? 0) - (a.XP ?? 0));

    // Pedidos pendentes recebidos
    const pending = await query<any>(
      `SELECT u.id, u.name, u.email, f.id AS friendship_id
       FROM friendships f
       JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = :b_uid AND f.status = 'PENDING'
       ORDER BY f.created_at DESC`,
      { b_uid: userId }
    );

    // Pedidos pendentes enviados
    const sent = await query<any>(
      `SELECT u.id, u.name, u.email, f.id AS friendship_id
       FROM friendships f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = :b_uid AND f.status = 'PENDING'
       ORDER BY f.created_at DESC`,
      { b_uid: userId }
    );

    return NextResponse.json({
      friends: accepted.map((r: any) => ({
        id: r.ID, name: r.NAME, email: r.EMAIL,
        xp: r.XP, level: r.LVL, friendshipId: r.FRIENDSHIP_ID,
      })),
      pending: pending.map((r: any) => ({
        id: r.ID, name: r.NAME, email: r.EMAIL, friendshipId: r.FRIENDSHIP_ID,
      })),
      sent: sent.map((r: any) => ({
        id: r.ID, name: r.NAME, email: r.EMAIL, friendshipId: r.FRIENDSHIP_ID,
      })),
    });
  } catch (err: any) {
    if (err?.errorNum === 942 || err?.errorNum === 904) {
      return NextResponse.json({ friends: [], pending: [], sent: [] });
    }
    console.error('[friends GET]', err?.errorNum, err?.message);
    return NextResponse.json({ friends: [], pending: [], sent: [] });
  }
}

export async function POST(request: NextRequest) {
  const token = await getAuthToken(request);
  if (!token?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = token.id as string;
  const body = await request.json().catch(() => ({}));
  const { email } = body as { email?: string };

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  }

  const targets = await query<any>(
    `SELECT id, name FROM users WHERE LOWER(email) = LOWER(:b_email)`,
    { b_email: email.trim() }
  );

  if (!targets.length) {
    return NextResponse.json({ error: "Piloto não encontrado com esse email" }, { status: 404 });
  }

  const target = targets[0];
  const friendId = target.ID as string;

  if (friendId === userId) {
    return NextResponse.json({ error: "Você não pode adicionar a si mesmo" }, { status: 400 });
  }

  try {
    const existingA = await query<any>(
      `SELECT id FROM friendships WHERE user_id = :b_uid AND friend_id = :b_fid`,
      { b_uid: userId, b_fid: friendId }
    );
    const existingB = await query<any>(
      `SELECT id FROM friendships WHERE user_id = :b_fid AND friend_id = :b_uid`,
      { b_fid: friendId, b_uid: userId }
    );

    if (existingA.length || existingB.length) {
      return NextResponse.json({ error: "Pedido já existe ou vocês já são amigos" }, { status: 409 });
    }

    const newId = crypto.randomUUID();
    await execute(
      `INSERT INTO friendships (id, user_id, friend_id, status) VALUES (:b_id, :b_uid, :b_fid, 'PENDING')`,
      { b_id: newId, b_uid: userId, b_fid: friendId }
    );

    return NextResponse.json({ message: `Pedido enviado para ${target.NAME}` }, { status: 201 });
  } catch (err: any) {
    if (err?.errorNum === 942) {
      return NextResponse.json(
        { error: "Execute node scripts/migrate-friends.js para habilitar amizades" },
        { status: 503 }
      );
    }
    throw err;
  }
}
