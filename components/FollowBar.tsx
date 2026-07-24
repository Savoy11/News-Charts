"use client";

import { useEffect, useState } from "react";
import {
  follow,
  loadFollows,
  markSeen,
  newSince,
  unfollow,
  type FollowedSubject,
  type Signature,
} from "@/lib/follow";

/**
 * Follow toggle for a subject page, plus a "N new since your last visit" badge. On mount it reads
 * what the reader had seen, computes the delta against the current signature, shows it, then marks
 * the subject caught up — so the badge is about the gap since *last* time, and clears once seen.
 */
export default function FollowBar({
  subject,
  signature,
}: {
  subject: Pick<FollowedSubject, "href" | "kind" | "label">;
  signature: Signature;
}) {
  const [following, setFollowing] = useState(false);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    const prev = loadFollows()[subject.href];
    setFollowing(Boolean(prev));
    if (prev) {
      setFresh(newSince(prev, signature));
      markSeen(subject.href, signature); // they're looking now — catch the record up
    }
    // run once per subject; signature is snapshotted server-side
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.href]);

  function toggle() {
    if (following) {
      unfollow(subject.href);
      setFollowing(false);
    } else {
      follow(subject, signature);
      setFollowing(true);
    }
    setFresh(0);
  }

  return (
    <div className="flex items-center gap-2">
      {following && fresh > 0 && (
        <span className="rounded-full border border-sky-700/50 bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
          {fresh} new since your last visit
        </span>
      )}
      <button
        onClick={toggle}
        aria-pressed={following}
        className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
          following
            ? "border-sky-600 bg-sky-600/20 text-sky-300 hover:border-red-700 hover:text-red-300"
            : "border-slate-700 text-slate-300 hover:border-sky-600 hover:text-sky-300"
        }`}
      >
        {following ? "Following ✓" : "Follow"}
      </button>
    </div>
  );
}
