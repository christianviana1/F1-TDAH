const oracledb = require("oracledb");

const CONNECTION = {
  user: "ADMIN",
  password: "@Christianfviana06102002",
  connectString:
    "(description=(retry_count=3)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.sa-saopaulo-1.oraclecloud.com))(connect_data=(service_name=g200c71d1d76467_christianbd_low.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))",
  walletLocation: "C:/Oracle/Wallet/Wallet_ChristianBD",
  walletPassword: "@Christianfviana06102002",
};

async function main() {
  const conn = await oracledb.getConnection(CONNECTION);
  console.log("Conectado como ADMIN\n");

  // ── 1. Dropar tabelas do ADMIN (criadas por engano) ───────────────────────
  const dropTables = ["tasks", "verification_tokens", "sessions", "accounts", "users"];
  console.log("Removendo tabelas do schema ADMIN...");
  for (const table of dropTables) {
    try {
      await conn.execute(`DROP TABLE ${table} CASCADE CONSTRAINTS`);
      console.log("  ✓ Dropada:", table);
    } catch (e) {
      if (e.errorNum === 942) {
        console.log("  ~ Não existia:", table);
      } else {
        console.error("  ✗ Erro ao dropar", table, ":", e.message);
      }
    }
  }

  // ── 2. Criar usuário/schema F1_DB ─────────────────────────────────────────
  console.log("\nCriando schema F1_DB...");
  try {
    await conn.execute(`DROP USER f1_db CASCADE`);
    console.log("  ~ Schema antigo removido");
  } catch (e) {
    if (e.errorNum !== 1918) console.log("  ~ Schema não existia ainda");
  }

  await conn.execute(
    `CREATE USER f1_db IDENTIFIED BY "TaskManager@2026!" DEFAULT TABLESPACE DATA TEMPORARY TABLESPACE TEMP`
  );
  console.log("  ✓ Schema F1_DB criado");

  // ── 3. Dar permissões ao F1_DB ────────────────────────────────────────────
  const grants = [
    "GRANT CREATE SESSION TO f1_db",
    "GRANT CREATE TABLE TO f1_db",
    "GRANT CREATE SEQUENCE TO f1_db",
    "GRANT UNLIMITED TABLESPACE TO f1_db",
  ];
  for (const g of grants) {
    await conn.execute(g);
  }
  console.log("  ✓ Permissões concedidas");

  await conn.commit();
  await conn.close();

  // ── 4. Conectar como F1_DB e criar tabelas ────────────────────────────────
  console.log("\nConectando como F1_DB para criar tabelas...");
  const f1conn = await oracledb.getConnection({
    ...CONNECTION,
    user: "f1_db",
    password: "TaskManager@2026!",
  });

  const DDL = [
    {
      name: "users",
      sql: `CREATE TABLE users (
        id             VARCHAR2(36)  PRIMARY KEY,
        name           VARCHAR2(255),
        email          VARCHAR2(255) UNIQUE,
        email_verified TIMESTAMP,
        image          VARCHAR2(500),
        password_hash  VARCHAR2(255),
        xp             NUMBER        DEFAULT 0  NOT NULL,
        level_num      NUMBER        DEFAULT 1  NOT NULL,
        team_color     VARCHAR2(10)  DEFAULT '#E10600' NOT NULL
      )`,
    },
    {
      name: "accounts",
      sql: `CREATE TABLE accounts (
        id                  VARCHAR2(36)  PRIMARY KEY,
        user_id             VARCHAR2(36)  NOT NULL,
        type                VARCHAR2(50)  NOT NULL,
        provider            VARCHAR2(100) NOT NULL,
        provider_account_id VARCHAR2(255) NOT NULL,
        refresh_token       CLOB,
        access_token        CLOB,
        expires_at          NUMBER,
        token_type          VARCHAR2(50),
        scope               VARCHAR2(500),
        id_token            CLOB,
        session_state       VARCHAR2(255),
        CONSTRAINT fk_acc_user     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT uq_acc_provider UNIQUE (provider, provider_account_id)
      )`,
    },
    {
      name: "sessions",
      sql: `CREATE TABLE sessions (
        id            VARCHAR2(36)  PRIMARY KEY,
        session_token VARCHAR2(500) UNIQUE NOT NULL,
        user_id       VARCHAR2(36)  NOT NULL,
        expires       TIMESTAMP     NOT NULL,
        CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    },
    {
      name: "verification_tokens",
      sql: `CREATE TABLE verification_tokens (
        identifier VARCHAR2(255) NOT NULL,
        token      VARCHAR2(500) NOT NULL,
        expires    TIMESTAMP     NOT NULL,
        CONSTRAINT pk_vt PRIMARY KEY (identifier, token)
      )`,
    },
    {
      name: "tasks",
      sql: `CREATE TABLE tasks (
        id         VARCHAR2(36)  PRIMARY KEY,
        user_id    VARCHAR2(36)  NOT NULL,
        title      VARCHAR2(500) NOT NULL,
        difficulty VARCHAR2(10)  DEFAULT 'SOFT'  NOT NULL,
        status     VARCHAR2(20)  DEFAULT 'GARAGE' NOT NULL,
        created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    },
  ];

  console.log("\nCriando tabelas no schema F1_DB...");
  for (const { name, sql } of DDL) {
    try {
      await f1conn.execute(sql);
      console.log("  ✓ Criada:", name);
    } catch (e) {
      if (e.errorNum === 955) {
        console.log("  ~ Já existe:", name);
      } else {
        console.error("  ✗ Erro em", name, ":", e.message);
      }
    }
  }

  await f1conn.commit();
  await f1conn.close();

  console.log("\n✅ Schema F1_DB pronto com todas as tabelas!");
  console.log("   Usuário: f1_db");
  console.log("   Senha:   F1db@2026");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message);
  process.exit(1);
});
