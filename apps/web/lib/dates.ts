// Dates travel as ISO strings with a timezone ("...Z"), which the API requires. Teachers pick
// them with <input type="datetime-local">, which works in the browser's local time.

const pad = (n: number) => String(n).padStart(2, "0");

// ISO string -> "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input.
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local value (local time) -> ISO string with an explicit "Z".
export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

// Arabic month names (the Levantine ones used in Jordan, e.g. "تشرين الأول") with Western
// digits: "8 تشرين الأول في 11:07 م". The year is only shown when it isn't this year.
const LOCALE = "ar-JO-u-nu-latn";
const THIS_YEAR = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});
const OTHER_YEAR = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const format =
    date.getFullYear() === new Date().getFullYear() ? THIS_YEAR : OTHER_YEAR;
  return format.format(date);
}
