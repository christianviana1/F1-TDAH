"use client";

// Pit Stop Shop page — F1 Advanced Features
// Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Tag, History, Plus, Ban } from "lucide-react";
import {
  type RewardItem,
  type Redemption,
  validateRewardItem,
  formatInsufficientXpMessage,
} from "@/app/pit-stop-shop/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a PT-BR locale date+time string. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PitStopShopPage() {
  const { data: session } = useSession();
  const user = session?.user as (typeof session extends null | undefined ? never : NonNullable<typeof session>["user"]) & { xp?: number } | undefined;

  // ── State ──────────────────────────────────────────────────────────────────

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [items, setItems] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New item form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCost, setNewCost] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Per-item action state
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [walletRes, itemsRes, redemptionsRes] = await Promise.all([
        fetch("/api/pit-stop-shop/wallet"),
        fetch("/api/pit-stop-shop/items"),
        fetch("/api/pit-stop-shop/redemptions"),
      ]);

      if (walletRes.ok) {
        const data = await walletRes.json();
        setWalletBalance(data.walletBalance ?? 0);
      }
      if (itemsRes.ok) {
        const data: RewardItem[] = await itemsRes.json();
        setItems(data);
      }
      if (redemptionsRes.ok) {
        const data: Redemption[] = await redemptionsRes.json();
        setRedemptions(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Create item ────────────────────────────────────────────────────────────

  const handleCreateItem = async () => {
    const cost = parseInt(newCost, 10);
    const validation = validateRewardItem(newName, newDescription, cost);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setFormErrors([]);
    setIsCreating(true);
    try {
      const res = await fetch("/api/pit-stop-shop/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          cost,
        }),
      });

      if (res.ok) {
        const created: RewardItem = await res.json();
        setItems((prev) => [created, ...prev]);
        setNewName("");
        setNewDescription("");
        setNewCost("");
      } else {
        const data = await res.json().catch(() => ({}));
        setFormErrors(
          (data.errors as string[] | undefined) ?? [
            "Falha ao criar item. Tente novamente.",
          ]
        );
      }
    } finally {
      setIsCreating(false);
    }
  };

  // ── Redeem item ────────────────────────────────────────────────────────────

  const handleRedeem = async (item: RewardItem) => {
    setActionError(null);
    // Client-side XP check for UX feedback (Req 5.7)
    if (walletBalance < item.cost) {
      setActionError(formatInsufficientXpMessage(walletBalance, item.cost));
      return;
    }

    setRedeemingId(item.id);
    try {
      const res = await fetch("/api/pit-stop-shop/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardItemId: item.id }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Req 5.10: update wallet balance from response without page reload
        setWalletBalance(data.newWalletBalance ?? walletBalance - item.cost);
        // Prepend the new redemption to history
        if (data.redemption) {
          const newRedemption: Redemption = {
            id: data.redemption.id,
            userId: "",
            rewardItemId: item.id,
            nameSnapshot: data.redemption.nameSnapshot,
            costSnapshot: data.redemption.costSnapshot,
            redeemedAt: data.redemption.redeemedAt,
          };
          setRedemptions((prev) => [newRedemption, ...prev]);
        }
      } else {
        setActionError(
          data.error ?? "Falha ao resgatar item. Tente novamente."
        );
      }
    } finally {
      setRedeemingId(null);
    }
  };

  // ── Deactivate item ────────────────────────────────────────────────────────

  const handleDeactivate = async (item: RewardItem) => {
    setActionError(null);
    setDeactivatingId(item.id);
    try {
      const res = await fetch(`/api/pit-stop-shop/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE" }),
      });

      if (res.ok) {
        // Remove from active items list (Req 5.5)
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Falha ao desativar item.");
      }
    } finally {
      setDeactivatingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalXp = (user as { xp?: number } | undefined)?.xp ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      {/* ── HEADER (Req 5.9) ─────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-red-600" />
            Pit Stop Shop
          </h1>
          <p className="text-zinc-400 text-xs md:text-sm font-mono">
            Troque seu XP por recompensas personalizadas
          </p>
        </div>

        {/* XP display — two distinct labels (Req 5.9) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Wallet XP */}
          <div className="bg-zinc-900 border border-yellow-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
            <span className="text-yellow-400 text-lg leading-none">💰</span>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none mb-0.5">
                Carteira
              </p>
              <p className="text-yellow-400 font-black text-base leading-none">
                {isLoading ? "..." : walletBalance} XP
              </p>
            </div>
          </div>

          {/* Progression XP from session */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 flex items-center gap-2">
            <span className="text-zinc-300 text-lg leading-none">⭐</span>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none mb-0.5">
                XP Total
              </p>
              <p className="text-zinc-300 font-black text-base leading-none">
                {totalXp} XP
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Global action error banner */}
      {actionError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-mono flex items-center justify-between gap-3">
          <span>⚠️ {actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-300 text-xs shrink-0"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── SECTION 1: Reward Items + Create Form ──────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Create new item form */}
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Plus className="h-4 w-4 text-red-600" />
                Novo Item de Recompensa
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-mono text-xs">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Ex: Sessão de filme"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400 font-mono text-xs">
                  Descrição
                </Label>
                <textarea
                  placeholder="Descrição opcional (máx. 500 caracteres)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 resize-none outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/30 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400 font-mono text-xs">
                  Custo em XP <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ex: 500"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                />
              </div>

              {/* Inline validation errors */}
              {formErrors.length > 0 && (
                <ul className="space-y-1">
                  {formErrors.map((err, i) => (
                    <li
                      key={i}
                      className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5"
                    >
                      🚫 {err}
                    </li>
                  ))}
                </ul>
              )}

              <Button
                onClick={handleCreateItem}
                disabled={isCreating}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide"
              >
                {isCreating ? "Criando..." : "Criar Item 🏁"}
              </Button>
            </CardContent>
          </Card>

          {/* Active items list */}
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Tag className="h-4 w-4 text-red-600" />
                Itens Disponíveis
                <span className="text-zinc-600 text-xs font-mono normal-case">
                  ({items.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center">
                  Carregando telemetria...
                </div>
              ) : items.length === 0 ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  Nenhum item criado ainda. Adicione seu primeiro prêmio!
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => {
                    const canAfford = walletBalance >= item.cost;
                    const isRedeeming = redeemingId === item.id;
                    const isDeactivating = deactivatingId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                      >
                        {/* Item info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-white">
                              {item.name}
                            </span>
                            <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 font-mono text-[10px] border">
                              {item.cost} XP
                            </Badge>
                          </div>
                          {item.description && (
                            <p className="text-zinc-500 text-xs leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                          {/* Resgatar button (Req 5.6, 5.7) */}
                          <div
                            title={
                              !canAfford
                                ? formatInsufficientXpMessage(
                                    walletBalance,
                                    item.cost
                                  )
                                : undefined
                            }
                          >
                            <Button
                              size="sm"
                              disabled={!canAfford || isRedeeming || isDeactivating}
                              onClick={() => handleRedeem(item)}
                              className={`text-xs font-bold h-7 px-3 ${
                                canAfford
                                  ? "bg-red-600 hover:bg-red-700 text-white"
                                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              {isRedeeming ? "..." : "Resgatar"}
                            </Button>
                          </div>

                          {/* Desativar button (Req 5.5) */}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isDeactivating || isRedeeming}
                            onClick={() => handleDeactivate(item)}
                            className="text-zinc-500 hover:text-red-400 text-xs h-7 px-2"
                            aria-label={`Desativar ${item.name}`}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />
                            {isDeactivating ? "..." : "Desativar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── SECTION 2: Redemption History (Req 5.8) ────────────────────── */}
        <div>
          <Card className="bg-zinc-900 border-zinc-800 text-white sticky top-4">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <History className="h-4 w-4 text-red-600" />
                Histórico de Resgates
                <span className="text-zinc-600 text-xs font-mono normal-case">
                  ({redemptions.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center">
                  Carregando...
                </div>
              ) : redemptions.length === 0 ? (
                <div className="text-zinc-600 font-mono text-sm py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  Nenhum resgate realizado ainda.
                </div>
              ) : (
                /* Sorted by date descending (API returns in order, Req 5.8) */
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {redemptions.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm text-white leading-snug">
                          {r.nameSnapshot}
                        </span>
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 font-mono text-[10px] border shrink-0">
                          -{r.costSnapshot} XP
                        </Badge>
                      </div>
                      <p className="text-zinc-600 text-[11px] font-mono">
                        {formatDate(r.redeemedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
