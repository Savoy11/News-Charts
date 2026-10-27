import type { TimelineEvent } from "./types";

/**
 * When something came out, against the trading day (batch 68, the 2026-10-26 proposal 6).
 *
 * Prices are end of day, so a time matters for one thing: which daily bar a release belongs to.
 * Apple's results 8-Ks all go out at 4:30 pm ET, after the close, and carry that day's date; the
 * day's median move is 0.7%, the next session's 3.7%. Paired by date alone, a 2% move on the
 * release day was captioned with a release published after it (`nearestCatalyst`).
 *
 * The instant is UTC, as EDGAR gives it ("2026-07-30T20:30:28.000Z" for the 8-K its filing page
 * shows as accepted 2026-07-30 16:30:28). New York's clock is read through `Intl`, so daylight
 * saving is the time zone database's, not a rule of ours: 20:30Z in July and 21:30Z in January are
 * both 4:30 pm. The session is 9:30 am to 4 pm, Monday to Friday. Exchange holidays and early
 * closes are not known here: a time on one reads by the clock.
 */

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

export interface Eastern {
  /** New York's calendar day: "2026-07-30" */
  day: string;
  /** its 24-hour clock: "16:30:28" */
  time: string;
  weekday: string;
}

/** An instant as New York's clock reads it, or null for one that is not an instant. */
export function eastern(instant: string): Eastern | null {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  const part: Record<string, string> = {};
  for (const p of EASTERN.formatToParts(new Date(ms))) part[p.type] = p.value;
  return { day: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}:${part.second}`, weekday: part.weekday };
}

export const OPEN = "09:30";
export const CLOSE = "16:00";

export type Session = "before the open" | "during trading" | "after the close" | "markets closed";

export function sessionOf(et: Eastern): Session {
  if (et.weekday === "Sat" || et.weekday === "Sun") return "markets closed";
  if (et.time < `${OPEN}:00`) return "before the open";
  if (et.time < `${CLOSE}:00`) return "during trading";
  return "after the close";
}

/** "4:30 pm" */
function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/**
 * What a row says of its time: "4:30 pm ET, after the close". EDGAR dates a filing accepted after
 * 5:30 pm on the next business day, so a time on another day than the row's says which: Ford's
 * 10-Q dated 2026-07-29 was accepted "Jul 28, 7:29 pm ET, after the close".
 */
export function whenPhrase(ev: Pick<TimelineEvent, "date" | "occurredAt">): string | null {
  const et = ev.occurredAt ? eastern(ev.occurredAt) : null;
  if (!et) return null;
  return `${et.day === ev.date ? "" : `${shortDay(et.day)}, `}${clock(et.time)} ET, ${sessionOf(et)}`;
}

/**
 * Whether an event came out after the session of `day` closed, so cannot have moved that day's bar.
 * Only an event with a time can say so; one without is judged by its date, as before.
 */
export function publishedAfterClose(ev: Pick<TimelineEvent, "occurredAt">, day: string): boolean {
  const et = ev.occurredAt ? eastern(ev.occurredAt) : null;
  return et !== null && `${et.day} ${et.time}` >= `${day} ${CLOSE}:00`;
}
