import { useRef } from "react";
import { countLabel, POINTS } from "@/lib/arabic";
import type { AttemptQuestion as Question } from "@/lib/types";
import type { SaveState } from "@/lib/useAnswerSync";
import { Bubble, Button, OPTION_LETTERS } from "./ui";

// One question while taking a quiz: native radio buttons (so the keyboard and screen readers
// work as expected), drawn as answer-sheet bubbles. Each tap is saved straight away.
export function AttemptQuestion({
  question,
  number,
  choice,
  saveState,
  error,
  disabled,
  onChoose,
}: {
  question: Question;
  number: number;
  choice: string | null;
  saveState: SaveState | undefined;
  error: string | undefined;
  disabled: boolean;
  onChoose: (optionId: string | null) => void;
}) {
  const options = useRef<HTMLDivElement>(null);
  const textId = `question-${question.id}`;

  return (
    <section
      aria-labelledby={textId}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-3 text-sm text-ink-muted">
        <span className="font-medium text-ink">السؤال {number}</span>
        <span>{countLabel(question.points, POINTS)}</span>
      </div>
      <p
        id={textId}
        dir="auto"
        className="text-lg leading-8 whitespace-pre-line"
      >
        {question.text}
      </p>

      <div
        ref={options}
        role="radiogroup"
        aria-labelledby={textId}
        className="flex flex-col gap-2"
      >
        {question.options.map((option, i) => {
          const checked = choice === option.id;
          return (
            <label
              key={option.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-paper active:bg-line/40 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-60"
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={checked}
                disabled={disabled}
                onChange={() => onChoose(option.id)}
                className="sr-only"
              />
              <Bubble letter={OPTION_LETTERS[i] ?? ""} filled={checked} />
              {/* The bubble is decorative; screen readers still need the letter, since an
                  option can refer to others (e.g. "أ و ب معاً"). */}
              <span className="sr-only">{OPTION_LETTERS[i]}. </span>
              <span dir="auto" className="leading-7">
                {option.text}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : saveState === "retrying" ? (
            <span className="text-warn">
              لم نتأكد من حفظ الإجابة. نعيد المحاولة…
            </span>
          ) : saveState === "saving" ? (
            <span className="text-ink-muted">جارٍ الحفظ…</span>
          ) : null}
        </p>
        {choice !== null && !disabled && (
          <Button
            variant="quiet"
            size="compact"
            className="shrink-0 whitespace-nowrap"
            onClick={() => {
              onChoose(null);
              // This button disappears once the answer is cleared: keep focus on the question.
              options.current?.querySelector("input")?.focus();
            }}
          >
            مسح الإجابة
          </Button>
        )}
      </div>
    </section>
  );
}
