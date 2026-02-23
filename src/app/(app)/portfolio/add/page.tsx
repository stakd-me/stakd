"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, toLocalDatetimeString } from "@/lib/utils";
import { ArrowLeft, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { apiFetch } from "@/lib/api-client";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

type TxType = "buy" | "sell" | "receive" | "send";

function getTxTypeToggleClass(type: TxType, isActive: boolean): string {
  if (!isActive) {
    return "border border-border bg-bg-input text-text-subtle hover:bg-bg-hover";
  }
  if (type === "buy") {
    return "border border-status-positive-border bg-status-positive-soft text-status-positive";
  }
  if (type === "sell") {
    return "border border-status-negative-border bg-status-negative-soft text-status-negative";
  }
  if (type === "receive") {
    return "border border-status-info-border bg-status-info-soft text-status-info";
  }
  return "border border-status-caution-border bg-status-caution-soft text-status-caution";
}

export default function AddTransactionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { ensurePrices } = usePrices();

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [type, setType] = useState<TxType>("buy");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [transactedAt, setTransactedAt] = useState(toLocalDatetimeString());
  const [fee, setFee] = useState("");
  const [coingeckoId, setCoingeckoId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Track CoinGecko selection to detect manual edits
  const [selectedCoin, setSelectedCoin] = useState<{ symbol: string; name: string; id: string } | null>(null);

  // Load coin list once from static JSON
  const { data: coinList } = useQuery<CoinListItem[]>({
    queryKey: ["coins-list"],
    queryFn: async () => {
      const res = await fetch("/coins-list.json");
      if (!res.ok) throw new Error("Failed to load coin list");
      return res.json();
    },
    staleTime: Infinity,
  });

  // Client-side search — Binance-available coins sorted first
  const filteredCoins = useMemo(() => {
    if (!coinList || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    const results: CoinListItem[] = [];
    for (const coin of coinList) {
      if (
        coin.name.toLowerCase().includes(q) ||
        coin.symbol.toLowerCase().includes(q) ||
        coin.id.toLowerCase().includes(q)
      ) {
        results.push(coin);
        if (results.length >= 50) break;
      }
    }
    results.sort((a, b) => {
      if (a.binance !== b.binance) return a.binance ? -1 : 1;
      return 0;
    });
    return results.slice(0, 15);
  }, [coinList, searchQuery]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(e.target as Node)
    ) {
      setShowDropdown(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const [fetchingPrice, setFetchingPrice] = useState(false);

  const selectCoin = async (coin: CoinListItem) => {
    setSymbol(coin.symbol.toUpperCase());
    setName(coin.name);
    setCoingeckoId(coin.id);
    setSelectedCoin({ symbol: coin.symbol.toUpperCase(), name: coin.name, id: coin.id });
    setSearchQuery("");
    setShowDropdown(false);

    // Auto-fetch current price — try Binance first via symbol param
    setFetchingPrice(true);
    try {
      const symbolParam = coin.binance ? `?symbol=${encodeURIComponent(coin.symbol.toUpperCase())}` : "";
      const res = await apiFetch(`/api/tokens/${encodeURIComponent(coin.id)}${symbolParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.priceUsd != null) {
          setPricePerUnit(String(data.priceUsd));
        }
      }
    } catch {
      // Silently fail — user can still enter price manually
    } finally {
      setFetchingPrice(false);
    }
  };

  const tokenMismatch = selectedCoin && (
    symbol !== selectedCoin.symbol ||
    name !== selectedCoin.name ||
    coingeckoId !== selectedCoin.id
  );

  const totalCost = useMemo(() => {
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerUnit);
    if (isNaN(qty) || isNaN(price)) return 0;
    return qty * price;
  }, [quantity, pricePerUnit]);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!symbol.trim()) {
      setError(t("portfolio.validationSymbolRequired"));
      return;
    }
    if (!name.trim()) {
      setError(t("portfolio.validationNameRequired"));
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError(t("portfolio.validationQuantityPositive"));
      return;
    }
    const price = parseFloat(pricePerUnit);
    if (isNaN(price) || price < 0) {
      setError(t("portfolio.validationPriceNonNegative"));
      return;
    }
    const parsedFee = fee.trim().length > 0 ? parseFloat(fee) : 0;
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      setError(t("portfolio.validationFeeNonNegative"));
      return;
    }
    if (!transactedAt) {
      setError(t("portfolio.validationDateRequired"));
      return;
    }
    const parsedTransactedAt = new Date(transactedAt);
    if (Number.isNaN(parsedTransactedAt.getTime())) {
      setError(t("portfolio.validationDateRequired"));
      return;
    }
    if (parsedTransactedAt.getTime() > Date.now()) {
      setError(t("portfolio.validationDateNotFuture"));
      return;
    }

    setSubmitting(true);
    try {
      const cgId = coingeckoId.trim() || null;
      const newTx = {
        id: crypto.randomUUID(),
        tokenSymbol: symbol.trim(),
        tokenName: name.trim(),
        chain: "",
        type,
        quantity: qty.toString(),
        pricePerUnit: price.toString(),
        totalCost: (qty * price).toString(),
        fee: parsedFee.toString(),
        coingeckoId: cgId,
        note: note.trim() || null,
        transactedAt: parsedTransactedAt.toISOString(),
        createdAt: new Date().toISOString(),
      };

      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        transactions: [...prev.transactions, newTx],
      }));

      // Ensure price tracking for this token
      if (cgId) {
        ensurePrices([{ coingeckoId: cgId, symbol: symbol.trim() }]).catch(() => {});
      }

      toast(t("portfolioAdd.transactionAdded"), "success");
      router.push("/portfolio");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("portfolioAdd.failedToAdd"));
      toast(t("portfolioAdd.failedToAdd"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portfolio">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t("portfolioAdd.title")}</h1>
          <p className="text-text-subtle">{t("portfolioAdd.subtitle")}</p>
        </div>
      </div>

      {/* Transaction Type Toggle */}
      <div className="grid grid-cols-4 gap-2">
        {(["buy", "sell", "receive", "send"] as const).map((txType) => (
          <button
            key={txType}
            type="button"
            onClick={() => {
              setType(txType);
              if (txType === "receive" || txType === "send") {
                setPricePerUnit("0");
              }
            }}
            className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${getTxTypeToggleClass(
              txType,
              type === txType
            )}`}
          >
            {txType === "buy" ? t("portfolio.buy") : txType === "sell" ? t("portfolio.sell") : txType === "receive" ? t("portfolio.receive") : t("portfolio.send")}
          </button>
        ))}
      </div>
      {(type === "receive" || type === "send") && (
        <p className="text-xs text-text-subtle">
          {t("portfolioAdd.receiveSendHint", {
            label: type === "receive" ? t("portfolio.receive") : t("portfolio.send"),
          })}
        </p>
      )}

      {/* CoinGecko Search */}
      <Card>
        <CardHeader>
          <CardTitle>{t("portfolioAdd.searchCoinGecko")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={dropdownRef} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <Input
              placeholder={t("portfolioAdd.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                if (searchQuery.length >= 1) setShowDropdown(true);
              }}
              className="pl-10"
            />
            {showDropdown && searchQuery.length >= 1 && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-bg-input shadow-lg">
                {filteredCoins.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-text-subtle">
                    {t("portfolioAdd.noResults")}
                  </div>
                ) : (
                  filteredCoins.map((coin) => (
                    <button
                      key={coin.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-bg-hover"
                      onClick={() => selectCoin(coin)}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                        {coin.symbol[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-text-tertiary">
                        {coin.name}
                      </span>
                      <span className="text-text-subtle">
                        {coin.symbol.toUpperCase()}
                      </span>
                      {coin.binance && (
                        <span className="ml-auto rounded bg-status-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
                          Binance
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t("portfolioAdd.transactionDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="symbol" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.tokenSymbol")}
                </label>
                <Input
                  id="symbol"
                  placeholder={t("portfolioAdd.tokenSymbolPlaceholder")}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.tokenName")}
                </label>
                <Input
                  id="name"
                  placeholder={t("portfolioAdd.tokenNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="quantity" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.quantity")}
                </label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t("portfolioAdd.quantityPlaceholder")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="pricePerUnit" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.pricePerUnit")}
                  {fetchingPrice && (
                    <span className="ml-2 text-xs text-status-info">
                      {t("portfolioAdd.fetchingPrice")}
                    </span>
                  )}
                </label>
                <Input
                  id="pricePerUnit"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t("portfolioAdd.pricePlaceholder")}
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                />
              </div>
            </div>

            {/* Auto-computed total */}
            {totalCost > 0 && (
              <div className="rounded-md bg-bg-card px-4 py-3">
                <p className="text-sm text-text-subtle">
                  {t("portfolioAdd.totalCost", { amount: formatUsd(totalCost) })}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="transactedAt" className="text-sm font-medium text-text-muted">
                {t("common.date")}
              </label>
              <Input
                id="transactedAt"
                type="datetime-local"
                value={transactedAt}
                onChange={(e) => setTransactedAt(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="fee" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.fee")} <span className="text-text-dim">({t("common.optional")})</span>
                </label>
                <Input
                  id="fee"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="coingeckoId" className="text-sm font-medium text-text-muted">
                  {t("portfolioAdd.coingeckoId")} <span className="text-text-dim">({t("common.optional")})</span>
                </label>
                <Input
                  id="coingeckoId"
                  placeholder={t("portfolioAdd.coingeckoIdPlaceholder")}
                  value={coingeckoId}
                  onChange={(e) => setCoingeckoId(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="note" className="text-sm font-medium text-text-muted">
                {t("common.note")} <span className="text-text-dim">({t("common.optional")})</span>
              </label>
              <Input
                id="note"
                placeholder={t("portfolioAdd.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {tokenMismatch && (
              <div className="flex items-start gap-2 rounded-md bg-status-warning-soft px-4 py-3 text-sm text-status-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t("portfolioAdd.tokenMismatchWarning", {
                    token: selectedCoin.name,
                  })}
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-status-negative-soft px-4 py-3 text-sm text-status-negative">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Link href="/portfolio" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  {t("portfolioAdd.back")}
                </Button>
              </Link>
              <Button
                type="submit"
                className="flex-1"
                disabled={submitting}
              >
                {submitting ? t("portfolioAdd.addingTransaction") : t("portfolioAdd.addTransaction")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
