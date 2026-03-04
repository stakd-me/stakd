"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuideSection } from "@/components/guide/guide-section";
import { ArrowRight } from "lucide-react";

const tocItems = [
  { id: "quick-start", label: "Quick Start" },
  { id: "daily-ops", label: "Daily Operations" },
  { id: "reports", label: "Weekly/Monthly/Quarterly/Yearly Reports" },
  { id: "manual-execution", label: "Manual Execution Workflow" },
  { id: "reconciliation", label: "Post-Trade Reconciliation" },
];

export default function AppGuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">App Guide</h1>
        <p className="text-text-subtle">
          Operating handbook for portfolio tracking, reporting, and manual execution.
        </p>
      </div>

      <div className="flex gap-8">
        <div className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6 space-y-1 rounded-lg border border-border-subtle bg-bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
              Table of contents
            </p>
            {tocItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-10">
          <GuideSection id="quick-start" title="Quick Start">
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-text-muted">
                <p>1. Add transactions in Portfolio or import CSV history.</p>
                <p>2. Set target allocations in Rebalance.</p>
                <p>3. Review risk alerts in Dashboard.</p>
                <p>4. Generate Reports and execute trades manually outside the app.</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="daily-ops" title="Daily Operations">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-text-muted">
                <p>1. Refresh prices and review stale-price warning.</p>
                <p>2. Check concentration/drift alerts on Dashboard.</p>
                <p>3. Record new trades or transfers from your exchange/wallet activity.</p>
                <p>4. Verify that holdings and P&L are aligned with your broker/exchange statements.</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection
            id="reports"
            title="Weekly / Monthly / Quarterly / Yearly Reports"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How to use Reports page</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-text-muted">
                <p>1. Open Reports and choose the period: Week, Month, Quarter, Year, or All-time.</p>
                <p>2. Review KPI contract: Start/End Value, Capital Net Flow, External Net Flow, Trading Turnover, Period P&L, Return (Modified Dietz).</p>
                <p>3. Check the Data Quality badge (Exact/Estimated/Incomplete) before using report numbers for decision-making.</p>
                <p>4. Validate reconciliation line: Start + Capital Net Flow + P&L should match End Value.</p>
                <p>5. Compare return/P&L delta versus previous to-date window.</p>
                <p>6. Inspect concentration and best/worst performers.</p>
                <p>7. Export JSON/CSV for external review or investment committee records.</p>
                <div className="pt-1">
                  <Link href="/reports">
                    <Button variant="outline" size="sm">
                      Open Reports
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="manual-execution" title="Manual Execution Workflow">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Important</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-text-muted">
                <p>
                  This app does not place exchange orders. Use it as a decision and
                  control system, then execute orders manually on your exchange.
                </p>
                <p>1. Create rebalance suggestions in Rebalance.</p>
                <p>2. Confirm the order list and risk constraints.</p>
                <p>3. Execute trades manually outside the app.</p>
                <p>4. Record executed trades in Portfolio immediately after execution.</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="reconciliation" title="Post-Trade Reconciliation">
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-text-muted">
                <p>1. Import or add the executed fills as transactions.</p>
                <p>2. Compare resulting holdings to target allocation and expected drift.</p>
                <p>3. Validate fee impact and realized/unrealized P&L changes.</p>
                <p>4. Save weekly/monthly snapshots for audit continuity.</p>
              </CardContent>
            </Card>
          </GuideSection>
        </div>
      </div>
    </div>
  );
}
