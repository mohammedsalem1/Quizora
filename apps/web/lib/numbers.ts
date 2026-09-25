// Scores like "7.5", "7.25" or "8": up to two decimals, Western digits like the rest of the
// interface.
const POINTS_FORMAT = new Intl.NumberFormat("ar-JO-u-nu-latn", {
  maximumFractionDigits: 2,
});

export const formatPoints = (points: number) => POINTS_FORMAT.format(points);
