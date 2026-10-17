-- A refused explanation is a paid call too (NC-149).
--
-- `npm run explain` cached only what it kept. A reply that cited nothing, cited an event it was
-- never shown, or could not be parsed was discarded — and so was the record that it had been paid
-- for. The next run asked again, for the same anomaly over the same content, and paid again; and
-- neither bill appeared in the printed cost or in `cost-report`. One row per refused input stops
-- the repeat and keeps the receipt.
--
-- Keyed like `syntheses`, so a changed input (an edited headline, a new prompt version) is asked
-- afresh — the refusal is about *that* input, not about the anomaly for ever.
CREATE TABLE IF NOT EXISTS synthesis_refusals (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id     bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  window_start   date NOT NULL,
  window_end     date NOT NULL,
  model          text NOT NULL,
  prompt_version smallint NOT NULL,
  input_hash     bytea NOT NULL,
  reason         text NOT NULL,
  input_tokens   integer NOT NULL,
  output_tokens  integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT synthesis_refusals_uq
    UNIQUE (subject_id, kind, window_start, window_end, model, prompt_version, input_hash)
);
