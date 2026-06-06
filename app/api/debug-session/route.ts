import { getAuthToken } from "@/lib/get-token";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);

  const cookies: Record<string, string> = {};
  request.cookies.getAll().forEach((c) => {
    cookies[c.name] = c.value.slice(0, 40) + "...";
  });

  // Captura headers relevantes para diagnóstico de proxy
  const relevantHeaders: Record<string, string> = {};
  ["x-forwarded-proto", "x-forwarded-for", "x-forwarded-host", "host", "origin"].forEach((h) => {
    const v = request.headers.get(h);
    if (v) relevantHeaders[h] = v;
  });

  return NextResponse.json({
    token: token ? { id: (token as any).id, xp: (token as any).xp } : null,
    hasCookies: Object.keys(cookies),
    sessionTokenPresent: "next-auth.session-token" in cookies,
    secureSessionTokenPresent: "__Secure-next-auth.session-token" in cookies,
    proxyHeaders: relevantHeaders,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    hasSecret: !!process.env.NEXTAUTH_SECRET,
  });
}
