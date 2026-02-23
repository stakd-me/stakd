"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

const sections = [
  { id: "what-is", key: "guide.whatIs" as const },
  { id: "why-rebalance", key: "guide.whyRebalance" as const },
  { id: "strategies", key: "guide.strategies" as const },
  { id: "comparison", key: "guide.comparison" as const },
  { id: "risk-metrics", key: "guide.riskMetrics" as const },
  { id: "crypto-vs-trad", key: "guide.cryptoVsTrad" as const },
  { id: "find-strategy", key: "guide.findStrategy" as const },
];

export function GuideTOC() {
  const [activeId, setActiveId] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <nav className="space-y-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
        {t("guide.toc")}
      </p>
      {sections.map((section, i) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={cn(
            "block rounded-md px-3 py-1.5 text-sm transition-colors",
            activeId === section.id
              ? "bg-bg-hover text-text-primary font-medium"
              : "text-text-subtle hover:text-text-primary"
          )}
        >
          {i + 1}. {t(section.key)}
        </a>
      ))}
    </nav>
  );
}
