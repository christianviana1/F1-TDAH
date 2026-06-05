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
    `SELECT id FROM users WHERE email = :email`,
    { email }
  );
  if (existing.length) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }

  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, password_hash)
     VALUES (:id, :name, :email, :passwordHash)`,
    { id, name, email, passwordHash: hashPassword(password) }
  );

  return NextResponse.json({ id, email }, { status: 201 });
}
