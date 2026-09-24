import type { ButtonHTMLAttributes, ReactNode } from "react";

// Small shared building blocks. Everything is at least 44px tall so it's easy to tap.

type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong disabled:bg-accent/50",
  secondary:
    "border border-line bg-surface text-ink hover:bg-paper disabled:text-ink-muted",
  danger:
    "border border-danger/30 bg-surface text-danger hover:bg-danger-soft disabled:opacity-60",
  quiet: "text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-60",
};

// Also used on <Link>s that should look like buttons.
export function buttonClass(variant: ButtonVariant = "primary") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant)} ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-paper disabled:text-ink-muted aria-invalid:border-danger";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        hint && <p className="text-sm text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

type AlertTone = "error" | "warning" | "info";

const ALERT_TONES: Record<AlertTone, string> = {
  error: "border-danger/30 bg-danger-soft text-danger",
  warning: "border-warn/30 bg-warn-soft text-warn",
  info: "border-accent/20 bg-accent-soft text-accent-strong",
};

export function Alert({
  tone = "error",
  children,
}: {
  tone?: AlertTone;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm leading-6 ${ALERT_TONES[tone]}`}
    >
      {children}
    </div>
  );
}

// Several messages (e.g. every reason a quiz can't be published) as one alert.
export function ErrorList({ messages }: { messages: string[] | null }) {
  if (!messages || messages.length === 0) return null;
  return (
    <Alert>
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="list-disc space-y-1 ps-5">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

type BadgeTone = "neutral" | "accent" | "solid" | "muted";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper text-ink border border-line",
  accent: "bg-accent-soft text-accent-strong",
  solid: "bg-accent text-white",
  muted: "bg-paper text-ink-muted",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

// The answer-sheet bubble: Quizora's one recurring motif (logo and option markers).
export const OPTION_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

export function Bubble({
  letter,
  filled = false,
  size = "md",
}: {
  letter: string;
  filled?: boolean;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "size-5 text-[11px]" : "size-8 text-sm";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 font-semibold ${dims} ${
        filled
          ? "border-accent bg-accent text-white"
          : "border-ink-muted/40 bg-surface text-ink-muted"
      }`}
    >
      {letter}
    </span>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Quizora">
      <span className="flex gap-1" aria-hidden>
        <Bubble letter="" size="sm" />
        <Bubble letter="" size="sm" filled />
        <Bubble letter="" size="sm" />
      </span>
      <span dir="ltr" className="text-lg font-semibold tracking-tight">
        Quizora
      </span>
    </span>
  );
}
