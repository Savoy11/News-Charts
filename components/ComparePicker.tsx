"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { A_COLOR, B_COLOR } from "./PriceOverlay";

/** Two inputs that navigate to /compare?a=&b=. Prefilled from whatever is currently compared. */
export default function ComparePicker({ a = "", b = "" }: { a?: string; b?: string }) {
  const router = useRouter();
  const [av, setAv] = useState(a);
  const [bv, setBv] = useState(b);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!av.trim() || !bv.trim()) return;
    router.push(`/compare?a=${encodeURIComponent(av.trim())}&b=${encodeURIComponent(bv.trim())}`);
  }

  function swap() {
    setAv(bv);
    setBv(av);
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-wrap items-center gap-2">
      <Field value={av} onChange={setAv} color={A_COLOR} placeholder="First — ticker or topic" />
      <button
        type="button"
        onClick={swap}
        title="Swap"
        className="rounded-md border border-slate-700 px-2 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200"
      >
        ⇄
      </button>
      <Field value={bv} onChange={setBv} color={B_COLOR} placeholder="Second — ticker or topic" />
      <button
        type="submit"
        disabled={!av.trim() || !bv.trim()}
        className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        Compare
      </button>
    </form>
  );
}

function Field({
  value,
  onChange,
  color,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  color: string;
  placeholder: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 focus-within:border-sky-500">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
      />
    </div>
  );
}
