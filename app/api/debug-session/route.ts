import { getAuthToken } from "@/lib/get-token";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);

  const cookies: Record<string, string> = {};
  request.cookies.getAll().forEach((c) => {
    cookies[c.name] = c.value.slice(0, 40) + "...";
  });

  const proto = request.headers.get("x-forwarded-proto");
  const isHttps = proto === "https";
  const expectedCookieName = isHttps
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const relevantHeaders: Record<string, string> = {};
  ["x-forwarded-proto", "x-forwarded-for", "x-forwarded-host", "host", "origin"].forEach((h) => {
    const v = request.headers.get(h);
    if (v) relevantHeaders[h] = v;
  });

  return NextResponse.json({
    token: token ? { id: (token as any).id, xp: (token as any).xp } : null,
    hasCookies: Object.keys(cookies),
    expectedCookieName,
    sessionTokenPresent: "next-auth.session-token" in cookies,
    secureSessionTokenPresent: "__Secure-next-auth.session-token" in cookies,
    correctCookiePresent: expectedCookieName in cookies,
    getAuthTokenResult: token ? "✅ token válido" : "❌ token null",
    proxyHeaders: relevantHeaders,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    hasSecret: !!process.env.NEXTAUTH_SECRET,
  });
}
