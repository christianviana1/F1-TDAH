import { getToken as nextAuthGetToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Wrapper que garante leitura correta do token em HTTP (dev) e HTTPS (prod)
export async function getAuthToken(request: NextRequest) {
  return nextAuthGetToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });
}
