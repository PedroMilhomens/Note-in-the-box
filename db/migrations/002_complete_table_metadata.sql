ALTER TABLE flashcard_reviews
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE flashcard_reviews
  ADD CONSTRAINT flashcard_reviews_pkey PRIMARY KEY (id);

ALTER TABLE consents
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE consents
  ADD CONSTRAINT consents_pkey PRIMARY KEY (id);

ALTER TABLE audit_log
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
