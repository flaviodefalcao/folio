import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReadingClock,
  splitSpan,
  type ReadingMode,
  type ReadingSpan,
} from "./metrics";
import { loadMetrics, recordSpans } from "./metrics-store";
import { isAppForeground } from "./native";
const stamp = () => ({ wall: Date.now(), mono: performance.now() });
export function useReadingMetrics(
  book: { id: string; title: string; author: string },
  enabled: boolean,
  mode: ReadingMode,
) {
  const clock = useRef<ReadingClock | null>(null),
    session = useRef(""),
    queue = useRef(Promise.resolve()),
    bookRef = useRef(book),
    condition = useRef({ enabled, mode }),
    docs = useRef(new Map<Document, () => void>());
  const focused = useRef(true);
  bookRef.current = book;
  condition.current = { enabled, mode };
  const [status, setStatus] = useState<
      "paused" | "idle" | "reading" | "listening"
    >("paused"),
    [sessionMs, setSessionMs] = useState(0),
    [saveError, setSaveError] = useState("");
  const enqueue = useCallback((piece: ReturnType<ReadingClock["sample"]>) => {
    if (!piece) return;
    const b = bookRef.current;
    const spans: ReadingSpan[] = splitSpan({
      ...piece,
      sessionId: session.current,
      bookId: b.id,
      title: b.title,
      author: b.author,
    });
    queue.current = queue.current
      .then(() => recordSpans(spans))
      .catch(() =>
        setSaveError(
          "Não foi possível salvar o tempo de leitura. Confira o espaço do aparelho.",
        ),
      );
  }, []);
  const tick = useCallback(() => {
    const c = clock.current;
    if (!c) return;
    const now = stamp();
    enqueue(c.sample(now));
    setStatus(c.status(now));
    setSessionMs(c.totalMs);
  }, [enqueue]);
  const activity = useCallback(() => {
    const c = clock.current;
    if (!c) return;
    const now = stamp();
    enqueue(c.activity(now));
    setStatus(c.status(now));
    setSessionMs(c.totalMs);
  }, [enqueue]);
  const configure = useCallback(() => {
    const c = clock.current;
    if (!c) return;
    const now = stamp();
    const eligible =
      condition.current.enabled &&
      !document.hidden &&
      isAppForeground() &&
      focused.current;
    enqueue(c.configure(now, eligible, condition.current.mode));
    setStatus(c.status(now));
    setSessionMs(c.totalMs);
  }, [enqueue]);
  const attachDocument = useCallback(
    (doc: Document) => {
      if (docs.current.has(doc)) return;
      const events = [
        "pointerdown",
        "touchstart",
        "keydown",
        "wheel",
        "scroll",
      ];
      for (const name of events)
        doc.addEventListener(name, activity, { capture: true, passive: true });
      docs.current.set(doc, () => {
        for (const name of events)
          doc.removeEventListener(name, activity, true);
      });
    },
    [activity],
  );
  useEffect(() => {
    let alive = true;
    loadMetrics()
      .then((data) => {
        if (!alive) return;
        session.current = crypto.randomUUID();
        clock.current = new ReadingClock(stamp(), data.idleSeconds * 1000);
        configure();
      })
      .catch(() => setSaveError("As estatísticas não puderam ser carregadas."));
    const heartbeat = setInterval(tick, 5000);
    const hidden = () => configure();
    const focus = () => {
      focused.current = true;
      configure();
      activity();
    };
    const blur = () => {
      queueMicrotask(() => {
        focused.current = document.hasFocus();
        configure();
      });
    };
    const pageHide = () => {
      const c = clock.current;
      if (c) enqueue(c.configure(stamp(), false, condition.current.mode));
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("folio-app-state", hidden);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    const outerEvents = [
      "pointerdown",
      "touchstart",
      "keydown",
      "wheel",
      "scroll",
    ];
    for (const e of outerEvents)
      window.addEventListener(e, activity, { capture: true, passive: true });
    return () => {
      alive = false;
      clearInterval(heartbeat);
      pageHide();
      clock.current = null;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("folio-app-state", hidden);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      for (const e of outerEvents)
        window.removeEventListener(e, activity, true);
      for (const cleanup of docs.current.values()) cleanup();
      docs.current.clear();
    };
  }, [book.id, activity, configure, enqueue, tick]);
  useEffect(() => {
    configure();
  }, [enabled, mode, configure]);
  const flush = useCallback(async () => {
    tick();
    await queue.current;
  }, [tick]);
  return { status, sessionMs, saveError, activity, attachDocument, flush };
}
