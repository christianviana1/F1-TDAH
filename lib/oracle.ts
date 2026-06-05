import oracledb from "oracledb";

// Thin mode — não precisa de Oracle Client instalado
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchTypeHandler = (metaData) => {
  // Retorna strings em vez de Buffers para CLOBs pequenos
  if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
    return { type: oracledb.STRING };
  }
};

const CONNECTION_CONFIG: oracledb.ConnectionAttributes = {
  user: process.env.ORACLE_USER!,
  password: process.env.ORACLE_PASSWORD!,
  connectString: process.env.ORACLE_CONNECT_STRING!,
  walletLocation: process.env.ORACLE_WALLET_LOCATION!,
  walletPassword: process.env.ORACLE_WALLET_PASSWORD!,
};

// Pool singleton para reutilizar conexões
let pool: oracledb.Pool | undefined;

export async function getPool(): Promise<oracledb.Pool> {
  if (!pool) {
    pool = await oracledb.createPool({
      ...CONNECTION_CONFIG,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1,
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  binds: oracledb.BindParameters = [],
  options: oracledb.ExecuteOptions = {}
): Promise<T[]> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
    return (result.rows ?? []) as T[];
  } finally {
    await conn.close();
  }
}

export async function execute(
  sql: string,
  binds: oracledb.BindParameters = [],
  options: oracledb.ExecuteOptions = {}
): Promise<oracledb.Result<unknown>> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(sql, binds, {
      autoCommit: true,
      ...options,
    });
    return result;
  } finally {
    await conn.close();
  }
}
