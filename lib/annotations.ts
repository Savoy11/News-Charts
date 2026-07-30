"use client";

/**
 * Private notes pinned to dates on a subject's timeline.
 *
 * The same privacy rule as follows, prefs and the BYO-model key: held in this browser, never on
 * a server. That is not a limitation to apologise for — it is what makes a trading journal
 * usable here at all. A thesis, an entry price, a reason for selling: none of that should reach
 * a server we run, and because it never does, there is no account to create, nothing to leak
 * and nothing to delete on request.
 *
 * Stored per subject path so notes follow the page they were written on.
 */

export type AnnotationKind = "note" | "entry" | "exit";

export interface Annotation {
  id: string;
  /** YYYY-MM-DD — the date on the timeline this is pinned to */
  date: string;
  kind: AnnotationKind;
  text: string;
  /** when it was written, so a journal reads in the order it was kept */
  createdAt: string;
}

export const ANNOTATIONS_EVENT = "news-charts:annotations";

const keyFor = (path: string) => `news-charts:notes:${path}`;

/** Bounded so a runaway paste cannot fill the origin's storage and break prefs and follows. */
export const MAX_TEXT = 500;
export const MAX_PER_SUBJECT = 200;

function isAnnotation(v: unknown): v is Annotation {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<Annotation>;
  return (
    typeof a.id === "string" &&
    typeof a.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(a.date) &&
    (a.kind === "note" || a.kind === "entry" || a.kind === "exit") &&
    typeof a.text === "string" &&
    typeof a.createdAt === "string"
  );
}

/** Oldest first, so a subject's notes read as a journal rather than a stack. */
export function loadAnnotations(path: string): Annotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(path));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // hand-edited or half-written storage must not take down the page
    return parsed.filter(isAnnotation).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function save(path: string, list: Annotation[]): void {
  try {
    localStorage.setItem(keyFor(path), JSON.stringify(list));
    window.dispatchEvent(new Event(ANNOTATIONS_EVENT));
  } catch {
    /* storage unavailable or full — the note just isn't kept */
  }
}

/** Returns the stored list so a caller can render without a second read. */
export function addAnnotation(
  path: string,
  input: { date: string; kind: AnnotationKind; text: string }
): Annotation[] {
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return loadAnnotations(path);

  const list = loadAnnotations(path);
  if (list.length >= MAX_PER_SUBJECT) return list;

  const next = [
    ...list,
    {
      // crypto.randomUUID is unavailable on insecure origins, so don't depend on it
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date: input.date,
      kind: input.kind,
      text,
      createdAt: new Date().toISOString(),
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
  save(path, next);
  return next;
}

export function removeAnnotation(path: string, id: string): Annotation[] {
  const next = loadAnnotations(path).filter((a) => a.id !== id);
  save(path, next);
  return next;
}

export function clearAnnotations(path: string): void {
  try {
    localStorage.removeItem(keyFor(path));
    window.dispatchEvent(new Event(ANNOTATIONS_EVENT));
  } catch {
    /* nothing to do */
  }
}

/**
 * Annotations as timeline events, so they plot through the existing marker machinery instead of
 * needing a parallel rendering path. They carry no URL — there is nothing to link to, and a
 * private note is not a source.
 */
export function annotationsAsEvents(list: Annotation[]): {
  id: string;
  date: string;
  type: "annotation";
  title: string;
  source: string;
}[] {
  const label: Record<AnnotationKind, string> = {
    note: "Note",
    entry: "Entry",
    exit: "Exit",
  };
  return list.map((a) => ({
    id: `note-${a.id}`,
    date: a.date,
    type: "annotation" as const,
    title: a.text,
    source: `Your ${label[a.kind].toLowerCase()}`,
  }));
}
