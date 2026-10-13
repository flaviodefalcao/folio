import { useEffect, useMemo, useRef, useState } from "react";
import ePub, { EpubCFI } from "epubjs";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type Contents from "epubjs/types/contents";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  Bookmark,
  Highlighter,
  MessageCircle,
  Type,
  X,
  Send,
  Settings,
  Volume2,
  VolumeX,
  Download,
  Maximize,
  Minimize,
  Trash2,
  BookOpen,
  Quote,
  ExternalLink,
} from "lucide-react";
import type {
  BookRecord,
  ReaderPrefs,
  Settings as AppSettings,
  Annotation,
  Message,
} from "./types";
import { retrievePassages, searchBook } from "./retrieval";
import { openExternal } from "./App";
import { useReadingMetrics } from "./useReadingMetrics";
import { formatTime } from "./metrics";
import { audioChapters, audioTextRange } from "./audio";
import { loadMetrics } from "./metrics-store";
import { readingEstimate } from "./reading-profile";
import type { Chapter } from "./types";
import AudioPlayer from "./AudioPlayer";
import { resolveTocLocation } from "./reader-navigation";
const initialPrefs: ReaderPrefs = {
  theme: "paper",
  fontSize: 20,
  fontFamily: "Georgia",
  lineHeight: 1.7,
  width: 760,
  flow: "paginated",
};
const colors = {
  paper: { bg: "#f7f8fa", fg: "#17212b" },
  sepia: { bg: "#f4e9d5", fg: "#4a3e2c" },
  night: { bg: "#101113", fg: "#f5f6f8" },
};
type Panel = "toc" | "search" | "notes" | "chat" | "appearance" | null;
export default function Reader({
  book,
  appTheme,
  onUpdate,
  onClose,
  onSettings,
  settings,
  settingsModal,
}: {
  book: BookRecord;
  appTheme: "light" | "dark";
  onUpdate: (b: BookRecord) => Promise<void>;
  onClose: () => void;
  onSettings: () => void;
  settings: AppSettings;
  settingsModal?: React.ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null),
    epub = useRef<Book | null>(null),
    rendition = useRef<Rendition | null>(null),
    current = useRef(book),
    navigationTarget = useRef<string | null>(null),
    audioNavigation = useRef(0);
  const [panel, setPanel] = useState<Panel>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [prefs, setPrefs] = useState({
      ...initialPrefs,
      ...book.prefs,
      theme: appTheme === "dark" ? ("night" as const) : ("paper" as const),
    });
  useEffect(() => {
    setPrefs((previous) => ({
      ...previous,
      theme: appTheme === "dark" ? "night" : "paper",
    }));
  }, [appTheme]);
  const [chapter, setChapter] = useState(""),
    [href, setHref] = useState(""),
    [currentTocHref, setCurrentTocHref] = useState(""),
    [cfi, setCfi] = useState(book.cfi || ""),
    [progress, setProgress] = useState(book.progress),
    [page, setPage] = useState("");
  const [selection, setSelection] = useState<{
      text: string;
      cfi: string;
    } | null>(null),
    [note, setNote] = useState(""),
    [find, setFind] = useState(""),
    [question, setQuestion] = useState(""),
    [chatBusy, setChatBusy] = useState(false),
    [messages, setMessages] = useState<Message[]>(book.messages),
    [speaking, setSpeaking] = useState(false);
  if (book.readingBaseline && !current.current.readingBaseline)
    current.current = {
      ...current.current,
      readingBaseline: book.readingBaseline,
    };
  const chatEnd = useRef<HTMLDivElement>(null),
    progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    prefsRef = useRef(prefs),
    saveQueue = useRef(Promise.resolve());

  const [immersive, setImmersive] = useState(
      () => localStorage.getItem("folio:immersive") === "true",
    ),
    [readerControls, setReaderControls] = useState(false);
  const immersiveRef = useRef(immersive);
  immersiveRef.current = immersive;
  function immersiveMode(enabled: boolean) {
    setImmersive(enabled);
    setReaderControls(false);
    setPanel(null);
    if (!window.folio?.setImmersive) {
      if (enabled)
        void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement)
        void document.exitFullscreen?.().catch(() => {});
    }
  }
  useEffect(() => {
    localStorage.setItem("folio:immersive", String(immersive));
    void window.folio
      ?.setImmersive?.(immersive)
      .catch((e) => setError(e.message));
  }, [immersive]);
  useEffect(
    () => () => {
      void window.folio?.setImmersive?.(false);
      if (document.fullscreenElement)
        void document.exitFullscreen?.().catch(() => {});
    },
    [],
  );
  const [audioSections, setAudioSections] = useState<Chapter[]>([]);
  const [personalPace, setPersonalPace] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void audioChapters(book)
      .then((items) => {
        if (live) setAudioSections(items);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [book.id]);
  useEffect(() => {
    let live = true;
    void loadMetrics().then((data) => {
      const pace = readingEstimate({ ...book, progress }, data);
      if (live) setPersonalPace(pace?.wordsPerMinute || null);
    });
    return () => {
      live = false;
    };
  }, [book.id, Math.floor(progress * 100)]);
  const activeAudioSection =
    audioSections.find((c) => c.href === currentTocHref) ||
    audioSections.find((c) => c.href.split("#")[0] === href);
  const chapterMinutes = (() => {
    if (!activeAudioSection) return null;
    let text = activeAudioSection.text;
    try {
      const range = rendition.current?.getRange(cfi);
      const needle = range?.startContainer.textContent
        ?.slice(range.startOffset, range.startOffset + 45)
        .replace(/\s+/g, " ")
        .trim();
      const at = needle ? text.indexOf(needle) : -1;
      if (at >= 0) text = text.slice(at);
    } catch {}
    return Math.max(
      1,
      Math.ceil(text.split(/\s+/).length / (personalPace || 200)),
    );
  })();
  const readingMetrics = useReadingMetrics(
    book,
    ready && (speaking || (panel === null && !settingsModal && !selection)),
    speaking ? "listen" : "read",
  );
  function persist(patch: Partial<BookRecord>) {
    current.current = { ...current.current, ...patch };
    const snapshot = current.current;
    saveQueue.current = saveQueue.current
      .then(() => onUpdate(snapshot))
      .catch((e) => setError(`Não foi possível salvar: ${e.message}`));
    return saveQueue.current;
  }
  function theme(r: Rendition, p: ReaderPrefs) {
    r.themes.default({
      body: {
        color: colors[p.theme].fg,
        background: colors[p.theme].bg,
        "font-family": `${p.fontFamily}, serif`,
        "font-size": `${p.fontSize}px`,
        "line-height": `${p.lineHeight} !important`,
      },
      p: { "line-height": `${p.lineHeight} !important` },
      "h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th":{color:`${colors[p.theme].fg} !important`,"background-color":"transparent !important"},
      a: { color: p.theme === "night" ? "#c8d49f" : "#586642" },
    });
    r.themes.fontSize(`${p.fontSize}px`);
    r.themes.font(p.fontFamily);
    r.themes.override("color", colors[p.theme].fg, true);
    r.themes.override("background", colors[p.theme].bg, true);
  }
  useEffect(() => {
    let live = true,
      resizeReady = false;
    const b = ePub();
    epub.current = b;
    async function start() {
      try {
        await b.open(book.data.slice(0));
        await b.ready;
        if (!live || !container.current) return;
        const r = b.renderTo(container.current, {
          width: "100%",
          height: "100%",
          flow: prefsRef.current.flow,
          spread: "none",
          allowScriptedContent: false,
        });
        rendition.current = r;
        theme(r, prefsRef.current);
        r.on(
          "relocated",
          (loc: {
            start: {
              cfi: string;
              href: string;
              percentage: number;
              displayed: { page: number; total: number };
            };
            end?: { cfi: string };
            atEnd: boolean;
          }) => {
            if (!live) return;
            const l = loc.start;
            setCfi(l.cfi);
            setHref(l.href);
            let location: Range | undefined, endLocation: Range | undefined;
            try {
              location = r.getRange(l.cfi);
              if (loc.end?.cfi) endLocation = r.getRange(loc.end.cfi);
            } catch {}
            const tocLocation = resolveTocLocation(
              current.current.toc,
              l.href,
              location,
              endLocation,
              navigationTarget.current,
            );
            setCurrentTocHref(tocLocation?.href || "");
            const label =
              tocLocation?.label ||
              current.current.chapters.find(
                (c) => c.href.split("#")[0] === l.href,
              )?.label ||
              current.current.title;
            setChapter(label);
            setPage(`${l.displayed.page} / ${l.displayed.total}`);
            let pct = b.locations.length()
              ? b.locations.percentageFromCfi(l.cfi)
              : l.percentage;
            if (!Number.isFinite(pct)) pct = 0;
            pct = Math.max(0, Math.min(1, pct));
            setProgress(pct);
            if (progressTimer.current) clearTimeout(progressTimer.current);
            const patch = { cfi: l.cfi, progress: pct, lastOpened: Date.now() };
            current.current = { ...current.current, ...patch };
            progressTimer.current = setTimeout(() => {
              void persist(patch);
            }, 350);
          },
        );
        r.on("selected", (range: string, contents: Contents) => {
          const text = contents.window.getSelection()?.toString().trim();
          if (text) {
            setSelection({ text: text.slice(0, 8000), cfi: range });
            setNote("");
          }
        });
        r.on("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowRight") {
            void r.next().catch((e) => setError(e.message));
          }
          if (e.key === "ArrowLeft") {
            void r.prev().catch((e) => setError(e.message));
          }
        });
        r.hooks.content.register((contents: Contents) => {
          readingMetrics.attachDocument(contents.document);
          let startX = 0,
            startY = 0,
            startAt = 0,
            distance = 0,
            font = 20,
            pinching = false;
          const doc = contents.document;
          doc.addEventListener(
            "touchstart",
            (event) => {
              startAt = Date.now();
              pinching = event.touches.length === 2;
              if (pinching) {
                distance = Math.hypot(
                  event.touches[0].clientX - event.touches[1].clientX,
                  event.touches[0].clientY - event.touches[1].clientY,
                );
                font = prefsRef.current.fontSize;
              } else if (event.touches.length === 1) {
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
              }
            },
            { passive: true },
          );
          doc.addEventListener(
            "touchmove",
            (event) => {
              if (pinching && event.touches.length === 2 && distance > 0) {
                event.preventDefault();
                const next = Math.round(
                  Math.max(
                    14,
                    Math.min(
                      36,
                      (font *
                        Math.hypot(
                          event.touches[0].clientX - event.touches[1].clientX,
                          event.touches[0].clientY - event.touches[1].clientY,
                        )) /
                        distance,
                    ),
                  ),
                );
                setPrefs((previous) => ({ ...previous, fontSize: next }));
              }
            },
            { passive: false },
          );
          doc.addEventListener(
            "touchend",
            (event) => {
              if (
                pinching ||
                event.touches.length ||
                doc.getSelection()?.toString()
              )
                return;
              if (
                (event.target as Element)?.closest?.("a,button,input,textarea")
              )
                return;
              const touch = event.changedTouches[0];
              if (!touch) return;
              const dx = touch.clientX - startX,
                dy = touch.clientY - startY;
              if (
                Math.abs(dx) > 55 &&
                Math.abs(dx) > Math.abs(dy) * 1.5 &&
                prefsRef.current.flow === "paginated"
              ) {
                void (dx < 0 ? r.next() : r.prev()).catch((e) =>
                  setError(e.message),
                );
              } else if (
                Date.now() - startAt < 250 &&
                Math.abs(dx) < 12 &&
                Math.abs(dy) < 12
              ) {
                const rect = container.current?.getBoundingClientRect();
                const width = rect?.width || contents.window.innerWidth;
                const frameLeft =
                  contents.window.frameElement?.getBoundingClientRect().left ||
                  0;
                const localX = touch.clientX + frameLeft - (rect?.left || 0);
                if (
                  localX > width * 0.75 &&
                  prefsRef.current.flow === "paginated"
                )
                  void r.next().catch((e) => setError(e.message));
                else if (
                  localX < width * 0.25 &&
                  prefsRef.current.flow === "paginated"
                )
                  void r.prev().catch((e) => setError(e.message));
                else if (immersiveRef.current)
                  setReaderControls((visible) => !visible);
              }
            },
            { passive: true },
          );
          contents.document.querySelectorAll("a").forEach((a) => {
            if (/^[a-z][\w+.-]*:/i.test(a.getAttribute("href") || ""))
              a.removeAttribute("href");
          });
        });
        await r.display(book.cfi || undefined);
        if (!live) return;
        resizeReady = true;
        for (const a of current.current.annotations)
          r.annotations.highlight(a.cfi, {}, undefined, "folio-highlight", {
            fill: a.color,
            "fill-opacity": "0.32",
            "mix-blend-mode": "multiply",
          });
        setReady(true);
        await b.locations.generate(1200);
        if (live && r.location) {
          const pct = b.locations.percentageFromCfi(r.location.start.cfi);
          if (Number.isFinite(pct)) {
            setProgress(pct);
            void persist({ progress: pct });
          }
        }
      } catch (e) {
        if (live)
          setError(`Não foi possível abrir o livro: ${(e as Error).message}`);
      }
    }
    void start();
    const resize = new ResizeObserver(() => {
      if (live && resizeReady && container.current && rendition.current) {
        const { width, height } = container.current.getBoundingClientRect();
        if (width && height) rendition.current.resize(width, height);
      }
    });
    if (container.current) resize.observe(container.current);
    return () => {
      live = false;
      resize.disconnect();
      if (progressTimer.current) {
        clearTimeout(progressTimer.current);
        void onUpdate(current.current).catch(() => {});
      }
      window.speechSynthesis?.cancel();
      void window.folio?.stopSpeaking?.().catch(() => {});
      try {
        b.destroy();
      } catch {}
      rendition.current = null;
      epub.current = null;
    };
  }, [book.id]);
  useEffect(() => {
    prefsRef.current = prefs;
    if (rendition.current) {
      theme(rendition.current, prefs);
      if (rendition.current.settings.flow !== prefs.flow)
        rendition.current.flow(prefs.flow);
    }
    void persist({ prefs });
  }, [prefs]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatBusy]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches("input,textarea,select") || target.isContentEditable)
        return;
      if (e.key === "ArrowRight")
        void rendition.current?.next().catch((e) => setError(e.message));
      if (e.key === "ArrowLeft")
        void rendition.current?.prev().catch((e) => setError(e.message));
      if (e.key === "Escape") {
        setSelection(null);
        setPanel(null);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  async function closeReader() {
    await readingMetrics.flush();
    if (progressTimer.current) {
      clearTimeout(progressTimer.current);
      progressTimer.current = null;
    }
    try {
      await saveQueue.current;
      await onUpdate(current.current);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const close = () => {
      if (panel) setPanel(null);
      else if (immersive && readerControls) setReaderControls(false);
      else if (immersive) immersiveMode(false);
      else void closeReader();
    };
    window.addEventListener("folio-close-reader", close);
    return () => window.removeEventListener("folio-close-reader", close);
  }, [panel, immersive, readerControls]);
  async function go(target: string) {
    navigationTarget.current = current.current.toc.some(
      (t) => t.href === target,
    )
      ? target
      : null;
    try {
      await rendition.current?.display(target);
      setSelection(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function annotate() {
    if (!selection) return;
    const item: Annotation = {
      id: crypto.randomUUID(),
      cfi: selection.cfi,
      text: selection.text,
      note: note.trim(),
      color: "#dbc878",
      chapter,
      created: Date.now(),
    };
    try {
      rendition.current?.annotations.highlight(
        item.cfi,
        {},
        undefined,
        "folio-highlight",
        {
          fill: item.color,
          "fill-opacity": "0.32",
          "mix-blend-mode": "multiply",
        },
      );
      await persist({ annotations: [...current.current.annotations, item] });
      setSelection(null);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function bookmark() {
    if (!cfi) return;
    const existing = current.current.bookmarks.some((b) => b.cfi === cfi);
    await persist({
      bookmarks: existing
        ? current.current.bookmarks.filter((b) => b.cfi !== cfi)
        : [...current.current.bookmarks, { cfi, label: chapter }],
    });
  }
  async function ask(text = question) {
    if (chatBusy || !text.trim()) return;
    setPanel("chat");
    setError("");
    if (!window.folio) {
      setError(
        "Abra o aplicativo Folio e configure sua chave OpenAI para conversar com este livro.",
      );
      return;
    }
    if (!settings.hasApiKey) {
      onSettings();
      return;
    }
    setChatBusy(true);
    const q = text.trim();
    const passages = retrievePassages(book.chapters, q, selection?.text, href);
    const previous = current.current.messages;
    const interim: Message[] = [...previous, { role: "user", content: q }];
    setMessages(interim);
    setQuestion("");
    try {
      const answer = await window.folio.chat({
        title: book.title,
        question: q,
        selection: selection?.text,
        history: previous.slice(-8).map(({ role, content }) => ({
          role,
          content: content.slice(0, 6000),
        })),
        passages,
      });
      const next: Message[] = [
        ...interim,
        {
          role: "assistant",
          content: answer.text,
          sources: passages.map((p) => ({
            label: p.label,
            href: p.href,
            excerpt: p.text.slice(0, 180),
          })),
        },
      ];
      setMessages(next);
      await persist({ messages: next });
      setSelection(null);
    } catch (e) {
      setMessages(previous);
      setQuestion(q);
      setError((e as Error).message);
    } finally {
      setChatBusy(false);
    }
  }
  const matches = useMemo(
    () => searchBook(book.chapters, find),
    [book.chapters, find],
  );
  const [audioOpen, setAudioOpen] = useState(false);
  async function exportNotes() {
    const text =
      `# ${book.title}\n${book.author}\n\n` +
      book.annotations
        .map(
          (a) =>
            `## ${a.chapter}\n\n> ${a.text.replace(/\n/g, "\n> ")}\n\n${a.note}\n`,
        )
        .join("\n");
    if (window.folio)
      await window.folio.exportFile(`${book.title}-notas.md`, text);
    else {
      const u = URL.createObjectURL(
        new Blob([text], { type: "text/markdown" }),
      );
      const a = document.createElement("a");
      a.href = u;
      a.download = "notas.md";
      a.click();
      URL.revokeObjectURL(u);
    }
  }
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  return (
    <div
      className={`reader-shell theme-${prefs.theme}${immersive ? " reader-immersive" : ""}${readerControls ? " reader-controls-visible" : ""}`}
    >
      <header className="reader-toolbar">
        <button
          className="reader-back"
          aria-label="Biblioteca"
          onClick={() => void closeReader()}
        >
          <ArrowLeft size={18} />
          <span>Biblioteca</span>
        </button>
        <div className="reader-title">
          <strong>{book.title}</strong>
          <span>{book.author}</span>
        </div>
        <div className="reader-actions">
          <button
            className="icon-button"
            aria-label={immersive ? "Sair da tela cheia" : "Tela cheia"}
            onClick={() => immersiveMode(!immersive)}
          >
            {immersive ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
          {immersive && (
            <button
              className="icon-button"
              aria-label="Abrir player de áudio"
              onClick={() => {
                setAudioOpen(true);
                window.dispatchEvent(new Event("folio-audio-open"));
              }}
            >
              <Volume2 size={19} />
            </button>
          )}
          <button
            className={panel === "toc" ? "icon-button selected" : "icon-button"}
            aria-label="Sumário"
            onClick={() => toggle("toc")}
          >
            <List size={20} />
          </button>
          <button
            className={
              panel === "search" ? "icon-button selected" : "icon-button"
            }
            aria-label="Buscar no livro"
            onClick={() => toggle("search")}
          >
            <Search size={19} />
          </button>
          <button
            className={
              panel === "appearance" ? "icon-button selected" : "icon-button"
            }
            aria-label="Ajustar leitura"
            onClick={() => toggle("appearance")}
          >
            <Type size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Marcar página"
            onClick={() => void bookmark()}
          >
            <Bookmark
              size={19}
              fill={
                book.bookmarks.some((b) => b.cfi === cfi)
                  ? "currentColor"
                  : "none"
              }
            />
          </button>
          <button
            className="icon-button"
            aria-label="Destaques e notas"
            onClick={() => toggle("notes")}
          >
            <Highlighter size={19} />
          </button>
          <button className="chat-toggle" onClick={() => toggle("chat")}>
            <MessageCircle size={17} />
            Conversar
          </button>
        </div>
      </header>
      {error && (
        <div className="reader-error error-banner" role="alert">
          {error}
          <button aria-label="Fechar aviso" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="reader-body">
        <div className="reading-area">
          <div className="chapter-heading">
            <span>{chapter || "Preparando sua leitura"}</span>
            {chapterMinutes !== null && (
              <small className="chapter-time">
                ~{chapterMinutes} min até terminar o capítulo
                {personalPace ? "" : " · estimativa inicial"}
              </small>
            )}
            <button
              className="icon-button"
              aria-label={
                speaking
                  ? "Parar leitura em voz alta"
                  : "Ler capítulo em voz alta"
              }
              onClick={() => {
                setAudioOpen(true);
                window.dispatchEvent(new Event("folio-audio-open"));
              }}
            >
              {speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          </div>
          <div
            className="epub-container"
            ref={container}
            style={{ maxWidth: prefs.width }}
          />
          {!ready && !error && (
            <div className="reader-loading">Abrindo o livro…</div>
          )}
          {prefs.flow === "paginated" && (
            <>
              <button
                className="page-arrow previous"
                aria-label="Página anterior"
                onClick={() =>
                  void rendition.current
                    ?.prev()
                    .catch((e) => setError(e.message))
                }
              >
                <ChevronLeft size={28} />
              </button>
              <button
                className="page-arrow next"
                aria-label="Próxima página"
                onClick={() =>
                  void rendition.current
                    ?.next()
                    .catch((e) => setError(e.message))
                }
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}
          <div className="reading-metrics-status" aria-live="polite">
            <span
              className={`status-dot ${readingMetrics.status === "idle" || readingMetrics.status === "paused" ? "paused" : ""}`}
            />
            {readingMetrics.status === "reading"
              ? "Leitura ativa"
              : readingMetrics.status === "listening"
                ? "Voz ativa"
                : readingMetrics.status === "idle"
                  ? "Pausa por inatividade — toque na página para continuar"
                  : "Contagem pausada"}
            <span> · {formatTime(readingMetrics.sessionMs)} nesta sessão</span>
            {readingMetrics.saveError && (
              <span role="alert">{readingMetrics.saveError}</span>
            )}
          </div>
          {immersive && (
            <footer className="immersive-progress">
              <span>
                {epub.current?.locations.length()
                  ? `Localização ${(Number(epub.current.locations.locationFromCfi(cfi)) || 0) + 1} de ${epub.current.locations.length()}`
                  : page
                    ? `Página ${page}`
                    : ""}
              </span>
              <span>{Math.round(progress * 100)}%</span>
            </footer>
          )}
          <footer className="reader-footer">
            <span>{Math.round(progress * 100)}% lido</span>
            <input
              type="range"
              aria-label="Posição no livro"
              min="0"
              max="100"
              value={Math.round(progress * 100)}
              disabled={!ready || !epub.current?.locations.length()}
              onChange={(e) => {
                const target = epub.current?.locations.cfiFromPercentage(
                  Number(e.target.value) / 100,
                );
                if (target) void go(target);
              }}
            />
            <span>{page ? `Página ${page} do capítulo` : ""}</span>
            <button
              className="text-button"
              onClick={() => void persist({ finished: !book.finished })}
            >
              {book.finished ? "Concluído ✓" : "Concluir livro"}
            </button>
          </footer>
        </div>
        {panel && (
          <aside
            className={`reader-panel ${panel === "chat" ? "chat-panel" : ""}`}
          >
            <div className="panel-heading">
              <h2>
                {panel === "toc" ? (
                  "Neste livro"
                ) : panel === "search" ? (
                  "Buscar no livro"
                ) : panel === "notes" ? (
                  "Suas anotações"
                ) : panel === "appearance" ? (
                  "Sua leitura"
                ) : (
                  <>
                    Converse com o livro<span className="ai-dot">✦</span>
                  </>
                )}
              </h2>
              <button
                className="icon-button"
                aria-label="Fechar painel"
                onClick={() => setPanel(null)}
              >
                <X size={18} />
              </button>
            </div>
            {panel === "toc" && (
              <div className="panel-scroll">
                <div className="eyebrow">SUMÁRIO</div>
                {book.toc.map((item, i) => (
                  <button
                    key={`${item.href}-${i}`}
                    className={
                      item.href === currentTocHref
                        ? "toc-link current"
                        : "toc-link"
                    }
                    onClick={() => void go(item.href)}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {item.label}
                  </button>
                ))}
                <div className="divider" />
                <div className="eyebrow">PÁGINAS MARCADAS</div>
                {book.bookmarks.map((b, i) => (
                  <button
                    className="toc-link"
                    key={b.cfi}
                    onClick={() => void go(b.cfi)}
                  >
                    <Bookmark size={14} />
                    {b.label || `Marcador ${i + 1}`}
                  </button>
                ))}
                {!book.bookmarks.length && (
                  <p className="panel-muted">
                    Use o marcador na barra de leitura para guardar uma página.
                  </p>
                )}
              </div>
            )}
            {panel === "search" && (
              <div className="panel-scroll">
                <label className="search-input panel-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    placeholder="Uma palavra ou expressão…"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                </label>
                <p className="panel-muted">
                  {find.length < 2
                    ? "Digite ao menos duas letras."
                    : `${matches.length}${matches.length === 60 ? "+" : ""} resultados. Os links abrem o capítulo.`}
                </p>
                {matches.map((m, i) => (
                  <button
                    className="search-result"
                    key={i}
                    onClick={() => void go(m.href)}
                  >
                    <strong>{m.label}</strong>
                    <span>{m.excerpt}</span>
                  </button>
                ))}
              </div>
            )}
            {panel === "notes" && (
              <div className="panel-scroll">
                <button
                  className="text-button"
                  onClick={() =>
                    void exportNotes().catch((e) => setError(e.message))
                  }
                >
                  <Download size={16} />
                  Exportar notas
                </button>
                {book.annotations.map((a) => (
                  <article className="annotation" key={a.id}>
                    <button onClick={() => void go(a.cfi)}>
                      <small>{a.chapter}</small>
                      <blockquote>{a.text}</blockquote>
                    </button>
                    <textarea
                      aria-label="Editar nota"
                      defaultValue={a.note}
                      placeholder="Acrescente uma ideia…"
                      onBlur={(e) => {
                        if (a.note !== e.target.value)
                          void persist({
                            annotations: current.current.annotations.map((n) =>
                              n.id === a.id
                                ? { ...n, note: e.target.value }
                                : n,
                            ),
                          });
                      }}
                    />
                    <button
                      className="text-button danger-text"
                      onClick={() => {
                        rendition.current?.annotations.remove(
                          a.cfi,
                          "highlight",
                        );
                        void persist({
                          annotations: current.current.annotations.filter(
                            (n) => n.id !== a.id,
                          ),
                        });
                      }}
                    >
                      <Trash2 size={13} />
                      Remover
                    </button>
                  </article>
                ))}
                {!book.annotations.length && (
                  <p className="panel-muted">
                    Selecione um trecho do livro para destacar e anotar.
                  </p>
                )}
              </div>
            )}
            {panel === "appearance" && (
              <div className="panel-scroll">
                <div className="eyebrow">COR DA PÁGINA</div>
                <div className="theme-buttons">
                  {(["paper", "night"] as const).map((t) => (
                    <button
                      className={prefs.theme === t ? "active" : ""}
                      style={{ background: colors[t].bg, color: colors[t].fg }}
                      key={t}
                      onClick={() => {
                        setPrefs({ ...prefs, theme: t });
                        window.dispatchEvent(
                          new CustomEvent("folio-theme-change", {
                            detail: t === "night" ? "dark" : "light",
                          }),
                        );
                      }}
                    >
                      {t === "paper" ? "Claro" : "Escuro"}
                    </button>
                  ))}
                </div>
                <label className="form-field">
                  Fonte
                  <select
                    value={prefs.fontFamily}
                    onChange={(e) =>
                      setPrefs({ ...prefs, fontFamily: e.target.value })
                    }
                  >
                    <option value="Georgia">Georgia</option>
                    <option value="Palatino">Palatino</option>
                    <option value="Arial">Arial</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                </label>
                <label className="form-field">
                  Tamanho · {prefs.fontSize}px
                  <input
                    type="range"
                    min="14"
                    max="36"
                    value={prefs.fontSize}
                    onChange={(e) =>
                      setPrefs({ ...prefs, fontSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="form-field">
                  Espaçamento · {prefs.lineHeight}
                  <input
                    type="range"
                    min="1.2"
                    max="2.4"
                    step="0.1"
                    value={prefs.lineHeight}
                    onChange={(e) =>
                      setPrefs({ ...prefs, lineHeight: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="form-field">
                  Largura da página
                  <input
                    type="range"
                    min="450"
                    max="1100"
                    step="50"
                    value={prefs.width}
                    onChange={(e) =>
                      setPrefs({ ...prefs, width: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="form-field">
                  Navegação
                  <select
                    value={prefs.flow}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        flow: e.target.value as ReaderPrefs["flow"],
                      })
                    }
                  >
                    <option value="paginated">Páginas</option>
                    <option value="scrolled-doc">Rolagem contínua</option>
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => immersiveMode(true)}
                >
                  <Maximize size={16} />
                  Tela cheia
                </button>
              </div>
            )}
            {panel === "chat" && (
              <>
                <div className="chat-context">
                  <span className="status-dot" />
                  <span>Contexto: este EPUB</span>
                  <button
                    className="icon-button"
                    aria-label="Configurar OpenAI"
                    onClick={onSettings}
                  >
                    <Settings size={15} />
                  </button>
                </div>
                <div className="chat-messages">
                  {!messages.length && (
                    <div className="chat-empty">
                      <div className="chat-symbol">✦</div>
                      <h3>Leia além das linhas.</h3>
                      <p>
                        Pergunte, conecte ideias ou explore um trecho. As
                        respostas usam passagens recuperadas deste livro.
                      </p>
                      <button
                        onClick={() =>
                          void ask(
                            "Quais são as principais ideias deste livro?",
                          )
                        }
                      >
                        Quais são as principais ideias?
                        <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() =>
                          void ask(`Explique as ideias do capítulo ${chapter}.`)
                        }
                      >
                        Me ajude com este capítulo
                        <ArrowRight size={14} />
                      </button>
                      <small>
                        A recuperação é por palavras-chave. Não cobre
                        necessariamente todo o livro.
                      </small>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div className={`chat-message ${m.role}`} key={i}>
                      <span className="message-author">
                        {m.role === "user" ? "Você" : "Assistente OpenAI"}
                      </span>
                      <p>{m.content}</p>
                      {m.sources && (
                        <div className="chat-sources">
                          <span>TRECHOS ENVIADOS COMO CONTEXTO</span>
                          {m.sources.map((s, j) => (
                            <button
                              key={j}
                              onClick={() => void go(s.href)}
                              title={s.excerpt}
                            >
                              <BookOpen size={12} />[{j + 1}] {s.label}
                              <ChevronRight size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="chat-thinking">
                      <span />
                      Lendo os trechos e preparando a resposta…
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
                {selection && (
                  <div className="selection-context">
                    <Quote size={14} />
                    <span>{selection.text.slice(0, 140)}…</span>
                    <button
                      aria-label="Limpar seleção"
                      onClick={() => setSelection(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <form
                  className="chat-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <textarea
                    placeholder="O que você quer entender?"
                    aria-label="Pergunta sobre o livro"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void ask();
                      }
                    }}
                  />
                  <button
                    aria-label="Enviar pergunta"
                    disabled={chatBusy || !question.trim()}
                  >
                    <Send size={17} />
                  </button>
                </form>
                <div className="chat-disclaimer">
                  {settings.hasApiKey
                    ? "OpenAI · pode cometer erros. Confira os trechos."
                    : "Configure sua chave OpenAI para começar."}
                  <button
                    onClick={() => {
                      if (window.confirm("Apagar esta conversa?")) {
                        setMessages([]);
                        void persist({ messages: [] });
                      }
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      {selection && panel !== "chat" && (
        <div className="selection-toolbar">
          <button
            onClick={() => {
              setAudioOpen(true);
              window.dispatchEvent(new Event("folio-audio-open"));
            }}
          >
            <Volume2 size={16} /> Ouvir seleção
          </button>
          <div className="selection-preview">
            <Quote size={16} />
            <span>
              {selection.text.slice(0, 110)}
              {selection.text.length > 110 ? "…" : ""}
            </span>
            <button
              className="icon-button"
              aria-label="Limpar seleção"
              onClick={() => setSelection(null)}
            >
              <X size={16} />
            </button>
          </div>
          <input
            aria-label="Nota sobre o trecho"
            placeholder="Uma nota sobre este trecho (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div>
            <button onClick={() => void annotate()}>
              <Highlighter size={15} />
              Destacar e salvar
            </button>
            <button
              onClick={() => {
                setPanel("chat");
                setQuestion("Explique este trecho.");
              }}
            >
              <MessageCircle size={15} />
              Perguntar à IA
            </button>
            <button
              onClick={() =>
                void openExternal(
                  `https://pt.wiktionary.org/wiki/${encodeURIComponent(selection.text.trim().slice(0, 120))}`,
                ).catch((e) => setError(e.message))
              }
            >
              <ExternalLink size={14} />
              Dicionário
            </button>
          </div>
        </div>
      )}
      {audioOpen && (
        <AudioPlayer
          book={book}
          currentHref={currentTocHref || href}
          selection={selection?.text}
          currentText={(() => {
            try {
              const range = rendition.current?.getRange(cfi);
              const node = range?.startContainer;
              return (
                node?.parentElement?.closest("p")?.textContent ||
                node?.textContent ||
                undefined
              );
            } catch {
              return undefined;
            }
          })()}
          onClose={() => {
            audioNavigation.current++;
            setAudioOpen(false);
          }}
          onPlaying={setSpeaking}
          marked={book.bookmarks.some((mark) => mark.cfi === cfi)}
          onBookmark={() => void bookmark()}
          onNavigate={(target, text, follow = false, offset) => {
            const request = ++audioNavigation.current;
            void (async () => {
              try {
                const b = epub.current,
                  r = rendition.current;
                if (!b || !r) return;
                const section = b.spine.get(target.split("#")[0]);
                if (text && section) {
                  await section.load(b.load.bind(b));
                  if (request !== audioNavigation.current) return;
                  const range = audioTextRange(section.document, text, {
                    anchor: target.split("#")[1],
                    offset,
                  });
                  if (range) {
                    range.collapse(true);
                    const point = section.cfiFromRange(range);
                    const location = r.location;
                    const compare = new EpubCFI();
                    if (
                      follow &&
                      location?.start?.cfi &&
                      location?.end?.cfi &&
                      compare.compare(point, location.start.cfi) >= 0 &&
                      compare.compare(point, location.end.cfi) <= 0
                    )
                      return;
                    navigationTarget.current = target;
                    await r.display(point);
                    return;
                  }
                }
                if (!follow && request === audioNavigation.current) {
                  navigationTarget.current = target;
                  await r.display(target);
                }
              } catch (e) {
                if (request === audioNavigation.current)
                  setError((e as Error).message);
              }
            })();
          }}
        />
      )}
      {settingsModal}
    </div>
  );
}
