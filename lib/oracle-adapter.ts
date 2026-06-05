import type {
  Adapter,
  AdapterUser,
  AdapterAccount,
  AdapterSession,
  VerificationToken,
} from "next-auth/adapters";
import { query, execute } from "./oracle";

// Oracle retorna nomes de colunas em MAIÚSCULAS por padrão
function mapUser(row: any): AdapterUser {
  return {
    id: row.ID,
    name: row.NAME ?? null,
    email: row.EMAIL ?? null,
    emailVerified: row.EMAIL_VERIFIED ? new Date(row.EMAIL_VERIFIED) : null,
    image: row.IMAGE ?? null,
    // campos extras
    xp: row.XP ?? 0,
    level: row.LEVEL_NUM ?? 1,
    passwordHash: row.PASSWORD_HASH ?? null,
  } as AdapterUser & { xp: number; level: number; passwordHash: string | null };
}

function mapSession(row: any): AdapterSession {
  return {
    sessionToken: row.SESSION_TOKEN,
    userId: row.USER_ID,
    expires: new Date(row.EXPIRES),
  };
}

export function OracleAdapter(): Adapter {
  return {
    // ── Users ────────────────────────────────────────────────────────────────

    async createUser(user: Omit<AdapterUser, "id">) {
      const id = crypto.randomUUID();
      await execute(
        `INSERT INTO users (id, name, email, email_verified, image)
         VALUES (:id, :name, :email, :emailVerified, :image)`,
        {
          id,
          name: user.name ?? null,
          email: user.email ?? null,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
        }
      );
      const rows = await query<any>(
        `SELECT * FROM users WHERE id = :id`,
        { id }
      );
      return mapUser(rows[0]);
    },

    async getUser(id) {
      const rows = await query<any>(`SELECT * FROM users WHERE id = :id`, { id });
      return rows.length ? mapUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      const rows = await query<any>(`SELECT * FROM users WHERE email = :email`, { email });
      return rows.length ? mapUser(rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const rows = await query<any>(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = :provider AND a.provider_account_id = :providerAccountId`,
        { provider, providerAccountId }
      );
      return rows.length ? mapUser(rows[0]) : null;
    },

    async updateUser(user) {
      await execute(
        `UPDATE users SET
           name = :name,
           email = :email,
           email_verified = :emailVerified,
           image = :image
         WHERE id = :id`,
        {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
        }
      );
      const rows = await query<any>(`SELECT * FROM users WHERE id = :id`, { id: user.id });
      return mapUser(rows[0]);
    },

    async deleteUser(userId) {
      await execute(`DELETE FROM users WHERE id = :id`, { id: userId });
    },

    // ── Accounts ─────────────────────────────────────────────────────────────

    async linkAccount(account: AdapterAccount) {
      const id = crypto.randomUUID();
      await execute(
        `INSERT INTO accounts
           (id, user_id, type, provider, provider_account_id,
            refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES
           (:id, :userId, :type, :provider, :providerAccountId,
            :refreshToken, :accessToken, :expiresAt, :tokenType, :scope, :idToken, :sessionState)`,
        {
          id,
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refreshToken: account.refresh_token ?? null,
          accessToken: account.access_token ?? null,
          expiresAt: account.expires_at ?? null,
          tokenType: account.token_type ?? null,
          scope: account.scope ?? null,
          idToken: account.id_token ?? null,
          sessionState: account.session_state ?? null,
        }
      );
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      await execute(
        `DELETE FROM accounts WHERE provider = :provider AND provider_account_id = :providerAccountId`,
        { provider, providerAccountId }
      );
    },

    // ── Sessions ──────────────────────────────────────────────────────────────

    async createSession(session) {
      const id = crypto.randomUUID();
      await execute(
        `INSERT INTO sessions (id, session_token, user_id, expires)
         VALUES (:id, :sessionToken, :userId, :expires)`,
        {
          id,
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        }
      );
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const rows = await query<any>(
        `SELECT s.session_token, s.user_id, s.expires,
                u.id as u_id, u.name, u.email, u.email_verified, u.image,
                u.xp, u.level_num, u.password_hash
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_token = :sessionToken`,
        { sessionToken }
      );
      if (!rows.length) return null;
      const row = rows[0];
      return {
        session: {
          sessionToken: row.SESSION_TOKEN,
          userId: row.USER_ID,
          expires: new Date(row.EXPIRES),
        },
        user: {
          id: row.U_ID,
          name: row.NAME ?? null,
          email: row.EMAIL ?? null,
          emailVerified: row.EMAIL_VERIFIED ? new Date(row.EMAIL_VERIFIED) : null,
          image: row.IMAGE ?? null,
          xp: row.XP ?? 0,
          level: row.LEVEL_NUM ?? 1,
        } as AdapterUser,
      };
    },

    async updateSession(session) {
      await execute(
        `UPDATE sessions SET expires = :expires WHERE session_token = :sessionToken`,
        { expires: session.expires, sessionToken: session.sessionToken }
      );
      return session as AdapterSession;
    },

    async deleteSession(sessionToken) {
      await execute(`DELETE FROM sessions WHERE session_token = :sessionToken`, { sessionToken });
    },

    // ── Verification tokens ───────────────────────────────────────────────────

    async createVerificationToken(token) {
      await execute(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES (:identifier, :token, :expires)`,
        { identifier: token.identifier, token: token.token, expires: token.expires }
      );
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const rows = await query<any>(
        `SELECT * FROM verification_tokens WHERE identifier = :identifier AND token = :token`,
        { identifier, token }
      );
      if (!rows.length) return null;
      await execute(
        `DELETE FROM verification_tokens WHERE identifier = :identifier AND token = :token`,
        { identifier, token }
      );
      return {
        identifier: rows[0].IDENTIFIER,
        token: rows[0].TOKEN,
        expires: new Date(rows[0].EXPIRES),
      } as VerificationToken;
    },
  };
}
