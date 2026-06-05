import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { OracleAdapter } from "./oracle-adapter";
import { query, execute } from "./oracle";
import { createHash } from "crypto";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export const authOptions: NextAuthOptions = {
  adapter: OracleAdapter(),
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const rows = await query<any>(
          `SELECT id, name, email, xp, level_num, password_hash
           FROM users WHERE email = :email`,
          { email: credentials.email }
        );

        if (!rows.length || !rows[0].PASSWORD_HASH) return null;

        const hash = hashPassword(credentials.password);
        if (hash !== rows[0].PASSWORD_HASH) return null;

        return {
          id: rows[0].ID,
          name: rows[0].NAME,
          email: rows[0].EMAIL,
          xp: rows[0].XP,
          level: rows[0].LEVEL_NUM,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.xp = (user as any).xp ?? 0;
        token.level = (user as any).level ?? 1;
      } else if (token.id) {
        // Atualiza XP e nível do token a cada verificação de sessão.
        // O try/catch garante que um timeout ou erro Oracle não quebre a sessão.
        try {
          const rows = await query<any>(
            `SELECT xp, level_num FROM users WHERE id = :id`,
            { id: token.id }
          );
          if (rows.length) {
            token.xp = rows[0].XP;
            token.level = rows[0].LEVEL_NUM;
          }
        } catch {
          // Mantém os valores anteriores do token se o banco não responder
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.xp = token.xp as number;
        session.user.level = token.level as number;
      }
      return session;
    },
  },
};
