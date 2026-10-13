import type { BookRecord } from "./types";
import type { MetricsData } from "./metrics";
export type ReadingProfile = {
  theme: string;
  language: string;
  words: string[];
  reviewed: string[];
};
export function loadProfile(id: string): ReadingProfile {
  try {
    return {
      theme: "Sem tema",
      language: "Não informado",
      words: [],
      reviewed: [],
      ...JSON.parse(localStorage.getItem("folio:profile:" + id) || "{}"),
    };
  } catch {
    return {
      theme: "Sem tema",
      language: "Não informado",
      words: [],
      reviewed: [],
    };
  }
}
export function readingEstimate(book: BookRecord, data: MetricsData) {
  const baseline = book.readingBaseline;
  const ms = data.spans
    .filter(
      (s) =>
        s.bookId === book.id &&
        s.mode === "read" &&
        (!baseline || s.start >= baseline.at),
    )
    .reduce((a, s) => a + s.durationMs, 0);
  const delta = book.progress - (baseline?.progress || 0);
  const totalWords = book.chapters.reduce(
    (a, c) => a + c.text.split(/\s+/).length,
    0,
  );
  if (ms < 60000 || delta <= 0.005 || !baseline) return null;
  const wordsPerMinute = (totalWords * delta) / (ms / 60000);
  const remainingMs = ((1 - book.progress) * ms) / delta;
  const daily = data.spans.filter(
    (s) => s.bookId === book.id && s.mode === "read",
  );
  const days = new Set(daily.map((s) => s.day)).size;
  const averageMs = days
    ? daily.reduce((a, s) => a + s.durationMs, 0) / days
    : 0;
  return {
    wordsPerMinute,
    remainingMs,
    daysRemaining: averageMs ? Math.ceil(remainingMs / averageMs) : null,
  };
}
