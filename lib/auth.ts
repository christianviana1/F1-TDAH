import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { query, execute } from "./oracle";
import { createHash } from "crypto";

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

// Busca ou cria usuário para login com Google
async function findOrCreateGoogleUser(profile: {
  email: string;
  name: string;
  image?: string;
  googleId: string;
}): Promise<{ id: string; xp: number; level: number }> {
  console.log("[findOrCreateGoogleUser] Buscando por email:", profile.email);
  // Busca por email
  const existing = await query<any>(
    `SELECT id, xp, level_num FROM users WHERE email = :b_email`,
    { b_email: profile.email }
  );
  console.log("[findOrCreateGoogleUser] rows encontradas:", existing.length);

  if (existing.length > 0) {
    const u = existing[0];
    console.log("[findOrCreateGoogleUser] Usuário existente, id:", u.ID);
    return { id: u.ID, xp: u.XP ?? 0, level: u.LEVEL_NUM ?? 1 };
  }

  // Cria novo usuário
  console.log("[findOrCreateGoogleUser] Criando novo usuário para:", profile.email);
  const b_id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, image) VALUES (:b_id, :b_name, :b_email, :b_img)`,
    { b_id, b_name: profile.name, b_email: profile.email, b_img: profile.image ?? null }
  );
  console.log("[findOrCreateGoogleUser] Novo usuário criado, id:", b_id);

  return { id: b_id, xp: 0, level: 1 };
}

export const authOptions: NextAuthOptions = {
  // SEM adapter — JWT puro, usuários gerenciados via callbacks
  session: { strategy: "jwt" },
  // Necessário quando rodando atrás de proxy/load balancer (Coolify)
  // Permite que o NextAuth aceite requisições de qualquer host
  useSecureCookies: false,
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 900 },
    },
    state: {
      name: "next-auth.state",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 900 },
    },
  },
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
          `SELECT id, name, email, xp, level_num, password_hash FROM users WHERE email = :b_email`,
          { b_email: credentials.email }
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
    async signIn({ user, account, profile }) {
      console.log("[signIn] provider:", account?.provider, "email:", profile?.email ?? user?.email);
      // Para login com Google, busca/cria o usuário no Oracle
      if (account?.provider === "google") {
        const email = profile?.email ?? user?.email;
        if (!email) {
          console.error("[signIn] Google login sem email — abortando");
          return false;
        }
        try {
          console.log("[signIn] Chamando findOrCreateGoogleUser para:", email);
          const dbUser = await findOrCreateGoogleUser({
            email,
            name: (profile as any)?.name ?? (user as any)?.name ?? email,
            image: (profile as any)?.picture ?? user?.image ?? undefined,
            googleId: (profile as any)?.sub ?? "",
          });
          console.log("[signIn] dbUser encontrado/criado:", dbUser.id);
          // Injeta o ID do banco no objeto user para o callback jwt
          user.id = dbUser.id;
          (user as any).xp = dbUser.xp;
          (user as any).level = dbUser.level;
        } catch (err: any) {
          console.error("[signIn] ERRO ao buscar/criar usuário Google:", err?.message ?? err);
          console.error("[signIn] Stack:", err?.stack);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.xp = (user as any).xp ?? 0;
        token.level = (user as any).level ?? 1;
      } else if (token.id) {
        try {
          const rows = await query<any>(
            `SELECT xp, level_num FROM users WHERE id = :b_uid`,
            { b_uid: token.id }
          );
          if (rows.length) {
            token.xp = rows[0].XP;
            token.level = rows[0].LEVEL_NUM;
          }
        } catch {
          // Mantém valores anteriores
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
