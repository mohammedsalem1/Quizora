"use client";

import { useId, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { errorMessagesOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import {
  Bubble,
  Button,
  ErrorList,
  Field,
  inputClass,
  messageId,
  OPTION_LETTERS,
} from "./ui";

// What POST/PUT /teacher/quizzes/:id/questions accept: the question with all its options.
export type QuestionPayload = {
  text: string;
  points: number;
  options: { text: string; isCorrect: boolean }[];
};

type Errors = { text?: string; points?: string; options?: string[] };

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function QuestionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Question;
  submitLabel: string;
  onSubmit: (payload: QuestionPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const formId = useId();
  const fid = (name: string) => `${formId}-${name}`;

  const [text, setText] = useState(initial?.text ?? "");
  const [points, setPoints] = useState(String(initial?.points ?? 1));
  const [options, setOptions] = useState<string[]>(
    initial?.options.map((o) => o.text) ?? ["", "", "", ""],
  );
  const [correct, setCorrect] = useState<number | null>(() => {
    const i = initial?.options.findIndex((o) => o.isCorrect) ?? -1;
    return i >= 0 ? i : null;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  function setOption(index: number, value: string) {
    setOptions((all) => all.map((o, i) => (i === index ? value : o)));
  }

  function removeOption(index: number) {
    setOptions((all) => all.filter((_, i) => i !== index));
    setCorrect((c) =>
      c === null || c === index ? null : c > index ? c - 1 : c,
    );
  }

  // Returns the problems plus the id of the field to focus first.
  function validate(): { found: Errors; focusId: string | null } {
    const found: Errors = {};
    const invalidIds: string[] = []; // in top-to-bottom order

    if (!text.trim()) {
      found.text = "اكتب نص السؤال.";
      invalidIds.push(fid("text"));
    }
    const pts = Number(points);
    if (!Number.isInteger(pts) || pts < 1 || pts > 100) {
      found.points = "اكتب علامة بين 1 و 100.";
      invalidIds.push(fid("points"));
    }

    const optionErrors: string[] = [];
    const normalised = options.map((o) => o.trim().toLowerCase());
    const firstEmpty = normalised.findIndex((o) => !o);
    if (firstEmpty >= 0) {
      optionErrors.push("املأ كل الخيارات أو احذف الفارغ منها.");
      invalidIds.push(fid(`option-${firstEmpty}`));
    }
    const firstRepeat = normalised.findIndex(
      (o, i) => o && normalised.indexOf(o) !== i,
    );
    if (firstRepeat >= 0) {
      optionErrors.push("يجب أن تكون الخيارات مختلفة عن بعضها.");
      invalidIds.push(fid(`option-${firstRepeat}`));
    }
    if (correct === null) {
      optionErrors.push("اختر الإجابة الصحيحة بالضغط على حرفها.");
      invalidIds.push(fid("correct-0"));
    }
    if (optionErrors.length > 0) found.options = optionErrors;

    return { found, focusId: invalidIds[0] ?? null };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { found, focusId } = validate();
    // Render the errors first, so the field is announced with its error once it has focus.
    flushSync(() => setErrors(found));
    setServerErrors(null);
    if (focusId) {
      document.getElementById(focusId)?.focus();
      return;
    }

    setPending(true);
    try {
      await onSubmit({
        text: text.trim(),
        points: Number(points),
        options: options.map((o, i) => ({
          text: o.trim(),
          isCorrect: i === correct,
        })),
      });
    } catch (e) {
      setServerErrors(errorMessagesOf(e));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border-2 border-accent/30 bg-surface p-3 sm:p-4"
    >
      <Field label="نص السؤال" htmlFor={fid("text")} error={errors.text}>
        <textarea
          id={fid("text")}
          dir="auto"
          rows={3}
          maxLength={2000}
          className={inputClass}
          aria-invalid={!!errors.text}
          aria-describedby={messageId(fid("text"))}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      <Field label="العلامة" htmlFor={fid("points")} error={errors.points}>
        <input
          id={fid("points")}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          dir="ltr"
          className={`${inputClass} max-w-28`}
          aria-invalid={!!errors.points}
          aria-describedby={messageId(fid("points"))}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
      </Field>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={messageId(fid("options"))}
      >
        <legend className="mb-1 text-sm font-medium">الخيارات</legend>
        <p className="mb-1 text-sm text-ink-muted">
          اضغط على حرف الخيار الصحيح لتظليله.
        </p>
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <input
                id={fid(`correct-${i}`)}
                type="radio"
                name={fid("correct")}
                className="sr-only"
                checked={correct === i}
                onChange={() => setCorrect(i)}
                aria-label={`الخيار ${OPTION_LETTERS[i]} هو الإجابة الصحيحة`}
              />
              <Bubble letter={OPTION_LETTERS[i]} filled={correct === i} />
            </label>
            <input
              id={fid(`option-${i}`)}
              dir="auto"
              maxLength={500}
              aria-label={`نص الخيار ${OPTION_LETTERS[i]}`}
              aria-invalid={!!errors.options && !option.trim()}
              className={`${inputClass} min-w-0 flex-1`}
              value={option}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {options.length > MIN_OPTIONS && (
              <Button
                variant="quiet"
                size="compact"
                className="shrink-0"
                onClick={() => removeOption(i)}
                aria-label={`حذف الخيار ${OPTION_LETTERS[i]}`}
              >
                حذف
              </Button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <Button
            variant="quiet"
            className="self-start"
            onClick={() => setOptions((all) => [...all, ""])}
          >
            إضافة خيار
          </Button>
        )}
        {errors.options && (
          <ul
            id={messageId(fid("options"))}
            className="flex flex-col gap-1 text-sm text-danger"
          >
            {errors.options.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </fieldset>

      <ErrorList messages={serverErrors} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
