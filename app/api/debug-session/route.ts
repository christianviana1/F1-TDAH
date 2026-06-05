import { getAuthToken } from "@/lib/get-token";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = await getAuthToken(request);

  const cookies: Record<string, string> = {};
  request.cookies.getAll().forEach((c) => {
    cookies[c.name] = c.value.slice(0, 40) + "...";
  });

  return NextResponse.json({
    token,
    cookies,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    hasSecret: !!process.env.NEXTAUTH_SECRET,
  });
}
