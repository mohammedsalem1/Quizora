import { countLabel, POINTS } from "@/lib/arabic";
import type { Question } from "@/lib/types";
import { Bubble, Button, OPTION_LETTERS } from "./ui";

export function QuestionCard({
  number,
  question,
  editable,
  busy,
  onEdit,
  onDelete,
}: {
  number: number;
  question: Question;
  editable: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-col gap-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex gap-2 font-medium leading-7">
          <span className="text-ink-muted">{number}.</span>
          <span dir="auto">{question.text}</span>
        </h3>
        <span className="shrink-0 text-sm text-ink-muted">
          {countLabel(question.points, POINTS)}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {question.options.map((option, i) => (
          <li key={option.id} className="flex items-center gap-3">
            <Bubble letter={OPTION_LETTERS[i]} filled={option.isCorrect} />
            <span
              dir="auto"
              className={
                option.isCorrect ? "font-medium text-accent-strong" : ""
              }
            >
              {option.text}
            </span>
            {option.isCorrect && (
              <span className="sr-only">(الإجابة الصحيحة)</span>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit} disabled={busy}>
            تعديل
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={busy}>
            حذف
          </Button>
        </div>
      )}
    </article>
  );
}
