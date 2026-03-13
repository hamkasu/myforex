// Malaysia Time = UTC+8. Manual offset avoids Intl.DateTimeFormat timezone
// availability differences across browsers and Node builds.

const MYT_OFFSET_MS = 8 * 3600 * 1000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function pad(n: number) { return n.toString().padStart(2, "0"); }

/** Extract MYT date/time parts from any JS timestamp (ms). */
function myt(ms: number) {
  const d = new Date(ms + MYT_OFFSET_MS);   // shift to MYT, then read via UTC accessors
  const h  = d.getUTCHours();
  return {
    h,
    m:    d.getUTCMinutes(),
    s:    d.getUTCSeconds(),
    day:  d.getUTCDate(),
    mon:  d.getUTCMonth(),      // 0-indexed
    year: d.getUTCFullYear(),
    ampm: h >= 12 ? "PM" : "AM",
    h12:  h % 12 || 12,
  };
}

/** "02:44 PM" */
export function fmtTime(d: Date): string {
  const { h12, m, ampm } = myt(d.getTime());
  return `${pad(h12)}:${pad(m)} ${ampm}`;
}

/** "13 Mar 2026, 02:44 PM" */
export function fmtDateTime(d: Date): string {
  const { h12, m, ampm, day, mon, year } = myt(d.getTime());
  return `${day} ${MONTHS[mon]} ${year}, ${pad(h12)}:${pad(m)} ${ampm}`;
}

/** "13 Mar 2026" */
export function fmtDate(d: Date): string {
  const { day, mon, year } = myt(d.getTime());
  return `${day} ${MONTHS[mon]} ${year}`;
}

/** Unix seconds → "02:44 PM" */
export const fmtUnixTime     = (ts: number) => fmtTime(new Date(ts * 1000));
/** Unix seconds → "13 Mar 2026, 02:44 PM" */
export const fmtUnixDateTime = (ts: number) => fmtDateTime(new Date(ts * 1000));
/** Unix seconds → "13 Mar 2026" */
export const fmtUnixDate     = (ts: number) => fmtDate(new Date(ts * 1000));

// ── lightweight-charts formatters ────────────────────────────────────────────
// Both receive a UTCTimestamp (Unix seconds).

/** Crosshair tooltip label — e.g. "03:00:00 PM" */
export function chartTimeFormatter(time: number): string {
  const { h12, m, s, ampm } = myt(time * 1000);
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;
}

/**
 * X-axis tick labels.
 * lightweight-charts TickMarkType: 0=Year  1=Month  2=DayOfMonth  3=Time  4=TimeWithSeconds
 */
export function chartTickFormatter(time: number, tickMarkType: number): string {
  const { h, m, day, mon, year } = myt(time * 1000);
  const h12  = h % 12 || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  if (tickMarkType === 0) return `${year}`;
  if (tickMarkType === 1) return `${MONTHS[mon]} ${year}`;
  if (tickMarkType === 2) return `${day} ${MONTHS[mon]}`;
  return `${pad(h12)}:${pad(m)} ${ampm}`;   // Time / TimeWithSeconds
}
