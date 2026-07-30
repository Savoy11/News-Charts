import type { TimelineEvent } from "@/lib/types";
import { chainRefOf } from "@/lib/onchain/attribution";

/**
 * The block or transaction an on-chain event came from, shown ahead of the explorer that read it.
 *
 * Order is the point. The chain is the source of the fact; the explorer is how we looked it up,
 * and any other explorer would answer the same. Leading with the explorer's name would credit it
 * with the claim, and quietly make the row only as good as one company's uptime.
 *
 * Renders nothing for every other kind of event — a filing's external id is an accession number,
 * which has no chain to point at.
 */
export default function ChainRef({ ev }: { ev: TimelineEvent }) {
  const ref = chainRefOf(ev);
  if (!ref) return null;
  return (
    <>
      <span className="font-mono text-lime-300/80" title={`Read from ${ref.chain}`}>
        {ref.chain} · {ref.label}
      </span>
      {" · via "}
    </>
  );
}
