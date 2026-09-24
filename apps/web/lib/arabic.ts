// Arabic counted nouns change form with the number (1, 2, 3–10, 11+).
type NounForms = { one: string; two: string; few: string; many: string };

export function countLabel(n: number, forms: NounForms): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

export const QUESTIONS: NounForms = {
  one: "سؤال واحد",
  two: "سؤالان",
  few: "أسئلة",
  many: "سؤالاً",
};

export const MINUTES: NounForms = {
  one: "دقيقة واحدة",
  two: "دقيقتان",
  few: "دقائق",
  many: "دقيقة",
};

export const POINTS: NounForms = {
  one: "علامة واحدة",
  two: "علامتان",
  few: "علامات",
  many: "علامة",
};

export const ATTEMPTS: NounForms = {
  one: "محاولة واحدة",
  two: "محاولتان",
  few: "محاولات",
  many: "محاولة",
};
