import type {
  Adapter,
  AdapterUser,
  AdapterAccount,
  AdapterSession,
  VerificationToken,
} from "next-auth/adapters";
import { query, execute } from "./oracle";

function mapUser(row: any): AdapterUser {
  return {
    id: row.ID,
    name: row.NAME ?? null,
    email: row.EMAIL ?? null,
    emailVerified: row.EMAIL_VERIFIED ? new Date(row.EMAIL_VERIFIED) : null,
    image: row.IMAGE ?? null,
    xp: row.XP ?? 0,
    level: row.LEVEL_NUM ?? 1,
    passwordHash: row.PASSWORD_HASH ?? null,
  } as AdapterUser & { xp: number; level: number; passwordHash: string | null };
}

export function OracleAdapter(): Adapter {
  return {
    // ── Users ────────────────────────────────────────────────────────────────

    async createUser(user: Omit<AdapterUser, "id">) {
      const b_id = crypto.randomUUID();
      await execute(
        `INSERT INTO users (id, name, email, email_verified, image)
         VALUES (:b_id, :b_name, :b_email, :b_ev, :b_img)`,
        {
          b_id,
          b_name: user.name ?? null,
          b_email: user.email ?? null,
          b_ev: user.emailVerified ?? null,
          b_img: user.image ?? null,
        }
      );
      const rows = await query<any>(
        `SELECT id, name, email, email_verified, image, xp, level_num, password_hash FROM users WHERE id = :b_id`,
        { b_id }
      );
      return mapUser(rows[0]);
    },

    async getUser(id) {
      const rows = await query<any>(
        `SELECT id, name, email, email_verified, image, xp, level_num, password_hash FROM users WHERE id = :b_id`,
        { b_id: id }
      );
      return rows.length ? mapUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      const rows = await query<any>(
        `SELECT id, name, email, email_verified, image, xp, level_num, password_hash FROM users WHERE email = :b_email`,
        { b_email: email }
      );
      return rows.length ? mapUser(rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const rows = await query<any>(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = :b_prov AND a.provider_account_id = :b_paid`,
        { b_prov: provider, b_paid: providerAccountId }
      );
      return rows.length ? mapUser(rows[0]) : null;
    },

    async updateUser(user) {
      await execute(
        `UPDATE users SET
           name = :b_name,
           email = :b_email,
           email_verified = :b_ev,
           image = :b_img
         WHERE id = :b_id`,
        {
          b_id: user.id,
          b_name: user.name ?? null,
          b_email: user.email ?? null,
          b_ev: user.emailVerified ?? null,
          b_img: user.image ?? null,
        }
      );
      const rows = await query<any>(
        `SELECT id, name, email, email_verified, image, xp, level_num, password_hash FROM users WHERE id = :b_id`,
        { b_id: user.id }
      );
      return mapUser(rows[0]);
    },

    async deleteUser(userId) {
      await execute(`DELETE FROM users WHERE id = :b_id`, { b_id: userId });
    },

    // ── Accounts ─────────────────────────────────────────────────────────────

    async linkAccount(account: AdapterAccount) {
      const b_id = crypto.randomUUID();
      await execute(
        `INSERT INTO accounts
           (id, user_id, type, provider, provider_account_id,
            refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES
           (:b_id, :b_uid, :b_type, :b_prov, :b_paid,
            :b_rt, :b_at, :b_ea, :b_tt, :b_scope, :b_idt, :b_ss)`,
        {
          b_id,
          b_uid: account.userId,
          b_type: account.type,
          b_prov: account.provider,
          b_paid: account.providerAccountId,
          b_rt: account.refresh_token ?? null,
          b_at: account.access_token ?? null,
          b_ea: account.expires_at ?? null,
          b_tt: account.token_type ?? null,
          b_scope: account.scope ?? null,
          b_idt: account.id_token ?? null,
          b_ss: account.session_state ?? null,
        }
      );
      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await execute(
        `DELETE FROM accounts WHERE provider = :b_prov AND provider_account_id = :b_paid`,
        { b_prov: provider, b_paid: providerAccountId }
      );
    },

    // ── Sessions ─────────────────────────────────────────────────────────────

    async createSession(session) {
      const b_id = crypto.randomUUID();
      await execute(
        `INSERT INTO sessions (id, session_token, user_id, expires)
         VALUES (:b_id, :b_st, :b_uid, :b_exp)`,
        {
          b_id,
          b_st: session.sessionToken,
          b_uid: session.userId,
          b_exp: session.expires,
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
         WHERE s.session_token = :b_st`,
        { b_st: sessionToken }
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
        `UPDATE sessions SET expires = :b_exp WHERE session_token = :b_st`,
        { b_exp: session.expires, b_st: session.sessionToken }
      );
      return session as AdapterSession;
    },

    async deleteSession(sessionToken) {
      await execute(
        `DELETE FROM sessions WHERE session_token = :b_st`,
        { b_st: sessionToken }
      );
    },

    // ── Verification tokens ───────────────────────────────────────────────────

    async createVerificationToken(token) {
      await execute(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES (:b_ident, :b_tok, :b_exp)`,
        { b_ident: token.identifier, b_tok: token.token, b_exp: token.expires }
      );
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const rows = await query<any>(
        `SELECT * FROM verification_tokens WHERE identifier = :b_ident AND token = :b_tok`,
        { b_ident: identifier, b_tok: token }
      );
      if (!rows.length) return null;
      await execute(
        `DELETE FROM verification_tokens WHERE identifier = :b_ident AND token = :b_tok`,
        { b_ident: identifier, b_tok: token }
      );
      return {
        identifier: rows[0].IDENTIFIER,
        token: rows[0].TOKEN,
        expires: new Date(rows[0].EXPIRES),
      } as VerificationToken;
    },
  };
}
