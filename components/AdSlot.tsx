/**
 * Placeholder ad unit. When the site is approved for Google AdSense, replace
 * the inner div with the AdSense <ins> snippet and load the script in layout.tsx.
 */
export default function AdSlot({ label = "Advertisement" }: { label?: string }) {
  return (
    <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50 text-xs uppercase tracking-widest text-slate-600">
      {label}
    </div>
  );
}
