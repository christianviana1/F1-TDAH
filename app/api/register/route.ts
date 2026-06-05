import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { createHash } from "crypto";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, password } = body;

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Preencha todos os campos" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Senha precisa ter pelo menos 6 caracteres" },
      { status: 400 }
    );
  }

  const existing = await query<any>(
    `SELECT id FROM users WHERE email = :b_email`,
    { b_email: email }
  );
  if (existing.length) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }

  const b_id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, password_hash)
     VALUES (:b_id, :b_name, :b_email, :b_pw)`,
    { b_id, b_name: name, b_email: email, b_pw: hashPassword(password) }
  );

  return NextResponse.json({ id: b_id, email }, { status: 201 });
}
