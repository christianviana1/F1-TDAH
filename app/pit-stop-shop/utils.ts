// Pit Stop Shop utility functions for F1 Task Manager
// Feature: f1-advanced-features — Pit Stop Shop module (Requirements 5.3, 5.7, 5.8, 5.11)

export interface RewardItem {
  id: string;
  userId: string;
  name: string;         // 1–100 chars
  description: string;  // 0–500 chars
  cost: number;         // integer > 0
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface Redemption {
  id: string;
  userId: string;
  rewardItemId: string;
  nameSnapshot: string;
  costSnapshot: number;
  redeemedAt: string;   // ISO timestamp
}

/**
 * Validates reward item fields.
 * Returns { valid: true, errors: [] } if all rules pass, or
 * { valid: false, errors: string[] } with all violations collected.
 *
 * Rules:
 *   - name: 1–100 characters (required)
 *   - description: 0–500 characters (optional, empty string is valid)
 *   - cost: integer > 0
 *
 * Validates: Requirement 5.3
 */
export function validateRewardItem(
  name: string,
  description: string,
  cost: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (name.length < 1) {
    errors.push('Nome é obrigatório');
  } else if (name.length > 100) {
    errors.push('Nome deve ter no máximo 100 caracteres');
  }

  if (description.length > 500) {
    errors.push('Descrição deve ter no máximo 500 caracteres');
  }

  if (!Number.isInteger(cost) || cost <= 0) {
    errors.push('Custo deve ser um número inteiro maior que zero');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Formats the insufficient XP error message.
 *
 * Format: "XP insuficiente. Você tem N XP e precisa de M XP. Faltam X XP."
 *
 * Validates: Requirement 5.7
 */
export function formatInsufficientXpMessage(
  current: number,
  required: number
): string {
  const missing = required - current;
  return `XP insuficiente. Você tem ${current} XP e precisa de ${required} XP. Faltam ${missing} XP.`;
}

/**
 * Sorts redemptions by redeemedAt descending (most recent first).
 * Returns a new array without mutating the original.
 *
 * Validates: Requirement 5.8
 */
export function sortRedemptionsByDate(redemptions: Redemption[]): Redemption[] {
  return [...redemptions].sort((a, b) => {
    const dateA = new Date(a.redeemedAt).getTime();
    const dateB = new Date(b.redeemedAt).getTime();
    return dateB - dateA;
  });
}

/**
 * Pure simulation of a redeem operation (no DB, for client-side logic).
 *
 * - If item.status !== 'ACTIVE': return { success: false, error: "Este item não está mais disponível" }
 * - If walletBalance < item.cost: return { success: false, error: formatInsufficientXpMessage(...) }
 * - Otherwise: return { success: true, newBalance: walletBalance - item.cost }
 *
 * Validates: Requirements 5.6, 5.7, 5.11
 */
export function simulateRedeem(
  walletBalance: number,
  item: RewardItem
): { success: boolean; newBalance?: number; error?: string } {
  if (item.status !== 'ACTIVE') {
    return { success: false, error: 'Este item não está mais disponível' };
  }

  if (walletBalance < item.cost) {
    return {
      success: false,
      error: formatInsufficientXpMessage(walletBalance, item.cost),
    };
  }

  return { success: true, newBalance: walletBalance - item.cost };
}
