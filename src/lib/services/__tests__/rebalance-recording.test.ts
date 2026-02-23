import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import { buildTransactionsFromExecutedTrades } from "@/lib/services/rebalance-recording";

describe("rebalance-recording", () => {
  it("keeps existing token metadata when recording executed trades", () => {
    const vault = createEmptyVault();
    vault.transactions = [
      {
        id: "existing-btc",
        tokenSymbol: "BTC",
        tokenName: "Bitcoin",
        chain: "bitcoin",
        type: "buy",
        quantity: "1",
        pricePerUnit: "100",
        totalCost: "100",
        fee: "0",
        coingeckoId: "bitcoin",
        note: null,
        transactedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const result = buildTransactionsFromExecutedTrades(
      vault,
      [{ tokenSymbol: "btc", action: "buy", amountUsd: 250, quantity: "2.5" }],
      "2026-02-01T00:00:00.000Z",
      "Recorded from session"
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].tokenSymbol).toBe("BTC");
    expect(result.transactions[0].tokenName).toBe("Bitcoin");
    expect(result.transactions[0].coingeckoId).toBe("bitcoin");
    expect(result.tokensToEnsure).toEqual([
      { coingeckoId: "bitcoin", symbol: "BTC" },
    ]);
  });

  it("ignores invalid quantities and falls back safely for unknown symbols", () => {
    const vault = createEmptyVault();

    const result = buildTransactionsFromExecutedTrades(
      vault,
      [
        { tokenSymbol: "new", action: "sell", amountUsd: 10, quantity: "0" },
        { tokenSymbol: "new", action: "sell", amountUsd: 10, quantity: "2" },
      ],
      "2026-02-01T00:00:00.000Z",
      "Recorded from session"
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].tokenSymbol).toBe("NEW");
    expect(result.transactions[0].tokenName).toBe("NEW");
    expect(result.transactions[0].coingeckoId).toBeNull();
    expect(result.transactions[0].type).toBe("sell");
    expect(result.tokensToEnsure).toHaveLength(0);
  });
});
