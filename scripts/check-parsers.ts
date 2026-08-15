import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The deterministic parsers that decide *where an event lands in time*.
 *
 *   npm run check:parsers
 *
 * Every case here comes from a real failure or a real near-miss. A date parser that is wrong
 * does not throw — it plants an event in the Middle Ages, drags a timeline's whole range with
 * it, and leaves a page that looks fine to anyone not reading the axis. That is the failure
 * mode these guard.
 */
import { extractYear } from "../lib/wiki";
import { dropCompanyPrehistory } from "../lib/history";
import { dropImplausiblePress, ABSOLUTE_FLOOR } from "../lib/loc";
import { waybackCouldHave, waybackUrl } from "../lib/wikidata";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const year = (sentence: string, expected: number | null) =>
  check(
    `${JSON.stringify(sentence.slice(0, 62))} → ${expected}`,
    extractYear(sentence) === expected,
    String(extractYear(sentence))
  );

console.log("\nYears that are really years");
year("The company was founded in 1903 in Detroit.", 1903);
year("In 2013, the service launched nationwide.", 2013);
year("Sales grew through the mid-1990s.", 1990);
year("By 1888 the safety bicycle had arrived.", 1888);

console.log("\nNumbers that only look like years");
// This is the bug that scattered Alibaba's early history across 1060 and 1688: a ticker and a
// domain name read as dates, and the timeline stretched back to the Middle Ages.
year("Alibaba Group Holding Limited (SEHK: 1060) reported results.", null);
year("The site 1688.com serves domestic wholesale buyers.", null);
year("Listed as HKG: 1688 on the Hong Kong exchange.", null);
year("Its stock code 1060 is quoted in Hong Kong.", null);
year("The display runs at 1280 x 720 pixels.", null);
year("A 3264 × 1836 sensor shipped in the model.", null);
year("Priced at $1,999 at launch.", null);
year("Recorded in 1080p.", null);
year("The engine is designated PW1500G.", null);
year("A 1200 mAh battery powers it.", null);

console.log("\nMeasurements vs. the preposition 'in'");
// "in" is both an abbreviation for inches and the commonest preposition in English. Masking it
// with a space allowed swallowed the year in "founded in 1903 in Detroit", and the sentence lost
// its place on the timeline with nothing to show it had been dropped.
year("The plant opened in 1957 in Chicago.", 1957);
year("Production began in 1913 in Highland Park.", 1913);
year("A 27in monitor shipped that year.", null);
year("Measuring 27 in. across.", null);
year("The 15 inch model followed.", null);

console.log("\nA real year still wins when noise sits beside it");
year("Founded in 1903, the company later listed as NYSE: 12345.", 1903);
year("The 1280 x 720 panel shipped in 2011.", 2011);

console.log("\nCompany prehistory guard");
{
  const ev = (date: string, type: TimelineEvent["type"] = "history"): TimelineEvent => ({
    id: date + type,
    date,
    type,
    title: `event ${date}`,
    source: "test",
  });

  // A company's history is roughly continuous. A lone event 600 years before everything else
  // is a parser artifact, not a founding date.
  const withArtifact = [ev("1060-01-01"), ev("1903-06-16"), ev("1908-10-01"), ev("2021-05-19")];
  const trimmed = dropCompanyPrehistory(withArtifact);
  check("a lone medieval outlier is dropped", trimmed.length === 3, `${trimmed.length} kept`);
  check("the real founding date survives", trimmed[0]?.date === "1903-06-16", trimmed[0]?.date);

  // The guard must not trim a genuinely old, continuous history.
  const continuous = [ev("1837-01-01"), ev("1903-06-16"), ev("1908-10-01")];
  check(
    "a continuous history is left alone",
    dropCompanyPrehistory(continuous).length === 3,
    `${dropCompanyPrehistory(continuous).length} kept`
  );

  // Only history/citation are considered — a filing carries its own exact date.
  const withFiling = [ev("1060-01-01", "filing"), ev("1903-06-16"), ev("1908-10-01")];
  check(
    "non-history events are never trimmed",
    dropCompanyPrehistory(withFiling).some((e) => e.date === "1060-01-01")
  );

  check("too few events to judge → unchanged", dropCompanyPrehistory([ev("1060-01-01")]).length === 1);
  check("empty input is safe", dropCompanyPrehistory([]).length === 0);
}

console.log("\nImplausible press guard");
{
  const press = (date: string): TimelineEvent => ({
    id: date,
    date,
    type: "press",
    title: `scan ${date}`,
    source: "Chronicling America",
  });

  // OCR is noisy enough that a search for "bicycle" matches garbled text from before it existed.
  const scans = [press("1802-01-01"), press("1888-05-02"), press("1901-03-11")];
  const kept = dropImplausiblePress(scans, 1885);
  check("scans older than the subject are dropped", kept.length === 2, `${kept.length} kept`);
  check("the floor is inclusive", dropImplausiblePress(scans, 1888).length === 2);
  check("a limit caps the result", dropImplausiblePress(scans, 1800, 1).length === 1);
  check("no floor year → nothing survives an impossible bar", dropImplausiblePress(scans, 3000).length === 0);

  /**
   * The floor of last resort, for a subject whose own history we do not know.
   *
   * Two ingest branches passed `0` here, or no floor at all, which filters nothing — so every
   * Internet Archive cataloguing error shipped. Measured live 2026-08-12: a `"Ford Motor"` query
   * returned five 1914–29 sheet-music covers stamped `year: 1770`, plus items dated 1292 and
   * year 1, for a company founded in 1903.
   */
  const junk = [press("0001-01-01"), press("1292-01-01"), press("1770-01-01"), press("1926-06-01")];
  const companyKept = dropImplausiblePress(junk, ABSOLUTE_FLOOR.company);
  check("the company floor drops the archive's mis-catalogued rows", companyKept.length === 1, `${companyKept.length} kept`);
  check("  …and keeps the real one", companyKept[0]?.date === "1926-06-01", companyKept[0]?.date);
  // 1780 is chosen because the oldest surviving US public companies date from that decade, so it
  // is a bound on IMPOSSIBILITY. A tighter one would drop real pre-listing history.
  check("the company floor predates the oldest US public company", ABSOLUTE_FLOOR.company <= 1784);
  // Deliberately a no-op: a topic can legitimately be ancient, and inventing a tighter bound
  // would drop real history to tidy up someone else's cataloguing.
  check("the topic floor claims nothing the archive does not", ABSOLUTE_FLOOR.topic === 1500);
  check("  …so an old topic keeps its old material", dropImplausiblePress([press("1650-01-01")], ABSOLUTE_FLOOR.topic).length === 1);

  /**
   * The Wayback link's honesty rule. Nothing was archived before 1996, so for an earlier event
   * there is no capture to be near — the link was not imprecise, it was a claim about a page that
   * never existed. A 1926 Ford event resolved to a capture from December 1998.
   */
  check("a pre-web event gets no snapshot link", !waybackCouldHave("1926-06-01"));
  check("the epoch itself is offered", waybackCouldHave("1996-01-01"));
  check("a modern event is offered", waybackCouldHave("2019-04-02"));
  check("the link still points at the date asked for", waybackUrl("ford.com", "2019-04-02").includes("/20190402/"), waybackUrl("ford.com", "2019-04-02"));
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
