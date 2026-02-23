"use client";

import type { ReactNode } from "react";

interface GuideSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function GuideSection({ id, title, children }: GuideSectionProps) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-4 text-xl font-bold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
