CREATE INDEX IF NOT EXISTS flashcard_reviews_user_card_reviewed_idx
  ON flashcard_reviews (user_id, card_id, reviewed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS flashcard_reviews_user_reviewed_idx
  ON flashcard_reviews (user_id, reviewed_at DESC, card_id);
