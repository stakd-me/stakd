"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

export interface GuideTocItem {
  id: string;
  label: string;
}

interface GuideTocProps {
  items: GuideTocItem[];
}

/**
 * Shared table of contents for both guides. It was hard-coded to the
 * rebalance guide's seven sections, so the app guide carried its own
 * copy inline — without the scroll-spy that makes a long page navigable.
 */
function useActiveSection(items: GuideTocItem[]): string {
  const [activeId, setActiveId] = useState("");
  const ids = items.map((item) => item.id).join(",");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const id of ids.split(",")) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

/** The desktop sidebar form. */
export function GuideTOC({ items }: GuideTocProps) {
  const activeId = useActiveSection(items);
  const { t } = useTranslation();

  return (
    <nav aria-label={t("guide.toc")} className="border border-border bg-bg-card p-3">
      <p className="mb-2 px-2 font-mono text-meta uppercase text-text-muted">
        {t("guide.toc")}
      </p>
      {items.map((item, index) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={activeId === item.id ? "location" : undefined}
          className={cn(
            "block px-2 py-1.5 text-body transition-colors duration-[120ms] ease-out",
            activeId === item.id
              ? "bg-bg-hover font-semibold text-text-primary"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          )}
        >
          <span className="mr-2 font-mono text-num-sm text-text-muted">
            {index + 1}
          </span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/** The phone form: a scrolling strip of chips above the content. */
export function GuideTocChips({ items }: GuideTocProps) {
  const activeId = useActiveSection(items);
  const { t } = useTranslation();

  return (
    <nav aria-label={t("guide.toc")} className="overflow-x-auto lg:hidden">
      <div className="flex min-w-max gap-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={activeId === item.id ? "location" : undefined}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-body transition-colors duration-[120ms] ease-out",
              activeId === item.id
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
