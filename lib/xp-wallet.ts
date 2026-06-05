import oracledb from 'oracledb';

/**
 * Atomically credits XP to both progression (users.xp) and wallet (users.xp_wallet).
 *
 * Both UPDATEs run on the same connection with autoCommit: false.
 * If either UPDATE fails, both are rolled back — the two fields are always in sync.
 *
 * CRITICAL: autoCommit is NEVER true here. Caller must NOT pass autoCommit: true.
 *
 * Validates: Requirements 5.2 — atomic dual-credit on task completion
 */
export async function creditXpBoth(
  conn: oracledb.Connection,
  userId: string,
  amount: number
): Promise<void> {
  try {
    // UPDATE 1: progression XP
    await conn.execute(
      'UPDATE users SET xp = xp + :amount WHERE id = :userId',
      { amount, userId },
      { autoCommit: false }
    );

    // UPDATE 2: wallet XP
    await conn.execute(
      'UPDATE users SET xp_wallet = xp_wallet + :amount WHERE id = :userId',
      { amount, userId },
      { autoCommit: false }
    );

    // Both succeeded — commit atomically
    await conn.commit();
  } catch (err) {
    // Roll back both UPDATEs so neither field is partially updated
    await conn.rollback();
    throw err;
  }
}

/**
 * Debits XP from the wallet (users.xp_wallet) for a Pit Stop Shop redemption.
 *
 * Uses SELECT ... FOR UPDATE to lock the row before checking balance, preventing
 * concurrent debit races. Commits on success, does not commit on failure.
 *
 * Returns:
 *   { success: false, newBalance: <current>, error: "XP insuficiente..." } when balance < amount
 *   { success: true,  newBalance: <after debit> }                          when balance >= amount
 *
 * Validates:
 *   Requirements 5.1 — XP_Wallet never goes negative
 *   Requirements 5.7 — reject redemption when balance is insufficient
 */
export async function debitWallet(
  conn: oracledb.Connection,
  userId: string,
  amount: number
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // Lock the row so no concurrent debit can race past the balance check
  type WalletRow = { XP_WALLET: number };
  const selectResult = await conn.execute<WalletRow>(
    'SELECT xp_wallet FROM users WHERE id = :userId FOR UPDATE',
    { userId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
  );

  const rows = selectResult.rows ?? [];
  if (rows.length === 0) {
    throw new Error(`Usuário não encontrado: ${userId}`);
  }

  const currentBalance: number = rows[0].XP_WALLET;

  if (currentBalance < amount) {
    // Not enough XP — release the lock without debiting
    await conn.rollback();
    return {
      success: false,
      newBalance: currentBalance,
      error: `XP insuficiente. Você tem ${currentBalance} XP e precisa de ${amount} XP. Faltam ${amount - currentBalance} XP.`,
    };
  }

  // Sufficient balance — perform the debit
  await conn.execute(
    'UPDATE users SET xp_wallet = xp_wallet - :amount WHERE id = :userId',
    { amount, userId },
    { autoCommit: false }
  );

  await conn.commit();

  return {
    success: true,
    newBalance: currentBalance - amount,
  };
}
