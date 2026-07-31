-- What the search box was asked, and what it decided.
--
-- Search accuracy is the one thing this project cannot currently argue about with evidence.
-- Misses reach `subject_requests`, but only after a page has already decided the query was a
-- subject nobody has ingested — a query that resolved to the *wrong* subject looks like a
-- success there, and a query the parser mangled looks like demand for a subject nobody named.
-- Every accuracy change so far has therefore been judged by trying a phrase by hand.
--
-- This records the decision itself: what was typed, what the parser made of it, which rung of
-- the resolution ladder answered, and whether the thing it landed on had anything to show.
--
-- **Privacy.** A search box is one of the more revealing things a visitor touches, so this
-- stores the query and nothing that could tie it to a person: no IP address, no user agent, no
-- session or cookie identifier, no join key to any other table. Rows are capped at 200
-- characters and deleted after 90 days by the scheduled refresh (`purgeOldResolutions`). What
-- visitors search for is also not something to publish — there is deliberately no page or API
-- that reads this table, only the operator's `npm run search-report`.
CREATE TABLE IF NOT EXISTS search_resolutions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asked_at    timestamptz NOT NULL DEFAULT now(),

  -- what was typed, trimmed and truncated
  query       text NOT NULL,
  -- what `parseSearchPrompt` decided the subject was. Equal to `query` for a plain search; the
  -- gap between the two columns is the parser's blast radius, and is the thing to read first
  -- when a natural-language prompt lands somewhere strange.
  subject     text NOT NULL,
  -- the qualifier and the other side of a relational question, when the prompt carried them
  focus       text,
  influence   text,

  /**
   * Which rung of the ladder answered. Deliberately text with a CHECK rather than an enum: the
   * ladder is the thing being worked on, and a rung added or reordered should be a one-line
   * change here rather than an ALTER TYPE migration.
   *
   *   known_company  — matched a company already in the corpus (ticker, name, or name prefix)
   *   known_subject  — matched a subject slug or a recorded alias
   *   edgar          — not in the corpus; resolved against the SEC ticker index over the network
   *   assumed_topic  — nothing matched, so the typed string was assumed to be a topic
   *   empty          — nothing was typed
   */
  resolved_by text NOT NULL
    CHECK (resolved_by IN ('known_company','known_subject','edgar','assumed_topic','empty')),
  -- 'company' or 'topic' — what the visitor was routed to. Null when nothing was.
  kind        subject_kind,
  -- the ticker or slug routed to, so a wrong answer can be recognised rather than counted
  target      text,

  /**
   * Did the subject routed to actually have events?
   *
   * This is the headline number: routing somewhere is not the same as the visitor seeing
   * something, and the difference between those two is what "accuracy" has to mean here. Null
   * when the question does not apply (nothing was resolved, so nothing was checked).
   */
  has_events  boolean,

  -- how long the ladder took. The EDGAR and Wikipedia rungs reach the network on a visitor's
  -- request, so this is also the read-path latency those rungs cost.
  duration_ms integer
);

-- The report reads a recent window, newest first.
CREATE INDEX IF NOT EXISTS search_resolutions_recent
  ON search_resolutions (asked_at DESC);

-- The miss list: everything that did not land on a subject carrying events.
CREATE INDEX IF NOT EXISTS search_resolutions_misses
  ON search_resolutions (asked_at DESC) WHERE has_events IS NOT TRUE;
