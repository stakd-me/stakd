"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { TranslationKeys } from "@/i18n";

interface Question {
  key: TranslationKeys;
  options: { key: TranslationKeys; scores: Record<string, number> }[];
}

const questions: Question[] = [
  {
    key: "guide.quizQ1",
    options: [
      { key: "guide.quizQ1A1", scores: { threshold: 3, calendar: 0, percent: 1, risk: 2, dca: 1 } },
      { key: "guide.quizQ1A2", scores: { threshold: 2, calendar: 1, percent: 2, risk: 2, dca: 2 } },
      { key: "guide.quizQ1A3", scores: { threshold: 1, calendar: 3, percent: 2, risk: 1, dca: 2 } },
      { key: "guide.quizQ1A4", scores: { threshold: 0, calendar: 3, percent: 1, risk: 0, dca: 1 } },
    ],
  },
  {
    key: "guide.quizQ2",
    options: [
      { key: "guide.quizQ2A1", scores: { threshold: 1, calendar: 3, percent: 3, risk: 1, dca: 2 } },
      { key: "guide.quizQ2A2", scores: { threshold: 3, calendar: 2, percent: 2, risk: 2, dca: 2 } },
      { key: "guide.quizQ2A3", scores: { threshold: 2, calendar: 1, percent: 1, risk: 3, dca: 3 } },
    ],
  },
  {
    key: "guide.quizQ3",
    options: [
      { key: "guide.quizQ3A1", scores: { threshold: 3, calendar: 2, percent: 0, risk: 0, dca: 0 } },
      { key: "guide.quizQ3A2", scores: { threshold: 3, calendar: 2, percent: 1, risk: 1, dca: 1 } },
      { key: "guide.quizQ3A3", scores: { threshold: 2, calendar: 1, percent: 3, risk: 2, dca: 2 } },
      { key: "guide.quizQ3A4", scores: { threshold: 1, calendar: 1, percent: 3, risk: 3, dca: 3 } },
    ],
  },
  {
    key: "guide.quizQ4",
    options: [
      { key: "guide.quizQ4A1", scores: { threshold: 1, calendar: 3, percent: 2, risk: 0, dca: 2 } },
      { key: "guide.quizQ4A2", scores: { threshold: 3, calendar: 2, percent: 2, risk: 2, dca: 2 } },
      { key: "guide.quizQ4A3", scores: { threshold: 2, calendar: 0, percent: 1, risk: 3, dca: 1 } },
    ],
  },
];

const strategyMap: Record<string, { nameKey: TranslationKeys; sectionId: string }> = {
  threshold: { nameKey: "guide.stratThreshold", sectionId: "strategies" },
  calendar: { nameKey: "guide.stratCalendar", sectionId: "strategies" },
  percent: { nameKey: "guide.stratPercentPortfolio", sectionId: "strategies" },
  risk: { nameKey: "guide.stratRiskParity", sectionId: "strategies" },
  dca: { nameKey: "guide.stratDCA", sectionId: "strategies" },
};

export function StrategyPickerQuiz() {
  const { t } = useTranslation();
  const questionId = useId();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[step] = optionIndex;
    setAnswers(newAnswers);

    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      setShowResult(true);
    }
  };

  const getResult = () => {
    const totals: Record<string, number> = { threshold: 0, calendar: 0, percent: 0, risk: 0, dca: 0 };
    answers.forEach((answerIdx, qIdx) => {
      const option = questions[qIdx]?.options[answerIdx];
      if (option) {
        for (const [key, score] of Object.entries(option.scores)) {
          totals[key] += score;
        }
      }
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
  };

  const reset = () => {
    setStep(0);
    setAnswers([]);
    setShowResult(false);
  };

  if (showResult) {
    const winner = getResult();
    const strategy = strategyMap[winner];

    return (
      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-heading text-text-primary">
            {t("guide.quizResult")}
          </h3>
          <p className="text-body text-text-secondary">{t("guide.quizResultDesc")}</p>
          <div
            className="border border-accent bg-accent-soft p-4"
            role="status"
            aria-live="polite"
          >
            <p className="text-display-sm text-accent">{t(strategy.nameKey)}</p>
          </div>
          <div className="flex gap-3">
            <a
              href={`#${strategy.sectionId}`}
              className="self-center text-body text-accent hover:underline"
            >
              {t("dashboard.viewDetails")}
            </a>
            <Link href="/settings">
              <Button variant="accent" size="sm">{t("guide.quizApply")}</Button>
            </Link>
            <Button size="sm" variant="outline" onClick={reset}>
              {t("guide.quizRetake")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const question = questions[step];

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-meta uppercase text-text-muted">
            {step + 1} / {questions.length}
          </p>
          {step > 0 && (
            <button
              type="button"
              className="text-caption text-text-muted hover:text-text-primary"
              onClick={() => setStep(step - 1)}
            >
              {t("guide.quizPrev")}
            </button>
          )}
        </div>
        <h3 id={questionId} className="text-heading text-text-primary">
          {t(question.key)}
        </h3>
        <div className="space-y-2" role="group" aria-labelledby={questionId}>
          {question.options.map((option, i) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={answers[step] === i}
              className={cn(
                "w-full border px-4 py-3 text-left text-body",
                "transition-colors duration-[120ms] ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
                answers[step] === i
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
              onClick={() => handleSelect(i)}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
