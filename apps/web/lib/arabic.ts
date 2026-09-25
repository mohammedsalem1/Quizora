// Arabic counted nouns change form with the number: 1, 2, 3–10 (and 103–110…), 11–99 (and
// 111–199…), and 100, 101, 102, 200… Intl.PluralRules knows which group a number is in.
type NounForms = {
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
};

const PLURAL = new Intl.PluralRules("ar");

export function countLabel(n: number, forms: NounForms): string {
  switch (PLURAL.select(n)) {
    case "one":
      return forms.one;
    case "two":
      return forms.two;
    case "few":
      return `${n} ${forms.few}`;
    case "many":
      return `${n} ${forms.many}`;
    default:
      return `${n} ${forms.other}`;
  }
}

export const QUESTIONS: NounForms = {
  one: "سؤال واحد",
  two: "سؤالان",
  few: "أسئلة",
  many: "سؤالاً",
  other: "سؤال",
};

export const MINUTES: NounForms = {
  one: "دقيقة واحدة",
  two: "دقيقتان",
  few: "دقائق",
  many: "دقيقة",
  other: "دقيقة",
};

export const POINTS: NounForms = {
  one: "علامة واحدة",
  two: "علامتان",
  few: "علامات",
  many: "علامة",
  other: "علامة",
};

export const ATTEMPTS: NounForms = {
  one: "محاولة واحدة",
  two: "محاولتان",
  few: "محاولات",
  many: "محاولة",
  other: "محاولة",
};
