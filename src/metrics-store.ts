import { get, update } from "idb-keyval";
import {
  appendSpans,
  dayKey,
  createMetrics,
  type MetricsData,
  type ReadingSpan,
} from "./metrics";
const KEY = "folio:metrics:v1";
function notify() {
  window.dispatchEvent(new Event("folio-metrics-changed"));
}
export async function loadMetrics(): Promise<MetricsData> {
  let value = await get<MetricsData>(KEY);
  if (!value) {
    await update<MetricsData>(KEY, (old) => old || createMetrics());
    value = await get(KEY);
  }
  return value!;
}
export async function recordSpans(spans: ReadingSpan[]): Promise<void> {
  if (!spans.length) return;
  await update<MetricsData>(KEY, (old) =>
    appendSpans(old || createMetrics(), spans),
  );
  notify();
}
export async function saveMetricsPreferences(
  goalMinutes: number,
  idleSeconds: number,
): Promise<void> {
  if (
    !Number.isFinite(goalMinutes) ||
    goalMinutes < 1 ||
    goalMinutes > 240 ||
    !Number.isFinite(idleSeconds) ||
    idleSeconds < 30 ||
    idleSeconds > 600
  )
    throw new Error("Meta ou pausa inválida.");
  await update<MetricsData>(KEY, (old) => ({
    ...(old || createMetrics()),
    goalMinutes,
    idleSeconds,
  }));
  notify();
}
export async function recordCompletion(book: {
  id: string;
  title: string;
}): Promise<void> {
  const at = Date.now();
  await update<MetricsData>(KEY, (old) => {
    const data = old || createMetrics();
    return data.completions.some((c) => c.bookId === book.id)
      ? data
      : {
          ...data,
          completions: [
            ...data.completions,
            { bookId: book.id, title: book.title, at, day: dayKey(at) },
          ],
        };
  });
  notify();
}
