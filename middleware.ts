import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    // HTTP deployment — cookie nunca tem flag Secure
    secureCookie: false,
    cookieName: "next-auth.session-token",
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
