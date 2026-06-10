import { getToken as nextAuthGetToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Wrapper que detecta HTTP vs HTTPS pelo NEXTAUTH_URL em runtime
export async function getAuthToken(request: NextRequest) {
  const isHttps = process.env.NEXTAUTH_URL?.startsWith("https") ?? false;
  return nextAuthGetToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isHttps,
    cookieName: isHttps
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
  });
}
