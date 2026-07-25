"use client";

import { useState } from "react";

/**
 * Thumbnail for an event, when the source gave one. Remote images (news social images, Wikipedia
 * CDN, newspaper scans) can 404 or block hotlinking, so a failed load hides the element rather
 * than leaving a broken-image icon. Plain <img> since the hosts are arbitrary and off-domain.
 */
export default function EventThumb({ src, className }: { src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
