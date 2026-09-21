"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatUsd, toLocalDatetimeString } from "@/lib/utils";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { Metric, MetricBand } from "@/components/ui/metric";
import { AlertTriangle, ArrowLeft, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { apiFetch } from "@/lib/api-client";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { rankTokenSearchResults } from "@/lib/search/token-search";
import {
  buildStablecoinSymbolSet,
  withAutoStablecoinCategory,
} from "@/lib/constants/stablecoins";
import { getHoldings } from "@/lib/services/portfolio-calculator";
import {
  buildTradeSettlement,
  calculateFeeAmountFromPercent,
  computeSettlementAmountUsd,
  createVaultTransaction,
} from "@/lib/transactions";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

interface StablecoinOption {
  symbol: string;
  name: string;
  coingeckoId: string | null;
  currentQty: number;
}

type TxType = "buy" | "sell" | "receive" | "send";

function getTxTypeToggleClass(type: TxType, isActive: boolean): string {
  if (!isActive) {
    return "border-border-subtle bg-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary";
  }
  // The selected type is stated in its own semantic colour: money in,
  // money out, and the two transfers that move neither.
  if (type === "buy") {
    return "border-status-positive bg-status-positive-soft text-status-positive";
  }
  if (type === "sell") {
    return "border-status-negative bg-status-negative-soft text-status-negative";
  }
  if (type === "receive") {
    return "border-accent bg-accent-soft text-accent";
  }
  return "border-status-caution bg-status-caution-soft text-status-caution";
}

export default function AddTransactionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { ensurePrices } = usePrices();
  const vault = useVaultStore((state) => state.vault);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [type, setType] = useState<TxType>("buy");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [transactedAt, setTransactedAt] = useState(toLocalDatetimeString());
  const [feePercent, setFeePercent] = useState("0.1");
  const [coingeckoId, setCoingeckoId] = useState("");
  const [note, setNote] = useState("");
  const [settlementEnabled, setSettlementEnabled] = useState(false);
  const [settlementSymbol, setSettlementSymbol] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  // Client-side search — relevance ranking with canonical asset preference.
  const filteredCoins = useMemo(() => {
    if (!coinList || searchQuery.trim().length < 1) return [];
    return rankTokenSearchResults(coinList, searchQuery, 15);
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
    name !== selectedCoin.name
  );

  const totalCost = useMemo(() => {
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerUnit);
    if (isNaN(qty) || isNaN(price)) return 0;
    return qty * price;
  }, [quantity, pricePerUnit]);

  const stablecoinOptions = useMemo(() => {
    const stablecoinSymbols = buildStablecoinSymbolSet(vault.tokenCategories);
    const currentQtyBySymbol = new Map<string, number>();
    const optionsBySymbol = new Map<string, StablecoinOption>();
    const holdings = getHoldings(vault, {});

    for (const holding of holdings) {
      const normalizedSymbol = holding.symbol.trim().toUpperCase();
      if (!stablecoinSymbols.has(normalizedSymbol)) continue;
      currentQtyBySymbol.set(normalizedSymbol, holding.currentQty);
      optionsBySymbol.set(normalizedSymbol, {
        symbol: normalizedSymbol,
        name: holding.tokenName || normalizedSymbol,
        coingeckoId: holding.coingeckoId,
        currentQty: holding.currentQty,
      });
    }

    for (const tx of vault.transactions) {
      const normalizedSymbol = tx.tokenSymbol.trim().toUpperCase();
      if (!stablecoinSymbols.has(normalizedSymbol)) continue;
      if (!optionsBySymbol.has(normalizedSymbol)) {
        optionsBySymbol.set(normalizedSymbol, {
          symbol: normalizedSymbol,
          name: tx.tokenName || normalizedSymbol,
          coingeckoId: tx.coingeckoId,
          currentQty: currentQtyBySymbol.get(normalizedSymbol) ?? 0,
        });
      }
    }

    for (const entry of vault.manualEntries) {
      const normalizedSymbol = entry.tokenSymbol.trim().toUpperCase();
      if (!stablecoinSymbols.has(normalizedSymbol)) continue;
      if (!optionsBySymbol.has(normalizedSymbol)) {
        optionsBySymbol.set(normalizedSymbol, {
          symbol: normalizedSymbol,
          name: entry.tokenName || normalizedSymbol,
          coingeckoId: entry.coingeckoId,
          currentQty: currentQtyBySymbol.get(normalizedSymbol) ?? entry.quantity,
        });
      }
    }

    for (const coin of coinList ?? []) {
      const normalizedSymbol = coin.symbol.trim().toUpperCase();
      if (!stablecoinSymbols.has(normalizedSymbol)) continue;
      if (!optionsBySymbol.has(normalizedSymbol)) {
        optionsBySymbol.set(normalizedSymbol, {
          symbol: normalizedSymbol,
          name: coin.name,
          coingeckoId: coin.id,
          currentQty: currentQtyBySymbol.get(normalizedSymbol) ?? 0,
        });
      }
    }

    for (const stablecoinSymbol of stablecoinSymbols) {
      if (!optionsBySymbol.has(stablecoinSymbol)) {
        optionsBySymbol.set(stablecoinSymbol, {
          symbol: stablecoinSymbol,
          name: stablecoinSymbol,
          coingeckoId: null,
          currentQty: currentQtyBySymbol.get(stablecoinSymbol) ?? 0,
        });
      }
    }

    return [...optionsBySymbol.values()].sort((a, b) => {
      if (b.currentQty !== a.currentQty) {
        return b.currentQty - a.currentQty;
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }, [coinList, vault]);

  const defaultSettlementSymbol = stablecoinOptions[0]?.symbol ?? "USDT";

  useEffect(() => {
    if (
      settlementSymbol &&
      stablecoinOptions.some((option) => option.symbol === settlementSymbol)
    ) {
      return;
    }
    setSettlementSymbol(defaultSettlementSymbol);
  }, [defaultSettlementSymbol, settlementSymbol, stablecoinOptions]);

  useEffect(() => {
    if (type === "receive" || type === "send") {
      setSettlementEnabled(false);
      return;
    }

    setSettlementEnabled(true);
  }, [settlementSymbol, type]);

  const selectedSettlementOption = useMemo(
    () =>
      stablecoinOptions.find((option) => option.symbol === settlementSymbol) ?? {
        symbol: defaultSettlementSymbol,
        name: defaultSettlementSymbol,
        coingeckoId: null,
        currentQty: 0,
      },
    [defaultSettlementSymbol, settlementSymbol, stablecoinOptions]
  );

  const settlementAmountUsd = useMemo(() => {
    if (type !== "buy" && type !== "sell") {
      return 0;
    }
    const parsedFeePercent =
      feePercent.trim().length > 0 ? parseFloat(feePercent) : 0;
    const feeUsd = calculateFeeAmountFromPercent(
      totalCost,
      Number.isFinite(parsedFeePercent) ? parsedFeePercent : 0
    );
    return computeSettlementAmountUsd({
      type,
      totalCost,
      fee: feeUsd,
    });
  }, [feePercent, totalCost, type]);

  const feeAmountUsd = useMemo(() => {
    if (type !== "buy" && type !== "sell") {
      return 0;
    }
    const parsedFeePercent =
      feePercent.trim().length > 0 ? parseFloat(feePercent) : 0;
    return calculateFeeAmountFromPercent(
      totalCost,
      Number.isFinite(parsedFeePercent) ? parsedFeePercent : 0
    );
  }, [feePercent, totalCost, type]);

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
    if (!Number.isFinite(price) || price <= 0) {
      setError(t("portfolio.validationPricePositive"));
      return;
    }
    const parsedFeePercent =
      type === "buy" || type === "sell"
        ? feePercent.trim().length > 0
          ? parseFloat(feePercent)
          : 0
        : 0;
    if (!Number.isFinite(parsedFeePercent) || parsedFeePercent < 0) {
      setError(t("portfolio.validationFeeNonNegative"));
      return;
    }
    const parsedFee = calculateFeeAmountFromPercent(totalCost, parsedFeePercent);
    const needsSettlement = settlementEnabled && (type === "buy" || type === "sell");
    if (needsSettlement && !settlementSymbol.trim()) {
      setError(t("portfolioAdd.validationSettlementSymbolRequired"));
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
      const cgId = coingeckoId.trim()
        || BINANCE_SYMBOL_TO_COINGECKO_ID[symbol.trim().toUpperCase()]
        || null;
      const createdAtIso = new Date().toISOString();
      const settlement = needsSettlement
        ? buildTradeSettlement({
            settlement: {
              tokenSymbol: selectedSettlementOption.symbol,
              tokenName: selectedSettlementOption.name,
              coingeckoId: selectedSettlementOption.coingeckoId,
            },
            type,
            totalCost: qty * price,
            fee: parsedFee,
            pricePerUnit: 1,
          })
        : undefined;
      const newTx = createVaultTransaction({
        id: crypto.randomUUID(),
        tokenSymbol: symbol.trim(),
        tokenName: name.trim(),
        chain: "",
        type,
        quantity: qty,
        pricePerUnit: price,
        fee: parsedFee,
        coingeckoId: cgId,
        note,
        transactedAt: parsedTransactedAt.toISOString(),
        createdAt: createdAtIso,
        settlement,
      });

      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        transactions: [...prev.transactions, newTx],
        tokenCategories: [newTx.tokenSymbol, settlement?.tokenSymbol].reduce(
          (categories, tokenSymbol) =>
            tokenSymbol
              ? withAutoStablecoinCategory(categories, tokenSymbol, createdAtIso)
              : categories,
          prev.tokenCategories
        ),
      }));

      const tokensToEnsure = [
        cgId ? { coingeckoId: cgId, symbol: symbol.trim() } : null,
        settlement?.coingeckoId
          ? {
              coingeckoId: settlement.coingeckoId,
              symbol: settlement.tokenSymbol,
            }
          : null,
      ].filter(
        (
          token
        ): token is {
          coingeckoId: string;
          symbol: string;
        } => Boolean(token)
      );

      if (tokensToEnsure.length > 0) {
        ensurePrices(tokensToEnsure).catch(() => {});
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

  const stepLabel = (index: number) => (
    <span className="font-mono text-meta uppercase text-text-muted">
      {t("portfolioAdd.step", { index: String(index) })}
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/portfolio" aria-label={t("portfolioAdd.back")}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <PageHeader
          eyebrow={t("portfolioAdd.subtitle")}
          title={t("portfolioAdd.title")}
          className="grow"
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1 — what kind of transaction */}
        <Card className="p-0">
          <div className="border-b border-border px-5 py-3">
            {stepLabel(1)}
            <h2 className="text-label uppercase text-text-primary">
              {t("portfolioAdd.stepType")}
            </h2>
          </div>
          <div className="space-y-3 p-5">
            <div
              role="group"
              aria-label={t("portfolioAdd.stepType")}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {(["buy", "sell", "receive", "send"] as const).map((txType) => (
                <button
                  key={txType}
                  type="button"
                  onClick={() => setType(txType)}
                  aria-pressed={type === txType}
                  className={cn(
                    "h-control-lg border text-body font-semibold",
                    "transition-colors duration-[120ms] ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
                    getTxTypeToggleClass(txType, type === txType)
                  )}
                >
                  {txType === "buy"
                    ? t("portfolio.buy")
                    : txType === "sell"
                      ? t("portfolio.sell")
                      : txType === "receive"
                        ? t("portfolio.receive")
                        : t("portfolio.send")}
                </button>
              ))}
            </div>
            {(type === "receive" || type === "send") && (
              <p className="text-caption text-text-muted">
                {t("portfolioAdd.receiveSendHint", {
                  label:
                    type === "receive" ? t("portfolio.receive") : t("portfolio.send"),
                })}
              </p>
            )}
          </div>
        </Card>

        {/* Step 2 — which token */}
        <Card className="p-0">
          <div className="border-b border-border px-5 py-3">
            {stepLabel(2)}
            <h2 className="text-label uppercase text-text-primary">
              {t("portfolioAdd.stepToken")}
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <div ref={dropdownRef} className="relative">
              <FormField
                label={t("portfolioAdd.searchCoinGecko")}
                htmlFor="coin-search"
                hint={t("portfolioAdd.searchHint")}
              >
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="coin-search"
                    placeholder={t("portfolioAdd.searchPlaceholder")}
                    value={searchQuery}
                    aria-expanded={showDropdown && searchQuery.length >= 1}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => {
                      if (searchQuery.length >= 1) setShowDropdown(true);
                    }}
                    className="pl-9"
                  />
                </div>
              </FormField>
              {showDropdown && searchQuery.length >= 1 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-bg-card shadow-overlay">
                  {filteredCoins.length === 0 ? (
                    <p className="px-4 py-3 text-body text-text-muted">
                      {t("portfolioAdd.noResults")}
                    </p>
                  ) : (
                    filteredCoins.map((coin) => (
                      <button
                        key={coin.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
                        onClick={() => selectCoin(coin)}
                      >
                        <span className="font-semibold text-text-primary">
                          {coin.symbol.toUpperCase()}
                        </span>
                        <span className="min-w-0 truncate text-text-secondary">
                          {coin.name}
                        </span>
                        {coin.binance && (
                          <StatusPill tone="neutral" className="ml-auto shrink-0">
                            Binance
                          </StatusPill>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("portfolioAdd.tokenSymbol")} htmlFor="symbol">
                <Input
                  id="symbol"
                  placeholder={t("portfolioAdd.tokenSymbolPlaceholder")}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </FormField>
              <FormField label={t("portfolioAdd.tokenName")} htmlFor="name">
                <Input
                  id="name"
                  placeholder={t("portfolioAdd.tokenNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>
            </div>

            {tokenMismatch && (
              <InlineHelpCard
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                title={t("portfolioAdd.tokenMismatchWarning", {
                  token: selectedCoin.name,
                })}
              />
            )}
          </div>
        </Card>

        {/* Step 3 — how much, and when */}
        <Card className="p-0">
          <div className="border-b border-border px-5 py-3">
            {stepLabel(3)}
            <h2 className="text-label uppercase text-text-primary">
              {t("portfolioAdd.stepAmount")}
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("portfolioAdd.quantity")} htmlFor="quantity">
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t("portfolioAdd.quantityPlaceholder")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="font-mono tabular"
                />
              </FormField>
              <FormField
                label={t("portfolioAdd.pricePerUnit")}
                htmlFor="pricePerUnit"
                hint={fetchingPrice ? t("portfolioAdd.fetchingPrice") : undefined}
              >
                <Input
                  id="pricePerUnit"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t("portfolioAdd.pricePlaceholder")}
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  className="font-mono tabular"
                />
              </FormField>
            </div>

            <FormField label={t("common.date")} htmlFor="transactedAt">
              <Input
                id="transactedAt"
                type="datetime-local"
                value={transactedAt}
                onChange={(e) => setTransactedAt(e.target.value)}
                className="font-mono"
              />
            </FormField>

            {totalCost > 0 && (
              <MetricBand columns={2}>
                <Metric
                  label={t("portfolioAdd.totalCostLabel")}
                  value={formatUsd(totalCost)}
                  size="md"
                />
                <Metric
                  label={t("portfolioAdd.fee")}
                  value={formatUsd(feeAmountUsd)}
                  size="md"
                  tone="muted"
                />
              </MetricBand>
            )}
          </div>
        </Card>

        {/* Everything a person does not set most of the time */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center gap-2 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
          >
            <SlidersHorizontal className="h-4 w-4 text-text-muted" aria-hidden="true" />
            <span className="text-label uppercase text-text-primary">
              {t("portfolioAdd.advancedDetails")}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-text-muted transition-transform duration-[120ms] ease-out",
                showAdvanced && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-border p-5">
              {(type === "buy" || type === "sell") && (
                <>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={settlementEnabled}
                      onChange={(e) => setSettlementEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded-sm border-border accent-accent"
                    />
                    <span className="space-y-1">
                      <span className="block text-body font-semibold text-text-primary">
                        {t("portfolioAdd.adjustStablecoinBalance")}
                      </span>
                      <span className="block text-caption text-text-muted">
                        {t("portfolioAdd.adjustStablecoinBalanceDesc")}
                      </span>
                    </span>
                  </label>

                  {settlementEnabled && (
                    <div className="space-y-3 border-l-0 pl-7">
                      <FormField
                        label={t("portfolioAdd.settlementStablecoin")}
                        htmlFor="settlementStablecoin"
                      >
                        <Select
                          id="settlementStablecoin"
                          value={settlementSymbol}
                          onChange={(e) => setSettlementSymbol(e.target.value)}
                        >
                          {stablecoinOptions.map((option) => (
                            <option key={option.symbol} value={option.symbol}>
                              {option.symbol} · {option.name}
                            </option>
                          ))}
                        </Select>
                      </FormField>

                      {settlementAmountUsd > 0 && (
                        <p className="font-mono text-num-sm tabular text-text-secondary">
                          {t("portfolioAdd.settlementPreview", {
                            token: selectedSettlementOption.symbol,
                            direction:
                              type === "buy"
                                ? t("portfolio.transactionSettlementOut")
                                : t("portfolio.transactionSettlementIn"),
                            amount: formatUsd(settlementAmountUsd),
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  <FormField
                    label={t("portfolioAdd.fee")}
                    htmlFor="feePercent"
                    requiredLabel={`(${t("common.optional")})`}
                    hint={t("portfolioAdd.feeAmountPreview", {
                      amount: formatUsd(feeAmountUsd),
                    })}
                  >
                    <Input
                      id="feePercent"
                      type="number"
                      step="any"
                      min="0"
                      placeholder={t("portfolioAdd.feePlaceholder")}
                      value={feePercent}
                      onChange={(e) => setFeePercent(e.target.value)}
                      className="font-mono tabular"
                    />
                  </FormField>
                </>
              )}

              <FormField
                label={t("common.note")}
                htmlFor="note"
                requiredLabel={`(${t("common.optional")})`}
              >
                <Input
                  id="note"
                  placeholder={t("portfolioAdd.notePlaceholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormField>
            </div>
          )}
        </Card>

        {error && (
          <InlineHelpCard
            tone="danger"
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            title={t("portfolioAdd.failedToAdd")}
            description={error}
          />
        )}

        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-bg-page py-3">
          <Link href="/portfolio" className="grow sm:grow-0">
            <Button type="button" variant="outline" size="lg" className="w-full">
              {t("portfolioAdd.back")}
            </Button>
          </Link>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="grow"
            disabled={submitting}
          >
            {submitting
              ? t("portfolioAdd.addingTransaction")
              : t("portfolioAdd.addTransaction")}
          </Button>
        </div>
      </form>
    </div>
  );
}
