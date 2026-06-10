import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isSecure(request: NextRequest): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto === "https";
  return process.env.NEXTAUTH_URL?.startsWith("https") ?? false;
}

export async function proxy(request: NextRequest) {
  const secure = isSecure(request);
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: secure,
    cookieName: secure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
  });

  const { pathname } = request.nextUrl;

  // Se está autenticado e tenta acessar /login, manda pro dashboard
  if (token && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Se não está autenticado e tenta acessar rotas protegidas, manda pro login
  if (!token && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
