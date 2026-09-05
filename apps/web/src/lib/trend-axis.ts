const dayMilliseconds = 86_400_000;

/** Keep daily data intact; only reduce calendar labels for longer ranges. */
export function trendAxisLabels(dates: readonly string[]) {
  const first = dates[0];
  const last = dates.at(-1);
  const span =
    first && last
      ? Math.round((Date.parse(last) - Date.parse(first)) / dayMilliseconds) + 1
      : 0;
  const unit = span <= 90 ? 'day' : span <= 730 ? 'month' : 'year';
  const firstYear = Number(first?.slice(0, 4) ?? 0);
  const firstMonth = firstYear * 12 + Number(first?.slice(5, 7) ?? 1) - 1;
  const lastMonth =
    Number(last?.slice(0, 4) ?? 0) * 12 + Number(last?.slice(5, 7) ?? 1) - 1;
  const step =
    unit === 'day'
      ? Math.max(1, Math.ceil((span - 1) / 7))
      : unit === 'month'
        ? Math.max(1, Math.ceil((lastMonth - firstMonth) / 7))
        : Math.max(1, Math.ceil((Number(last?.slice(0, 4) ?? 0) - firstYear) / 7));

  return {
    interval: (index: number, date: string): boolean => {
      if (index === 0) return true;
      if (unit === 'day') return index % step === 0 || index === dates.length - 1;
      const year = Number(date.slice(0, 4));
      if (unit === 'year') {
        return date.slice(5) === '01-01' && (year - firstYear) % step === 0;
      }
      const month = year * 12 + Number(date.slice(5, 7)) - 1;
      return date.slice(8) === '01' && (month - firstMonth) % step === 0;
    },
    formatter: (date: string): string => {
      if (unit === 'year') return `${date.slice(0, 4)}年`;
      if (unit === 'month') return date.slice(0, 7);
      return first?.slice(0, 4) !== last?.slice(0, 4) ? date : date.slice(5);
    },
  };
}
