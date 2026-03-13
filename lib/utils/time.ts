const TZ = "Asia/Kuala_Lumpur";

/** "2:08 PM" */
export const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-MY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });

/** "13 Mar 2026, 2:08 PM" */
export const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-MY", {
    timeZone: TZ,
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

/** "13 Mar 2026" */
export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-MY", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

/** Unix seconds → time string */
export const fmtUnixTime     = (ts: number) => fmtTime(new Date(ts * 1000));
export const fmtUnixDateTime = (ts: number) => fmtDateTime(new Date(ts * 1000));
export const fmtUnixDate     = (ts: number) => fmtDate(new Date(ts * 1000));

/**
 * lightweight-charts localization.timeFormatter
 * Receives a UTC Unix timestamp (seconds) and returns a MYT string.
 */
export function chartTimeFormatter(time: number): string {
  return new Date(time * 1000).toLocaleString("en-MY", {
    timeZone: TZ,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

/**
 * lightweight-charts timeScale.tickMarkFormatter
 * tickMarkType: 0=DayOfMonth 1=Month 2=Year 3=Time 4=TimeWithSeconds
 */
export function chartTickFormatter(time: number, tickMarkType: number): string {
  const d = new Date(time * 1000);
  if (tickMarkType <= 0) // DayOfMonth
    return d.toLocaleDateString("en-MY", { timeZone: TZ, day: "numeric", month: "short" });
  if (tickMarkType === 1) // Month
    return d.toLocaleDateString("en-MY", { timeZone: TZ, month: "short", year: "numeric" });
  if (tickMarkType === 2) // Year
    return d.toLocaleDateString("en-MY", { timeZone: TZ, year: "numeric" });
  // Time / TimeWithSeconds
  return d.toLocaleTimeString("en-MY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}
