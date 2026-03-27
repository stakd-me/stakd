import { describe, expect, it } from "vitest";
import {
  buildTradeSettlement,
  calculateFeeAmountFromPercent,
  calculateFeePercentFromAmount,
  computeSettlementAmountUsd,
  createVaultTransaction,
  expandTransactionForBalance,
} from "@/lib/transactions";

describe("transaction helpers", () => {
  it("builds settlement amounts with fee-aware buy and sell logic", () => {
    expect(
      computeSettlementAmountUsd({
        type: "buy",
        totalCost: 69_000,
        fee: 10,
      })
    ).toBe(69_010);

    expect(
      computeSettlementAmountUsd({
        type: "sell",
        totalCost: 35_000,
        fee: 15,
      })
    ).toBe(34_985);
  });

  it("converts fee percentages to stored fee amounts and back", () => {
    expect(calculateFeeAmountFromPercent(69_000, 0.1)).toBeCloseTo(69);
    expect(calculateFeePercentFromAmount(69_000, 69)).toBeCloseTo(0.1);
  });

  it("normalizes a settled trade into balance-impact legs", () => {
    const settlement = buildTradeSettlement({
      settlement: {
        tokenSymbol: "usdt",
        tokenName: "Tether",
        coingeckoId: "tether",
      },
      type: "buy",
      totalCost: 69_000,
      fee: 0,
      pricePerUnit: 1,
    });

    const tx = createVaultTransaction({
      id: "tx-btc-buy",
      tokenSymbol: "btc",
      tokenName: "Bitcoin",
      chain: "",
      type: "buy",
      quantity: 1,
      pricePerUnit: 69_000,
      fee: 0,
      coingeckoId: "bitcoin",
      note: "Funded with USDT",
      transactedAt: "2026-03-20T00:00:00.000Z",
      createdAt: "2026-03-20T00:00:00.000Z",
      settlement,
    });

    const legs = expandTransactionForBalance(tx);

    expect(legs).toHaveLength(2);
    expect(legs[0].type).toBe("buy");
    expect(legs[0].isSettlement).toBe(false);
    expect(legs[1].type).toBe("sell");
    expect(legs[1].tokenSymbol).toBe("USDT");
    expect(legs[1].isSettlement).toBe(true);
    expect(legs[1].totalCost).toBe("69000");
  });
});
