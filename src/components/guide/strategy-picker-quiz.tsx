"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
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
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-lg font-semibold text-text-primary">
            {t("guide.quizResult")}
          </h3>
          <p className="text-text-muted">{t("guide.quizResultDesc")}</p>
          <div className="rounded-lg border border-status-info-border bg-status-info-soft p-4">
            <p className="text-xl font-bold text-status-info">
              {t(strategy.nameKey)}
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href={`#${strategy.sectionId}`}
              className="text-sm text-status-info hover:text-status-info"
            >
              {t("dashboard.viewDetails")}
            </a>
            <Link href="/settings">
              <Button size="sm">{t("guide.quizApply")}</Button>
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
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-dim">
            {step + 1} / {questions.length}
          </p>
          {step > 0 && (
            <button
              type="button"
              className="text-xs text-text-subtle hover:text-text-primary"
              onClick={() => setStep(step - 1)}
            >
              {t("guide.quizPrev")}
            </button>
          )}
        </div>
        <h3 className="text-lg font-medium text-text-primary">
          {t(question.key)}
        </h3>
        <div className="space-y-2">
          {question.options.map((option, i) => (
            <button
              key={option.key}
              type="button"
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                answers[step] === i
                  ? "border-status-info-border bg-status-info-soft text-status-info"
                  : "border-border bg-bg-card text-text-muted hover:border-border hover:bg-bg-hover"
              }`}
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
