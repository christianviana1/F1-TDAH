// scripts/migrate-friends.js
// Cria a tabela de amizades entre pilotos.
// Execute: node scripts/migrate-friends.js
require("dotenv").config();
const oracledb = require("oracledb");

const CONNECTION = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
  walletLocation: process.env.ORACLE_WALLET_LOCATION,
  walletPassword: process.env.ORACLE_WALLET_PASSWORD,
};

async function main() {
  const conn = await oracledb.getConnection(CONNECTION);
  console.log("✓ Conectado como:", process.env.ORACLE_USER);

  // Tabela de amizades
  try {
    await conn.execute(`
      CREATE TABLE friendships (
        id          VARCHAR2(36)  PRIMARY KEY,
        user_id     VARCHAR2(36)  NOT NULL,
        friend_id   VARCHAR2(36)  NOT NULL,
        status      VARCHAR2(20)  DEFAULT 'PENDING',
        created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_friendship UNIQUE (user_id, friend_id),
        CONSTRAINT chk_friendship_status CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
        FOREIGN KEY (user_id)   REFERENCES users(id),
        FOREIGN KEY (friend_id) REFERENCES users(id)
      )
    `);
    console.log("✓ Tabela friendships criada");
  } catch (e) {
    if (e.errorNum === 955) console.log("~ Tabela friendships já existe");
    else { console.error("✗", e.message); }
  }

  // Índices
  for (const [name, sql] of [
    ["idx_friendships_user",   "CREATE INDEX idx_friendships_user   ON friendships(user_id)"],
    ["idx_friendships_friend", "CREATE INDEX idx_friendships_friend ON friendships(friend_id)"],
  ]) {
    try {
      await conn.execute(sql);
      console.log("✓", name);
    } catch (e) {
      if (e.errorNum === 955) console.log("~", name, "já existe");
      else console.error("✗", name, e.message);
    }
  }

  await conn.commit();
  await conn.close();
  console.log("✅ Migração de amizades concluída");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
