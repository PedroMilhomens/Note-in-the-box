const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RATINGS = new Set(["errei", "dificil", "bom", "facil"]);

export function calculateNextDueAt(rating, previousReview = null, now = new Date()) {
  if (!RATINGS.has(rating)) {
    const error = new TypeError("avaliação de revisão inválida");
    error.code = "ERR_INVALID_RATING";
    throw error;
  }
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
    throw new TypeError("data da revisão inválida");
  }

  if (rating === "errei") {
    return new Date(now.getTime() + 10 * MINUTE_MS);
  }

  const previousInterval = previousReview
    ? new Date(previousReview.nextDueAt).getTime()
      - new Date(previousReview.reviewedAt).getTime()
    : 0;
  const previousDays = Math.max(0, previousInterval / DAY_MS);
  const intervalDays = {
    dificil: Math.max(1, Math.ceil(previousDays * 1.2)),
    bom: Math.max(2, Math.ceil(previousDays * 2)),
    facil: Math.max(4, Math.ceil(previousDays * 3)),
  }[rating];

  return new Date(now.getTime() + intervalDays * DAY_MS);
}
