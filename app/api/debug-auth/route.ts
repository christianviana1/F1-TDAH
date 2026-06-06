// Endpoint de diagnóstico — remover após resolver o problema
import { NextResponse } from "next/server";

export async function GET() {
  // Testa conexão Oracle
  let oracleStatus = "não testado";
  let userLookupStatus = "não testado";
  try {
    const { query } = await import("@/lib/oracle");
    const rows = await query<any>("SELECT 1 AS ok FROM dual");
    oracleStatus = rows.length > 0 ? "✅ conectado" : "❌ sem resultado";

    // Testa lookup de usuário pelo email do Google
    const users = await query<any>(
      "SELECT id, name, email, xp, level_num FROM users WHERE email = :b_email",
      { b_email: "christianfviana@gmail.com" }
    );
    if (users.length > 0) {
      userLookupStatus = `✅ encontrado: id=${users[0].ID}, name=${users[0].NAME}`;
    } else {
      userLookupStatus = "❌ usuário não encontrado (será criado no primeiro login)";
    }
  } catch (e: any) {
    oracleStatus = `❌ erro: ${e.message}`;
  }

  // Verifica qual versão do código está rodando (sem adapter = novo código)
  const { authOptions } = await import("@/lib/auth");
  const hasAdapter = !!(authOptions as any).adapter;

  return NextResponse.json({
    code_version: "39b7113",
    nextauth_url: process.env.NEXTAUTH_URL,
    google_client_id_set: !!process.env.GOOGLE_CLIENT_ID,
    google_secret_set: !!process.env.GOOGLE_CLIENT_SECRET,
    oracle_wallet_location: process.env.ORACLE_WALLET_LOCATION,
    oracle_user: process.env.ORACLE_USER,
    node_env: process.env.NODE_ENV,
    oracle_connection: oracleStatus,
    user_lookup: userLookupStatus,
    auth_has_adapter: hasAdapter,
    session_strategy: (authOptions as any).session?.strategy ?? "não definido",
    expected_callback_url: `${process.env.NEXTAUTH_URL}/api/auth/callback/google`,
  });
}
