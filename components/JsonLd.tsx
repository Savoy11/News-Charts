/**
 * Renders a schema.org JSON-LD block. Server component — the payload is built on the server and
 * emitted inline, never hydrated.
 *
 * The object is ours, but some of its strings are not: names come from EDGAR and Wikipedia, and
 * the official domain from Wikidata, which anyone can edit. `JSON.stringify` does not escape `<`,
 * so a stored `</script>` would end this block and run whatever followed. Escaping `<`, `>` and
 * `&` keeps the JSON identical to a parser and inert to the HTML one (NC-090).
 */
export function jsonLdText(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export default function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
