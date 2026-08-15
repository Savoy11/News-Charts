"use client";

/**
 * "Following" — a reader's own list of subjects, kept in this browser only (same rule as prefs and
 * the BYO-model key: nothing about it touches a News Charts server). Each entry remembers how much
 * of the subject the reader had already seen, so the next visit can say "3 new since you were here"
 * without any account or server state.
 */

export interface FollowedSubject {
  href: string;
  kind: "company" | "topic" | "industry";
  label: string;
  /** when they first followed */
  followedAt: string;
  /** event count seen as of their last visit */
  seenCount: number;
  /** latest event date seen ("YYYY-MM-DD") as of their last visit */
  seenLatest: string;
  /** last time they opened the subject */
  lastVisit: string;
}

/** Cheap "has anything changed?" fingerprint, computed server-side from the events already loaded. */
export interface Signature {
  count: number;
  latest: string;
}

const KEY = "news-charts:following:v1";
export const FOLLOW_EVENT = "news-charts:following";

type FollowMap = Record<string, FollowedSubject>;

export function loadFollows(): FollowMap {
  if (typeof window === "undefined") return {};
  try {
    return (JSON.parse(localStorage.getItem(KEY) || "{}") as FollowMap) ?? {};
  } catch {
    return {};
  }
}

function save(map: FollowMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(FOLLOW_EVENT));
  } catch {
    /* storage unavailable — following just won't persist */
  }
}

export function follow(subject: Pick<FollowedSubject, "href" | "kind" | "label">, sig: Signature): void {
  const map = loadFollows();
  const now = new Date().toISOString();
  map[subject.href] = {
    ...subject,
    followedAt: map[subject.href]?.followedAt ?? now,
    seenCount: sig.count,
    seenLatest: sig.latest,
    lastVisit: now,
  };
  save(map);
}

export function unfollow(href: string): void {
  const map = loadFollows();
  delete map[href];
  save(map);
}

/** Mark the subject as caught up to `sig` (called once the reader is looking at it). */
export function markSeen(href: string, sig: Signature): void {
  const map = loadFollows();
  const cur = map[href];
  if (!cur) return;
  map[href] = { ...cur, seenCount: sig.count, seenLatest: sig.latest, lastVisit: new Date().toISOString() };
  save(map);
}

/** How many events are new versus what the reader last saw (0 if nothing, or not followed). */
export function newSince(prev: FollowedSubject | undefined, sig: Signature): number {
  if (!prev) return 0;
  const byCount = Math.max(0, sig.count - prev.seenCount);
  // count can stay flat while an item is replaced/re-dated; treat a newer max date as ≥1 new
  if (byCount === 0 && sig.latest > prev.seenLatest) return 1;
  return byCount;
}

export function listFollows(): FollowedSubject[] {
  return Object.values(loadFollows()).sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}
