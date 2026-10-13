import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  ReadingClock,
  splitSpan,
  createMetrics,
  appendSpans,
  dayKey,
  dailyTotals,
  streaks,
  summarize,
  periodRange,
  metricsCSV,
} from "../src/metrics.ts";
const t = (n) => ({ wall: 1700000000000 + n, mono: n });
const span = (day, minutes, id = day, bookId = "b") => {
  const start = new Date(day + "T12:00:00").getTime();
  return {
    sessionId: id,
    bookId,
    title: "Livro",
    author: "Autor",
    start,
    end: start + minutes * 60000,
    durationMs: minutes * 60000,
    day,
    hour: 12,
    mode: "read",
  };
};
test("active reading pauses exactly at inactivity limit and never backfills idle time", () => {
  const c = new ReadingClock(t(0), 120000);
  c.configure(t(0), true, "read");
  for (let n = 5000; n <= 180000; n += 5000) c.sample(t(n));
  assert.equal(c.totalMs, 120000);
  assert.equal(c.status(t(180000)), "idle");
  c.activity(t(180000));
  c.sample(t(185000));
  assert.equal(c.totalMs, 125000);
});
test("background, overlays, sleep and clock changes cannot inflate reading time", () => {
  const c = new ReadingClock(t(0));
  c.configure(t(0), true, "read");
  c.configure(t(5000), false, "read");
  c.sample(t(65000));
  assert.equal(c.totalMs, 5000);
  c.configure(t(65000), true, "read");
  c.sample(t(365000));
  assert.equal(c.totalMs, 5000);
  c.activity(t(365000));
  c.sample({ mono: 370000, wall: t(370000).wall + 3600000 });
  assert.equal(c.totalMs, 5000);
});
test("voice is separately identified and foreground-only even after silent idle timeout", () => {
  const c = new ReadingClock(t(0), 30000);
  c.configure(t(0), true, "listen");
  for (let n = 5000; n <= 60000; n += 5000)
    assert.equal(c.sample(t(n)).mode, "listen");
  assert.equal(c.totalMs, 60000);
  c.configure(t(60000), false, "listen");
  c.sample(t(65000));
  assert.equal(c.totalMs, 60000);
});
test("midnight and hour boundaries split real duration without changing the total", () => {
  const start = new Date("2026-10-12T23:59:55").getTime();
  const parts = splitSpan({
    sessionId: "s",
    bookId: "b",
    title: "B",
    author: "A",
    start,
    end: start + 10000,
    durationMs: 10000,
    mode: "read",
  });
  assert.equal(parts.length, 2);
  assert.deepEqual(
    parts.map((p) => [p.day, p.hour, p.durationMs]),
    [
      ["2026-10-12", 23, 5000],
      ["2026-10-13", 0, 5000],
    ],
  );
});
test("contiguous heartbeats compact, pauses stay separate and session IDs are deduplicated", () => {
  let d = createMetrics();
  const a = span("2026-10-12", 1, "s");
  const b = { ...a, start: a.end, end: a.end + 60000 };
  d = appendSpans(d, [a, b]);
  assert.equal(d.spans.length, 1);
  assert.equal(d.spans[0].durationMs, 120000);
  d = appendSpans(d, [{ ...b, start: b.end + 5000, end: b.end + 65000 }]);
  assert.equal(d.spans.length, 2);
  const s = summarize(d, "day", "2026-10-12", "2026-10-12");
  assert.equal(s.sessionCount, 1);
  assert.equal(s.totalMs, 180000);
});
test("streak is kept until today ends, gaps break it, short visits do not count", () => {
  const days = new Map([
    ["2026-10-08", 60000],
    ["2026-10-09", 60000],
    ["2026-10-10", 60000],
    ["2026-10-11", 30000],
  ]);
  assert.deepEqual(streaks(days, "2026-10-11"), {
    current: 3,
    longest: 3,
    todayMet: false,
  });
  assert.equal(streaks(days, "2026-10-12").current, 0);
  days.set("2026-10-11", 60000);
  days.set("2026-10-12", 60000);
  assert.equal(streaks(days, "2026-10-12").current, 5);
});
test("weekly comparisons use the same elapsed calendar days and historical average includes zeros", () => {
  const d = {
    ...createMetrics(new Date("2026-10-01T00:00:00").getTime()),
    spans: [
      span("2026-10-05", 10),
      span("2026-10-06", 10),
      span("2026-10-08", 200),
      span("2026-10-12", 15),
      span("2026-10-13", 15),
    ],
  };
  const s = summarize(d, "week", "2026-10-13", "2026-10-13");
  assert.equal(s.count, 2);
  assert.equal(s.compareDays, 2);
  assert.equal(s.previousMs, 20 * 60000);
  assert.equal(s.comparisonMs, 30 * 60000);
  assert.equal(s.changePercent, 50);
  assert.equal(s.historicalCount, 12);
  assert.equal(s.historicalAverage, (235 * 60000) / 12);
  assert.equal(s.averageDay, 15 * 60000);
});
test("calendar month/year ranges handle leap years and zero comparison has no infinity", () => {
  assert.deepEqual(periodRange("month", "2028-02-18"), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.deepEqual(periodRange("year", "2028-02-18"), {
    start: "2028-01-01",
    end: "2028-12-31",
  });
  const s = summarize(createMetrics(), "month", "2026-10-12", "2026-10-12");
  assert.equal(s.changePercent, null);
  assert.equal(s.totalMs, 0);
  assert.equal(s.historicalAverage, 0);
});
test("daylight saving days use actual elapsed time, not assumed 24-hour days", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {splitSpan} from './src/metrics.ts'; const start=new Date('2026-03-08T01:59:55').getTime();console.log(JSON.stringify(splitSpan({sessionId:'s',bookId:'b',title:'B',author:'A',start,end:start+10000,durationMs:10000,mode:'read'})));`,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, child.stderr);
  const parts = JSON.parse(child.stdout);
  assert.equal(
    parts.reduce((sum, p) => sum + p.durationMs, 0),
    10000,
  );
  assert.deepEqual(
    parts.map((p) => p.hour),
    [1, 3],
  );
});
test("CSV totals expose numeric reading/voice values and completion counts without titles as formulas", () => {
  const d = {
    ...createMetrics(),
    spans: [
      span("2026-10-12", 10),
      { ...span("2026-10-12", 5, "s2"), mode: "listen" },
    ],
    completions: [{ bookId: "b", title: "=evil()", at: 0, day: "2026-10-12" }],
  };
  const csv = metricsCSV(d);
  assert.match(csv, /2026-10-12,15\.000,10\.000,5\.000,2,1,1,20/);
  assert.ok(!csv.includes("evil"));
  assert.equal(dailyTotals(d).get("2026-10-12"), 900000);
});

test("days before activation are unknown rather than zeros in averages and comparisons", () => {
  const d = {
    ...createMetrics(new Date("2026-10-12T12:00:00").getTime()),
    spans: [span("2026-10-12", 20)],
  };
  const s = summarize(d, "month", "2026-10-12", "2026-10-12");
  assert.equal(s.count, 1);
  assert.equal(s.averageDay, 1200000);
  assert.equal(s.compareDays, 0);
  assert.equal(s.historicalCount, 0);
});
