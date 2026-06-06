// Endpoint de diagnóstico — remover após resolver o problema
import { NextResponse } from "next/server";

export async function GET() {
  // Testa conexão Oracle
  let oracleStatus = "não testado";
  try {
    const { query } = await import("@/lib/oracle");
    const rows = await query<any>("SELECT 1 AS ok FROM dual");
    oracleStatus = rows.length > 0 ? "✅ conectado" : "❌ sem resultado";
  } catch (e: any) {
    oracleStatus = `❌ erro: ${e.message}`;
  }

  return NextResponse.json({
    nextauth_url: process.env.NEXTAUTH_URL,
    google_client_id_set: !!process.env.GOOGLE_CLIENT_ID,
    google_secret_set: !!process.env.GOOGLE_CLIENT_SECRET,
    oracle_wallet_location: process.env.ORACLE_WALLET_LOCATION,
    oracle_user: process.env.ORACLE_USER,
    node_env: process.env.NODE_ENV,
    oracle_connection: oracleStatus,
    expected_callback_url: `${process.env.NEXTAUTH_URL}/api/auth/callback/google`,
  });
}
