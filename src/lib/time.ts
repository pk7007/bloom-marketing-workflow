export function localDateTime(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (n: string) => parts.find((p) => p.type === n)?.value;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}
export function zonedToUtc(input: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
    throw new Error("Choose a valid date and time.");
  const target = Date.parse(`${input}:00Z`);
  if (
    !Number.isFinite(target) ||
    new Date(target).toISOString().slice(0, 16) !== input
  )
    throw new Error("Choose a valid date and time.");
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const probe = target + h * 3600000;
    offsets.add(
      Date.parse(`${localDateTime(new Date(probe).toISOString(), zone)}:00Z`) -
        probe,
    );
  }
  const candidates = [...offsets]
    .map((offset) => new Date(target - offset).toISOString())
    .filter((iso) => localDateTime(iso, zone) === input);
  if (candidates.length > 1)
    throw new Error(
      "This local time occurs twice during a clock change. Choose an unambiguous time.",
    );
  if (!candidates.length)
    throw new Error(
      "This local time does not exist in the selected timezone. Choose another time.",
    );
  return candidates[0];
}
