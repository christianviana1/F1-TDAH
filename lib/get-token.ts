import { getToken as nextAuthGetToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Wrapper que garante leitura correta do token
// secureCookie: false porque o app roda em HTTP (sem SSL no Coolify)
export async function getAuthToken(request: NextRequest) {
  return nextAuthGetToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: false,
    cookieName: "next-auth.session-token",
  });
}
