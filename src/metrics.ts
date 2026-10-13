export type ReadingMode = "read" | "listen";
export type Period = "day" | "week" | "month" | "year";
export type ReadingSpan = {
  sessionId: string;
  bookId: string;
  title: string;
  author: string;
  start: number;
  end: number;
  durationMs: number;
  day: string;
  hour: number;
  mode: ReadingMode;
};
export type Completion = {
  bookId: string;
  title: string;
  at: number;
  day: string;
};
export type MetricsData = {
  version: 1;
  createdAt: number;
  firstDay: string;
  goalMinutes: number;
  idleSeconds: number;
  spans: ReadingSpan[];
  completions: Completion[];
};
export type ClockSample = { wall: number; mono: number };
export function dayKey(date: number | Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dateOf(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key: string, n: number): string {
  const d = dateOf(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}
export function createMetrics(now = Date.now()): MetricsData {
  return {
    version: 1,
    createdAt: now,
    firstDay: dayKey(now),
    goalMinutes: 20,
    idleSeconds: 120,
    spans: [],
    completions: [],
  };
}
export function formatTime(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;
}

/** Counts awake, foreground time with monotonic elapsed time. Sleep/clock jumps never become reading. */
export class ReadingClock {
  private previous: ClockSample;
  private lastActivity: number;
  private enabled = false;
  private mode: ReadingMode = "read";
  private accumulated = 0;
  private idleMs: number;
  constructor(now: ClockSample, idleMs = 120000) {
    this.idleMs = idleMs;
    this.previous = now;
    this.lastActivity = now.mono;
  }
  sample(now: ClockSample): {
    start: number;
    end: number;
    durationMs: number;
    mode: ReadingMode;
  } | null {
    const prev = this.previous;
    this.previous = now;
    const delta = now.mono - prev.mono,
      wallDelta = now.wall - prev.wall;
    if (
      !this.enabled ||
      delta <= 0 ||
      delta > 10000 ||
      Math.abs(wallDelta - delta) > 2000
    )
      return null;
    const expiry =
      this.mode === "listen" ? Infinity : this.lastActivity + this.idleMs;
    const durationMs = Math.max(0, Math.min(delta, expiry - prev.mono));
    if (!durationMs) return null;
    this.accumulated += durationMs;
    return {
      start: prev.wall,
      end: prev.wall + durationMs,
      durationMs,
      mode: this.mode,
    };
  }
  configure(now: ClockSample, enabled: boolean, mode: ReadingMode) {
    const span = this.sample(now);
    if (enabled && (!this.enabled || mode !== this.mode))
      this.lastActivity = now.mono;
    this.enabled = enabled;
    this.mode = mode;
    return span;
  }
  activity(now: ClockSample) {
    const span = this.sample(now);
    this.lastActivity = now.mono;
    return span;
  }
  status(now: ClockSample): "paused" | "idle" | "reading" | "listening" {
    return !this.enabled
      ? "paused"
      : this.mode === "listen"
        ? "listening"
        : now.mono >= this.lastActivity + this.idleMs
          ? "idle"
          : "reading";
  }
  get totalMs() {
    return this.accumulated;
  }
}
export function splitSpan(
  span: Omit<ReadingSpan, "day" | "hour">,
): ReadingSpan[] {
  if (
    !Number.isFinite(span.start) ||
    !Number.isFinite(span.end) ||
    span.end <= span.start ||
    !Number.isFinite(span.durationMs) ||
    span.durationMs <= 0
  )
    return [];
  const result: ReadingSpan[] = [];
  let cursor = span.start;
  while (cursor < span.end) {
    const date = new Date(cursor);
    const boundary = new Date(date);
    boundary.setMinutes(60, 0, 0);
    const end = Math.min(span.end, Math.max(cursor + 1, boundary.getTime()));
    result.push({
      ...span,
      start: cursor,
      end,
      durationMs: (span.durationMs * (end - cursor)) / (span.end - span.start),
      day: dayKey(cursor),
      hour: date.getHours(),
    });
    cursor = end;
  }
  return result;
}
export function appendSpans(
  data: MetricsData,
  spans: ReadingSpan[],
): MetricsData {
  const list = data.spans.slice();
  for (const span of spans) {
    if (span.durationMs <= 0 || span.end <= span.start) continue;
    const last = list[list.length - 1];
    if (
      last &&
      last.sessionId === span.sessionId &&
      last.bookId === span.bookId &&
      last.day === span.day &&
      last.hour === span.hour &&
      last.mode === span.mode &&
      Math.abs(last.end - span.start) < 1
    ) {
      list[list.length - 1] = {
        ...last,
        end: span.end,
        durationMs: last.durationMs + span.durationMs,
      };
    } else list.push(span);
  }
  return { ...data, spans: list };
}
export function dailyTotals(data: MetricsData): Map<string, number> {
  const days = new Map<string, number>();
  for (const s of data.spans)
    days.set(s.day, (days.get(s.day) || 0) + s.durationMs);
  return days;
}
export function streaks(
  days: Map<string, number>,
  today: string,
  minimumMs = 60000,
) {
  const qualifying = [...days]
    .filter(([d, ms]) => d <= today && ms >= minimumMs)
    .map(([d]) => d)
    .sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const d of qualifying) {
    run = previous && daysBetween(previous, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d;
  }
  let end = (days.get(today) || 0) >= minimumMs ? today : addDays(today, -1),
    current = 0;
  while ((days.get(end) || 0) >= minimumMs) {
    current++;
    end = addDays(end, -1);
  }
  return { current, longest, todayMet: (days.get(today) || 0) >= minimumMs };
}
export function periodRange(period: Period, anchor: string) {
  const d = dateOf(anchor);
  if (period === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === "month") d.setDate(1);
  if (period === "year") {
    d.setMonth(0, 1);
  }
  const start = dayKey(d);
  const end = new Date(d);
  if (period === "day") end.setDate(end.getDate() + 1);
  if (period === "week") end.setDate(end.getDate() + 7);
  if (period === "month") end.setMonth(end.getMonth() + 1);
  if (period === "year") end.setFullYear(end.getFullYear() + 1);
  return { start, end: addDays(dayKey(end), -1) };
}
export function movePeriod(period: Period, anchor: string, delta: number) {
  const { start } = periodRange(period, anchor);
  const d = dateOf(start);
  if (period === "day") d.setDate(d.getDate() + delta);
  if (period === "week") d.setDate(d.getDate() + 7 * delta);
  if (period === "month") d.setMonth(d.getMonth() + delta);
  if (period === "year") d.setFullYear(d.getFullYear() + delta);
  return dayKey(d);
}
export function summarize(
  data: MetricsData,
  period: Period,
  anchor: string,
  today = dayKey(Date.now()),
) {
  const range = periodRange(period, anchor),
    end = range.end < today ? range.end : today;
  const days = dailyTotals(data),
    count = Math.max(
      0,
      daysBetween(
        range.start > data.firstDay ? range.start : data.firstDay,
        end,
      ) + 1,
    );
  const spans = data.spans.filter((s) => s.day >= range.start && s.day <= end);
  const totalMs = spans.reduce((sum, s) => sum + s.durationMs, 0),
    listenMs = spans
      .filter((s) => s.mode === "listen")
      .reduce((sum, s) => sum + s.durationMs, 0);
  const sessionIds = new Set(spans.map((s) => s.sessionId));
  const completionCount = data.completions.filter(
    (c) => c.day >= range.start && c.day <= end,
  ).length;
  const readDays = Array.from({ length: count }, (_, i) =>
    addDays(range.start > data.firstDay ? range.start : data.firstDay, i),
  );
  const activeDays = readDays.filter((d) => (days.get(d) || 0) >= 60000).length;
  const previous = periodRange(period, movePeriod(period, anchor, -1));
  const elapsedDays = Math.max(0, daysBetween(range.start, end) + 1);
  const compareOffset = Math.max(
    0,
    daysBetween(previous.start, data.firstDay),
    daysBetween(range.start, data.firstDay),
  );
  const compareDays = Math.max(
    0,
    Math.min(elapsedDays, daysBetween(previous.start, previous.end) + 1) -
      compareOffset,
  );
  const comparisonCurrentStart = addDays(range.start, compareOffset),
    comparisonPreviousStart = addDays(previous.start, compareOffset);
  const prefixTotal = (start: string) => {
    let ms = 0;
    for (let i = 0; i < compareDays; i++)
      ms += days.get(addDays(start, i)) || 0;
    return ms;
  };
  const previousMs = prefixTotal(comparisonPreviousStart),
    comparisonMs = prefixTotal(comparisonCurrentStart),
    changePercent =
      previousMs > 0 ? ((comparisonMs - previousMs) / previousMs) * 100 : null;
  const historicalStart =
      data.createdAt === dateOf(data.firstDay).getTime()
        ? data.firstDay
        : addDays(data.firstDay, 1),
    historicalEnd = addDays(today, -1),
    historicalCount = Math.max(
      0,
      daysBetween(historicalStart, historicalEnd) + 1,
    );
  let historicalMs = 0;
  for (const [day, ms] of days)
    if (day >= historicalStart && day <= historicalEnd) historicalMs += ms;
  const historicalAverage = historicalCount
    ? historicalMs / historicalCount
    : 0;
  const books = new Map<
    string,
    {
      id: string;
      title: string;
      author: string;
      ms: number;
      sessions: Set<string>;
    }
  >();
  for (const s of spans) {
    const b = books.get(s.bookId) || {
      id: s.bookId,
      title: s.title,
      author: s.author,
      ms: 0,
      sessions: new Set<string>(),
    };
    b.ms += s.durationMs;
    b.sessions.add(s.sessionId);
    books.set(s.bookId, b);
  }
  const sessionMap = new Map<
    string,
    { id: string; title: string; start: number; ms: number }
  >();
  for (const s of spans) {
    const v = sessionMap.get(s.sessionId) || {
      id: s.sessionId,
      title: s.title,
      start: s.start,
      ms: 0,
    };
    v.start = Math.min(v.start, s.start);
    v.ms += s.durationMs;
    sessionMap.set(s.sessionId, v);
  }
  const buckets: { key: string; label: string; ms: number }[] = [];
  if (period === "day")
    for (let h = 0; h < 24; h++)
      buckets.push({
        key: String(h),
        label: `${String(h).padStart(2, "0")}h`,
        ms: spans
          .filter((s) => s.hour === h)
          .reduce((sum, s) => sum + s.durationMs, 0),
      });
  else if (period === "year")
    for (let m = 0; m < 12; m++) {
      const month =
        range.start.slice(0, 4) + "-" + String(m + 1).padStart(2, "0");
      buckets.push({
        key: month,
        label: new Date(Number(range.start.slice(0, 4)), m, 1)
          .toLocaleDateString("pt-BR", { month: "short" })
          .replace(".", ""),
        ms: spans
          .filter((s) => s.day.startsWith(month))
          .reduce((sum, s) => sum + s.durationMs, 0),
      });
    }
  else
    for (let i = 0; i < daysBetween(range.start, range.end) + 1; i++) {
      const key = addDays(range.start, i);
      buckets.push({
        key,
        label:
          period === "week"
            ? dateOf(key)
                .toLocaleDateString("pt-BR", { weekday: "short" })
                .replace(".", "")
            : String(dateOf(key).getDate()),
        ms: key <= today ? days.get(key) || 0 : 0,
      });
    }
  let bestDay: { day: string; ms: number } | null = null;
  for (const [day, ms] of days)
    if (day >= range.start && day <= end && (!bestDay || ms > bestDay.ms))
      bestDay = { day, ms };
  const times = ["Madrugada", "Manhã", "Tarde", "Noite"].map((label, i) => ({
    label,
    ms: spans
      .filter((s) => Math.floor(s.hour / 6) === i)
      .reduce((sum, s) => sum + s.durationMs, 0),
  }));
  return {
    range,
    end,
    count,
    totalMs,
    readMs: totalMs - listenMs,
    listenMs,
    sessionCount: sessionIds.size,
    averageSession: sessionIds.size ? totalMs / sessionIds.size : 0,
    averageDay: count ? totalMs / count : 0,
    activeDays,
    goalDays: readDays.filter(
      (d) => (days.get(d) || 0) >= data.goalMinutes * 60000,
    ).length,
    completionCount,
    books: [...books.values()].sort((a, b) => b.ms - a.ms),
    sessions: [...sessionMap.values()].sort((a, b) => b.start - a.start),
    buckets,
    bestDay,
    times,
    previousMs,
    comparisonMs,
    compareDays,
    comparisonCurrentStart,
    comparisonPreviousStart,
    changePercent,
    historicalAverage,
    historicalCount,
    days,
    streak: streaks(days, today),
    goalStreak: streaks(days, today, data.goalMinutes * 60000),
  };
}
export function metricsCSV(data: MetricsData): string {
  const days = dailyTotals(data);
  const rows = [
    "data,minutos_totais,minutos_leitura,minutos_voz,sessoes,livros,concluidos,meta_minutos",
  ];
  for (const day of [
    ...new Set([...days.keys(), ...data.completions.map((c) => c.day)]),
  ].sort()) {
    const s = data.spans.filter((s) => s.day === day),
      read = s
        .filter((s) => s.mode === "read")
        .reduce((a, v) => a + v.durationMs, 0),
      listen = s
        .filter((s) => s.mode === "listen")
        .reduce((a, v) => a + v.durationMs, 0);
    rows.push(
      [
        day,
        ((days.get(day) || 0) / 60000).toFixed(3),
        (read / 60000).toFixed(3),
        (listen / 60000).toFixed(3),
        new Set(s.map((v) => v.sessionId)).size,
        new Set(s.map((v) => v.bookId)).size,
        data.completions.filter((v) => v.day === day).length,
        data.goalMinutes,
      ].join(","),
    );
  }
  return "\ufeff" + rows.join("\r\n");
}
