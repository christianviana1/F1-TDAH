import { getToken as nextAuthGetToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Detecta HTTPS pelo header do proxy (mais confiável que NEXTAUTH_URL em runtime)
function isSecure(request: NextRequest): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto === "https";
  return process.env.NEXTAUTH_URL?.startsWith("https") ?? false;
}

export async function getAuthToken(request: NextRequest) {
  const secure = isSecure(request);
  return nextAuthGetToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: secure,
    cookieName: secure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
  });
}
