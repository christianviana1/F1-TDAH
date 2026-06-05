// scripts/migrate-advanced-features.js
// Migração para as funcionalidades avançadas do TaskManager TDAH
// Execute: node scripts/migrate-advanced-features.js
// Requer variáveis de ambiente: ORACLE_USER, ORACLE_PASSWORD,
//   ORACLE_CONNECT_STRING, ORACLE_WALLET_LOCATION, ORACLE_WALLET_PASSWORD

require("dotenv").config();
const oracledb = require("oracledb");

const CONNECTION = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
  walletLocation: process.env.ORACLE_WALLET_LOCATION,
  walletPassword: process.env.ORACLE_WALLET_PASSWORD,
};

// Cada DDL é envolvido em um bloco PL/SQL idempotente:
// erros são silenciados para que o script possa ser re-executado com segurança.
function wrap(ddl) {
  // Escapa aspas simples internas duplicando-as para o PL/SQL
  const escaped = ddl.replace(/'/g, "''");
  return `BEGIN EXECUTE IMMEDIATE '${escaped}'; EXCEPTION WHEN OTHERS THEN NULL; END;`;
}

const MIGRATIONS = [
  // ── 1. Novos campos em tasks ────────────────────────────────────────────────
  {
    name: "ALTER tasks — adicionar colunas de agendamento e recorrência",
    sql: wrap(
      "ALTER TABLE tasks ADD (" +
        "scheduled_date DATE, " +
        "start_time VARCHAR2(5), " +
        "end_time VARCHAR2(5), " +
        "estimated_duration NUMBER(4), " +
        "rest_time NUMBER(2) DEFAULT 5, " +
        "recurrence_series_id VARCHAR2(36), " +
        "recurrence_instance_date DATE" +
        ")"
    ),
  },

  // ── 2. Novo campo xp_wallet em users ────────────────────────────────────────
  {
    name: "ALTER users — adicionar xp_wallet",
    sql: wrap(
      "ALTER TABLE users ADD (" +
        "xp_wallet NUMBER DEFAULT 0 NOT NULL, " +
        "CONSTRAINT chk_xp_wallet_nonneg CHECK (xp_wallet >= 0)" +
        ")"
    ),
  },

  // ── 3. Tabela task_recurrence_series ────────────────────────────────────────
  {
    name: "CREATE TABLE task_recurrence_series",
    sql: wrap(
      "CREATE TABLE task_recurrence_series (" +
        "id              VARCHAR2(36)   PRIMARY KEY, " +
        "user_id         VARCHAR2(36)   NOT NULL, " +
        "title           VARCHAR2(255)  NOT NULL, " +
        "difficulty      VARCHAR2(10)   NOT NULL, " +
        "recurrence_type VARCHAR2(20)   NOT NULL, " +
        "start_date      DATE           NOT NULL, " +
        "end_date        DATE           NOT NULL, " +
        "weekdays        VARCHAR2(20), " +
        "estimated_duration NUMBER(4), " +
        "rest_time       NUMBER(2) DEFAULT 5, " +
        "start_time      VARCHAR2(5), " +
        "end_time        VARCHAR2(5), " +
        "created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
        "FOREIGN KEY (user_id) REFERENCES users(id)" +
        ")"
    ),
  },

  // ── 4. Tabela reward_items ───────────────────────────────────────────────────
  {
    name: "CREATE TABLE reward_items",
    sql: wrap(
      "CREATE TABLE reward_items (" +
        "id          VARCHAR2(36)    PRIMARY KEY, " +
        "user_id     VARCHAR2(36)    NOT NULL, " +
        "name        VARCHAR2(100)   NOT NULL, " +
        "description VARCHAR2(500), " +
        "cost        NUMBER          NOT NULL, " +
        "status      VARCHAR2(10)    DEFAULT 'ACTIVE', " +
        "created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
        "updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
        "CONSTRAINT chk_cost_positive CHECK (cost > 0), " +
        "CONSTRAINT chk_status CHECK (status IN ('ACTIVE','INACTIVE')), " +
        "FOREIGN KEY (user_id) REFERENCES users(id)" +
        ")"
    ),
  },

  // ── 5. Tabela redemptions ────────────────────────────────────────────────────
  {
    name: "CREATE TABLE redemptions",
    sql: wrap(
      "CREATE TABLE redemptions (" +
        "id              VARCHAR2(36)    PRIMARY KEY, " +
        "user_id         VARCHAR2(36)    NOT NULL, " +
        "reward_item_id  VARCHAR2(36)    NOT NULL, " +
        "name_snapshot   VARCHAR2(100)   NOT NULL, " +
        "cost_snapshot   NUMBER          NOT NULL, " +
        "redeemed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
        "FOREIGN KEY (user_id) REFERENCES users(id), " +
        "FOREIGN KEY (reward_item_id) REFERENCES reward_items(id)" +
        ")"
    ),
  },

  // ── 6. Índice redemptions(user_id, redeemed_at) ─────────────────────────────
  {
    name: "CREATE INDEX idx_redemptions_user_date",
    sql: wrap(
      "CREATE INDEX idx_redemptions_user_date ON redemptions(user_id, redeemed_at)"
    ),
  },

  // ── 7. Índice tasks(user_id, scheduled_date) ─────────────────────────────────
  {
    name: "CREATE INDEX idx_tasks_user_date",
    sql: wrap(
      "CREATE INDEX idx_tasks_user_date ON tasks(user_id, scheduled_date)"
    ),
  },

  // ── 8. Índice tasks(recurrence_series_id) ───────────────────────────────────
  {
    name: "CREATE INDEX idx_tasks_series",
    sql: wrap(
      "CREATE INDEX idx_tasks_series ON tasks(recurrence_series_id)"
    ),
  },
];

async function main() {
  // Validação básica das variáveis de ambiente
  const required = [
    "ORACLE_USER",
    "ORACLE_PASSWORD",
    "ORACLE_CONNECT_STRING",
    "ORACLE_WALLET_LOCATION",
    "ORACLE_WALLET_PASSWORD",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("❌ Variáveis de ambiente ausentes:", missing.join(", "));
    process.exit(1);
  }

  console.log("Conectando ao Oracle Autonomous Database...");
  const conn = await oracledb.getConnection(CONNECTION);
  console.log("✓ Conectado como:", process.env.ORACLE_USER);
  console.log("─".repeat(60));

  for (const { name, sql } of MIGRATIONS) {
    try {
      await conn.execute(sql);
      console.log("✓", name);
    } catch (e) {
      console.error("✗ Erro em:", name);
      console.error("  ", e.message);
    }
  }

  await conn.commit();
  await conn.close();

  console.log("─".repeat(60));
  console.log("✅ Migração concluída! (idempotente — pode ser re-executada)");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message);
  process.exit(1);
});
