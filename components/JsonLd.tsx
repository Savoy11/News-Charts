/**
 * Renders a schema.org JSON-LD block. Server component — the payload is built on the server and
 * emitted inline, never hydrated. `data` is our own object (never user input), so the stringify
 * is safe to inject.
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
