import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export async function GET(request: Request, props: { params: Promise<{ nextauth: string[] }> }) {
  const params = await props.params;
  return handler(request, { params });
}

export async function POST(request: Request, props: { params: Promise<{ nextauth: string[] }> }) {
  const params = await props.params;
  return handler(request, { params });
}
