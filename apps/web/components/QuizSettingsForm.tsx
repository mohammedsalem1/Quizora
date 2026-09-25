"use client";

import { useId, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { errorMessagesOf } from "@/lib/api";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/dates";
import type { ClassRef, QuizDetail } from "@/lib/types";
import { Button, ErrorList, Field, inputClass, messageId } from "./ui";

// What POST /teacher/quizzes and PATCH /teacher/quizzes/:id accept.
export type QuizSettingsPayload = {
  title: string;
  description: string | null;
  opensAt: string;
  closesAt: string;
  timeLimitMinutes?: number;
  negativeMarkPercent?: number;
  classIds: string[];
};

type FieldName =
  "title" | "opensAt" | "closesAt" | "timeLimit" | "percent" | "classes";
type Errors = Partial<Record<FieldName, string>>;

// Top-to-bottom order, so a failed submit can focus the first problem.
const FIELD_ORDER: FieldName[] = [
  "title",
  "opensAt",
  "closesAt",
  "timeLimit",
  "percent",
  "classes",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultOpensAt() {
  const d = new Date(Date.now() + DAY_MS);
  d.setHours(8, 0, 0, 0); // tomorrow, 8:00
  return d;
}

// Rendered only in the browser, after the page has loaded the classes: the default dates
// depend on the browser's clock and timezone, which the server doesn't know.
export function QuizSettingsForm({
  classes,
  initial,
  locked = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  classes: ClassRef[];
  initial?: QuizDetail;
  locked?: boolean; // students have started: time limit and negative marking can't change
  submitLabel: string;
  onSubmit: (payload: QuizSettingsPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const formId = useId();
  const fid = (name: string) => `${formId}-${name}`;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [opensAt, setOpensAt] = useState(() =>
    toDateTimeLocal(initial?.opensAt ?? defaultOpensAt().toISOString()),
  );
  const [closesAt, setClosesAt] = useState(() =>
    toDateTimeLocal(
      initial?.closesAt ??
        new Date(defaultOpensAt().getTime() + 7 * DAY_MS).toISOString(),
    ),
  );
  const [timeLimit, setTimeLimit] = useState(
    String(initial?.timeLimitMinutes ?? 20),
  );
  const [negativeOn, setNegativeOn] = useState(
    (initial?.negativeMarkPercent ?? 0) > 0,
  );
  const [percent, setPercent] = useState(
    String(initial?.negativeMarkPercent || 25),
  );
  const [classIds, setClassIds] = useState<string[]>(
    initial?.classes.map((c) => c.id) ?? [],
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  function toggleClass(id: string) {
    setClassIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  function validate(): Errors {
    const found: Errors = {};
    if (!title.trim()) found.title = "اكتب عنواناً للاختبار.";
    if (!opensAt) found.opensAt = "حدّد موعد فتح الاختبار.";
    if (!closesAt) found.closesAt = "حدّد موعد إغلاق الاختبار.";
    else if (opensAt && new Date(closesAt) <= new Date(opensAt)) {
      found.closesAt = "يجب أن يكون موعد الإغلاق بعد موعد الفتح.";
    }
    const minutes = Number(timeLimit);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) {
      found.timeLimit = "اكتب مدة بين 1 و 300 دقيقة.";
    }
    const pct = Number(percent);
    if (negativeOn && (!Number.isInteger(pct) || pct < 1 || pct > 100)) {
      found.percent = "اكتب نسبة بين 1 و 100.";
    }
    if (classIds.length === 0) found.classes = "اختر صفاً واحداً على الأقل.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    // Render the errors first, so the field is announced with its error once it has focus.
    flushSync(() => setErrors(found));
    setServerErrors(null);
    const firstInvalid = FIELD_ORDER.find((name) => found[name]);
    if (firstInvalid) {
      document.getElementById(fid(firstInvalid))?.focus();
      return;
    }

    const payload: QuizSettingsPayload = {
      title: title.trim(),
      description: description.trim() || null,
      opensAt: fromDateTimeLocal(opensAt),
      closesAt: fromDateTimeLocal(closesAt),
      classIds,
    };
    if (!locked) {
      payload.timeLimitMinutes = Number(timeLimit);
      payload.negativeMarkPercent = negativeOn ? Number(percent) : 0;
    }

    setPending(true);
    try {
      await onSubmit(payload);
    } catch (e) {
      setServerErrors(errorMessagesOf(e));
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field label="عنوان الاختبار" htmlFor={fid("title")} error={errors.title}>
        <input
          id={fid("title")}
          dir="auto"
          maxLength={200}
          className={inputClass}
          aria-invalid={!!errors.title}
          aria-describedby={messageId(fid("title"))}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field
        label="وصف قصير (اختياري)"
        htmlFor={fid("description")}
        hint="يظهر للطلاب قبل أن يبدؤوا."
      >
        <textarea
          id={fid("description")}
          dir="auto"
          rows={2}
          maxLength={2000}
          className={inputClass}
          aria-describedby={messageId(fid("description"))}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="يُفتح في" htmlFor={fid("opensAt")} error={errors.opensAt}>
          <input
            id={fid("opensAt")}
            type="datetime-local"
            dir="ltr"
            className={inputClass}
            aria-invalid={!!errors.opensAt}
            aria-describedby={messageId(fid("opensAt"))}
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </Field>
        <Field
          label="يُغلق في"
          htmlFor={fid("closesAt")}
          error={errors.closesAt}
        >
          <input
            id={fid("closesAt")}
            type="datetime-local"
            dir="ltr"
            className={inputClass}
            aria-invalid={!!errors.closesAt}
            aria-describedby={messageId(fid("closesAt"))}
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="مدة الاختبار بالدقائق"
        htmlFor={fid("timeLimit")}
        error={errors.timeLimit}
        hint={
          locked
            ? "لا يمكن تغيير المدة بعد أن بدأ الطلاب."
            : "تبدأ المدة لكل طالب عندما يبدأ الاختبار، ولا تتجاوز موعد الإغلاق."
        }
      >
        <input
          id={fid("timeLimit")}
          type="number"
          inputMode="numeric"
          min={1}
          max={300}
          dir="ltr"
          disabled={locked}
          className={`${inputClass} sm:max-w-40`}
          aria-invalid={!!errors.timeLimit}
          aria-describedby={messageId(fid("timeLimit"))}
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
        />
      </Field>

      <fieldset className="flex flex-col gap-3" disabled={locked}>
        <legend className="mb-1.5 text-sm font-medium">العلامة السالبة</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={negativeOn}
            onChange={(e) => setNegativeOn(e.target.checked)}
          />
          <span>تخصم الإجابة الخاطئة جزءاً من علامة السؤال</span>
        </label>
        {negativeOn && (
          <Field
            label="نسبة الخصم من علامة السؤال (%)"
            htmlFor={fid("percent")}
            error={errors.percent}
            hint="مثال: 25 تعني أن الإجابة الخاطئة على سؤال من 4 علامات تخصم علامة واحدة. السؤال المتروك لا يُخصم منه شيء."
          >
            <input
              id={fid("percent")}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              dir="ltr"
              className={`${inputClass} sm:max-w-40`}
              aria-invalid={!!errors.percent}
              aria-describedby={messageId(fid("percent"))}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Field>
        )}
        {locked && (
          <p className="text-sm text-ink-muted">
            لا يمكن تغيير العلامة السالبة بعد أن بدأ الطلاب.
          </p>
        )}
      </fieldset>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={messageId(fid("classes"))}
      >
        <legend className="mb-1.5 text-sm font-medium">الصفوف</legend>
        <div className="flex flex-wrap gap-2">
          {classes.map((c, i) => {
            const checked = classIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                  checked
                    ? "border-accent bg-accent-soft text-accent-strong"
                    : "border-line bg-surface"
                }`}
              >
                <input
                  id={i === 0 ? fid("classes") : undefined}
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={checked}
                  onChange={() => toggleClass(c.id)}
                />
                <bdi>{c.name}</bdi>
              </label>
            );
          })}
        </div>
        {errors.classes && (
          <p id={messageId(fid("classes"))} className="text-sm text-danger">
            {errors.classes}
          </p>
        )}
      </fieldset>

      <ErrorList messages={serverErrors} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            إلغاء
          </Button>
        )}
      </div>
    </form>
  );
}
