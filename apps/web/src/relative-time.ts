/** How long ago a stored timestamp was, in calendar days of the viewer's
 *  time zone: "today", "yesterday", "N days ago", then months and years.
 *  Used for "Trashed …" (and the library's "Edited …"). A future time (clock
 *  skew between devices) reads as "today". */
export function relativeDay(
  iso: string,
  now: Date = new Date(),
): string | undefined {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return undefined;
  // Rounded, so a daylight-saving day (23 or 25 hours) still counts as one.
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth()) -
    (now.getDate() < then.getDate() ? 1 : 0);
  if (months < 1) return `${days} days ago`;
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

/** The exact local date and time, for a tooltip beside a relative time. */
export function exactDateTime(iso: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
