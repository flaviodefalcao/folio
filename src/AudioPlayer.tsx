import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Settings2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Timer,
  Bookmark,
  BookOpen,
  List,
  Volume2,
  X,
} from "lucide-react";
import { audioChapters, audioSegments } from "./audio";
import type { BookRecord, Chapter } from "./types";
type Voice = { id: string; name: string; language: string; network: boolean };
export default function AudioPlayer({
  book,
  currentHref,
  selection,
  currentText,
  onClose,
  onPlaying,
  onNavigate,
  onBookmark,
  marked,
}: {
  book: BookRecord;
  currentHref: string;
  selection?: string;
  currentText?: string;
  onClose: () => void;
  onPlaying: (playing: boolean) => void;
  onNavigate: (
    href: string,
    text?: string,
    follow?: boolean,
    offset?: number,
  ) => void;
  onBookmark?: () => void;
  marked?: boolean;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]),
    [chapter, setChapter] = useState(0),
    [voices, setVoices] = useState<Voice[]>([]);
  const [language, setLanguage] = useState(
      localStorage.getItem("folio:audio-language") || "pt-BR",
    ),
    [voice, setVoice] = useState(
      localStorage.getItem("folio:audio-voice") || "",
    ),
    [rate, setRate] = useState(
      Number(localStorage.getItem("folio:audio-rate")) || 1,
    );
  const [scope, setScope] = useState(selection ? "selection" : "current"),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [timer, setTimer] = useState(0),
    [continuous, setContinuous] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [options, setOptions] = useState(false);
  const [followText, setFollowText] = useState(
    localStorage.getItem("folio:audio-follow") !== "false",
  );
  const screen = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!minimized)
      screen.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [minimized]);
  const pendingSettings = useRef(false),
    pendingChapter = useRef(false);
  useEffect(() => {
    if (options)
      screen.current
        ?.querySelector<HTMLButtonElement>(".audio-settings button")
        ?.focus();
  }, [options]);
  const pendingSeek = useRef(false),
    lastFollow = useRef(0);
  const followRef = useRef<() => void>(() => {});
  const spokenPosition = useRef({ index: 0, offset: 0 }),
    nativeCharacterStart = useRef(0);
  const [seekRevision, setSeekRevision] = useState(0);
  const nativeStart = useRef(0),
    deadline = useRef(0);
  const active = useRef(false),
    generation = useRef(0),
    playRef = useRef<() => void>(() => {});
  const text =
    scope === "selection" ? selection || "" : chapters[chapter]?.text || "";
  const segments = useMemo(() => audioSegments(text), [text]);
  useEffect(() => {
    spokenPosition.current = { index: 0, offset: 0 };
  }, [chapter, text]);
  const timeline = useMemo(() => {
    let seconds = 0;
    return segments.map((segment) => {
      const start = seconds;
      seconds += segment.trim().split(/\s+/).length / 2.5 / rate;
      return { start, end: seconds };
    });
  }, [segments, rate]);
  const totalSeconds = timeline.at(-1)?.end || 0;
  const [cursor, setCursor] = useState(0);
  const playbackClock = useRef({ seconds: 0, stamp: Date.now() });
  const elapsedSeconds = Math.min(totalSeconds, cursor);
  function anchorTime(seconds: number) {
    playbackClock.current = { seconds, stamp: Date.now() };
    setCursor(seconds);
  }
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const clock = playbackClock.current;
      setCursor(
        Math.min(
          Math.max(0, totalSeconds - 0.1),
          clock.seconds + (Date.now() - clock.stamp) / 1000,
        ),
      );
    };
    const timerId = setInterval(tick, 200);
    return () => clearInterval(timerId);
  }, [playing, totalSeconds]);
  useEffect(() => {
    anchorTime(timeline[index]?.start || 0);
  }, [chapter, text, rate]);
  const time = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  followRef.current = () => {
    if (followText && segments[index])
      onNavigate(
        chapters[chapter]?.href || currentHref,
        segments[index],
        true,
        segments.slice(0, index).join("").length,
      );
  };
  useEffect(() => {
    localStorage.setItem("folio:audio-follow", String(followText));
    if (playing && followText) followRef.current();
  }, [playing, chapter, followText]);
  useEffect(() => {
    if (playing && followText && !window.folio?.speak) followRef.current();
  }, [index]);
  function seekTo(seconds: number) {
    seconds = Math.max(0, Math.min(totalSeconds, seconds));
    let next = timeline.findIndex((item) => item.end > seconds);
    if (next < 0) next = segments.length - 1;
    if (next < 0) return;
    const fraction =
      (seconds - timeline[next].start) /
      Math.max(0.01, timeline[next].end - timeline[next].start);
    let offset = Math.floor(
      Math.max(0, Math.min(1, fraction)) * segments[next].length,
    );
    const space = segments[next].lastIndexOf(" ", offset);
    if (space >= 0) offset = space + 1;
    if (offset > 0 && /[\uD800-\uDBFF]/.test(segments[next][offset - 1]))
      offset--;
    const resume = active.current,
      until = deadline.current;
    pause();
    if (resume) deadline.current = until;
    spokenPosition.current = { index: next, offset };
    pendingSeek.current = resume;
    setIndex(next);
    anchorTime(seconds);
    setSeekRevision((revision) => revision + 1);
    onNavigate(
      chapters[chapter]?.href || currentHref,
      segments[next].slice(offset),
      true,
      segments.slice(0, next).join("").length + offset,
    );
  }
  function skip(seconds: number) {
    seekTo(elapsedSeconds + seconds);
  }
  useEffect(() => {
    if (pendingSeek.current) {
      pendingSeek.current = false;
      playRef.current();
    }
  }, [index, seekRevision]);
  useEffect(() => {
    let live = true;
    audioChapters(book)
      .then((items) => {
        if (live) {
          setChapters(items);
          setChapter(
            Math.max(
              0,
              items.findIndex((c) => c.href === currentHref),
            ),
          );
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [book.id]);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (window.folio?.speechVoices)
        window.folio
          .speechVoices()
          .then((result) => {
            if (live) setVoices(result.voices);
          })
          .catch((e) => setError(e.message));
      else if ("speechSynthesis" in window)
        setVoices(
          speechSynthesis.getVoices().map((v) => ({
            id: v.voiceURI,
            name: v.name,
            language: v.lang,
            network: !v.localService,
          })),
        );
    };
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => {
      live = false;
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
    };
  }, []);
  useEffect(() => {
    const show = () => setMinimized(false);
    window.addEventListener("folio-audio-open", show);
    return () => window.removeEventListener("folio-audio-open", show);
  }, []);
  useEffect(() => {
    if (chapters.length && scope === "current") fromCurrent();
  }, [chapters]);
  useEffect(() => {
    localStorage.setItem("folio:audio-language", language);
    localStorage.setItem("folio:audio-voice", voice);
    localStorage.setItem("folio:audio-rate", String(rate));
  }, [language, voice, rate]);
  function pause() {
    if (active.current) {
      const clock = playbackClock.current;
      anchorTime(
        Math.min(
          totalSeconds,
          clock.seconds + (Date.now() - clock.stamp) / 1000,
        ),
      );
    }
    deadline.current = 0;
    active.current = false;
    generation.current++;
    setPlaying(false);
    onPlaying(false);
    void window.folio?.stopSpeaking?.();
    window.speechSynthesis?.cancel();
  }
  useEffect(
    () => () => {
      active.current = false;
      generation.current++;
      void window.folio?.stopSpeaking?.();
      window.speechSynthesis?.cancel();
      onPlaying(false);
    },
    [],
  );
  useEffect(() => {
    if (!timer || !playing) return;
    const id = setTimeout(() => pause(), timer * 60000);
    return () => clearTimeout(id);
  }, [timer, playing]);
  function ended() {
    if (!active.current) return;
    if (!window.folio?.speak && index + 1 < segments.length)
      setIndex(index + 1);
    else if (
      continuous &&
      scope !== "selection" &&
      chapter + 1 < chapters.length
    ) {
      setChapter(chapter + 1);
      setIndex(0);
      onNavigate(chapters[chapter + 1].href);
    } else pause();
  }
  useEffect(() => {
    const done = () => ended();
    window.addEventListener("folio-speech-ended", done);
    return () => window.removeEventListener("folio-speech-ended", done);
  }, [index, chapter, segments.length, continuous, scope]);
  async function play(start = index) {
    const characterStart =
      spokenPosition.current.index === start
        ? spokenPosition.current.offset
        : 0;
    nativeCharacterStart.current = characterStart;
    if (!segments[start]) return;
    anchorTime(
      (timeline[start]?.start || 0) +
        (characterStart / Math.max(1, segments[start].length)) *
          ((timeline[start]?.end || 0) - (timeline[start]?.start || 0)),
    );
    const token = ++generation.current;
    active.current = true;
    setPlaying(true);
    onPlaying(true);
    setError("");
    try {
      if (window.folio?.speak) {
        nativeStart.current = start;
        if (timer && !deadline.current)
          deadline.current = Date.now() + timer * 60000;
        await window.folio.speak(
          segments[start].slice(characterStart) +
            segments.slice(start + 1).join(""),
          {
            language,
            voice,
            rate,
            sleepUntil: deadline.current,
          },
        );
      } else {
        if (!("speechSynthesis" in window))
          throw Error("Voz indisponível neste aparelho.");
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          segments[start].slice(characterStart),
        );
        utterance.lang = language;
        utterance.rate = rate;
        utterance.voice =
          speechSynthesis.getVoices().find((v) => v.voiceURI === voice) || null;
        utterance.onend = () => {
          if (token === generation.current) ended();
        };
        utterance.onboundary = (event) => {
          spokenPosition.current = {
            index: start,
            offset: characterStart + event.charIndex,
          };
          if (token === generation.current) {
            const startTime = timeline[start]?.start || 0;
            const endTime = timeline[start]?.end || startTime;
            anchorTime(
              Math.max(
                playbackClock.current.seconds +
                  (Date.now() - playbackClock.current.stamp) / 1000,
                startTime +
                  ((characterStart + event.charIndex) /
                    Math.max(1, segments[start].length)) *
                    (endTime - startTime),
              ),
            );
          }
          if (
            token === generation.current &&
            followText &&
            Date.now() - lastFollow.current > 350
          ) {
            lastFollow.current = Date.now();
            onNavigate(
              chapters[chapter]?.href || currentHref,
              segments[start].slice(characterStart + event.charIndex),
              true,
              segments.slice(0, start).join("").length +
                characterStart +
                event.charIndex,
            );
          }
        };
        utterance.onerror = () => {
          if (token === generation.current) {
            pause();
            setError("Não foi possível reproduzir esta voz.");
          }
        };
        speechSynthesis.speak(utterance);
      }
    } catch (e) {
      if (token === generation.current) {
        pause();
        setError((e as Error).message);
      }
    }
  }
  playRef.current = () => void play();
  useEffect(() => {
    if (active.current && !window.folio?.speak) playRef.current();
  }, [index]);
  useEffect(() => {
    if (active.current) playRef.current();
  }, [chapter]);
  useEffect(() => {
    const progress = (event: Event) => {
      if (!active.current) return;
      let offset =
        (event as CustomEvent).detail.offset + nativeCharacterStart.current;
      let i = nativeStart.current;
      while (i < segments.length - 1 && offset >= segments[i].length) {
        offset -= segments[i].length;
        i++;
      }
      setIndex(i);
      spokenPosition.current = { index: i, offset };
      const point =
        (timeline[i]?.start || 0) +
        Math.min(1, Math.max(0, offset / Math.max(1, segments[i].length))) *
          ((timeline[i]?.end || 0) - (timeline[i]?.start || 0));
      anchorTime(
        Math.max(
          playbackClock.current.seconds +
            (Date.now() - playbackClock.current.stamp) / 1000,
          point,
        ),
      );
      if (followText && Date.now() - lastFollow.current > 350) {
        lastFollow.current = Date.now();
        onNavigate(
          chapters[chapter]?.href || currentHref,
          segments[i].slice(offset),
          true,
          segments.slice(0, i).join("").length + offset,
        );
      }
    };
    const stopped = () => pause();
    const failed = () => {
      pause();
      setError("A voz não conseguiu reproduzir o texto.");
    };
    window.addEventListener("folio-speech-progress", progress);
    window.addEventListener("folio-speech-error", failed);
    window.addEventListener("folio-speech-stopped", stopped);
    return () => {
      window.removeEventListener("folio-speech-progress", progress);
      window.removeEventListener("folio-speech-error", failed);
      window.removeEventListener("folio-speech-stopped", stopped);
    };
  }, [text, followText, chapter]);
  function change(action: () => void) {
    const resume = active.current,
      until = deadline.current;
    pause();
    if (resume) deadline.current = until;
    pendingSettings.current = resume;
    action();
  }
  useEffect(() => {
    if (pendingSettings.current) {
      pendingSettings.current = false;
      playRef.current();
    }
  }, [language, voice, rate, scope]);
  function jumpChapter(next: number) {
    if (next === chapter) return;
    const resume = active.current,
      until = deadline.current;
    pause();
    if (resume) deadline.current = until;
    pendingChapter.current = resume;
    setChapter(next);
    setIndex(0);
    onNavigate(chapters[next].href);
  }
  useEffect(() => {
    if (pendingChapter.current) {
      pendingChapter.current = false;
      playRef.current();
    }
  }, [chapter]);
  function fromCurrent() {
    const target = currentText?.replace(/\s+/g, " ").trim().slice(0, 80);
    if (target) {
      const offset = text.indexOf(target);
      let position = 0;
      const found = segments.findIndex((s) => {
        const matches = offset >= position && offset < position + s.length;
        position += s.length;
        return matches;
      });
      if (found >= 0) {
        setIndex(found);
        anchorTime(timeline[found]?.start || 0);
        return found;
      }
    }
  }
  if (minimized)
    return (
      <div className="audio-mini audio-mini-v2">
        <button
          className="audio-mini-title"
          onClick={() => setMinimized(false)}
        >
          {book.cover && <img src={book.cover} alt="" />}
          <span>
            <strong>{book.title}</strong>
            <small>{chapters[chapter]?.label}</small>
          </span>
        </button>
        <button aria-label="Voltar 30 segundos" onClick={() => skip(-30)}>
          <RotateCcw size={20} />
        </button>
        <button
          aria-label={playing ? "Pausar" : "Ouvir"}
          onClick={() => (playing ? pause() : void play())}
        >
          {playing ? <Pause size={23} /> : <Play size={23} />}
        </button>
        <button aria-label="Encerrar" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    );
  return (
    <section
      ref={screen}
      className="audio-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Ouvir livro"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (options) setOptions(false);
          else setMinimized(true);
        }
        if (event.key === "Tab") {
          const root = options
            ? screen.current?.querySelector(".audio-settings")
            : screen.current;
          const elements = Array.from(
            root?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),select:not(:disabled),input:not(:disabled)",
            ) || [],
          );
          const first = elements[0],
            last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      {book.cover && (
        <div
          className="audio-backdrop"
          style={{ backgroundImage: `url(${book.cover})` }}
        />
      )}
      <header className="audio-screen-header">
        <button
          aria-label="Minimizar player"
          onClick={() => setMinimized(true)}
        >
          <ChevronDown size={26} />
        </button>
        <span>OUVINDO AGORA</span>
        <button
          aria-label="Opções de áudio"
          aria-expanded={options}
          onClick={() => setOptions(!options)}
        >
          <Settings2 size={22} />
        </button>
      </header>
      <div className="audio-screen-content">
        <div className="audio-cover">
          {book.cover ? (
            <img src={book.cover} alt={`Capa de ${book.title}`} />
          ) : (
            <BookOpen size={90} />
          )}
        </div>
        <div className="audio-title">
          <h1>{book.title}</h1>
          <p>{book.author}</p>
        </div>
        <label className="audio-chapter-picker">
          <List size={23} />
          <select
            aria-label="Capítulo"
            value={chapter}
            disabled={scope === "selection"}
            onChange={(event) => jumpChapter(Number(event.target.value))}
          >
            {chapters.map((item, i) => (
              <option key={item.id} value={i}>
                {i + 1}. {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="audio-pills">
          <button
            onClick={() => {
              onNavigate(
                chapters[chapter]?.href || currentHref,
                segments[index],
              );
              setMinimized(true);
            }}
          >
            <BookOpen size={16} />
            Voltar ao texto neste trecho
          </button>
          <button
            aria-pressed={followText}
            onClick={() => setFollowText(!followText)}
          >
            {followText ? "Texto acompanha o áudio" : "Acompanhar texto"}
          </button>
        </div>
        <div className="audio-timeline">
          <input
            aria-label="Posição do áudio"
            type="range"
            min="0"
            max={Math.max(1, totalSeconds)}
            step="0.1"
            value={elapsedSeconds}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <div>
            <span>{time(elapsedSeconds)}</span>
            <span>−{time(Math.max(0, totalSeconds - elapsedSeconds))}</span>
          </div>
          <small>Duração estimada · voz do aparelho</small>
        </div>
        <div className="audio-transport">
          <button
            aria-label="Capítulo anterior"
            disabled={!chapter || scope === "selection"}
            onClick={() => jumpChapter(chapter - 1)}
          >
            <SkipBack size={26} />
          </button>
          <button
            className="audio-skip"
            aria-label="Voltar 30 segundos"
            onClick={() => skip(-30)}
          >
            <RotateCcw size={34} />
            <span>30</span>
          </button>
          <button
            className="audio-play"
            aria-label={playing ? "Pausar" : "Ouvir"}
            disabled={!text}
            onClick={() => (playing ? pause() : void play())}
          >
            {playing ? (
              <Pause size={42} fill="currentColor" />
            ) : (
              <Play size={42} fill="currentColor" />
            )}
          </button>
          <button
            className="audio-skip"
            aria-label="Avançar 30 segundos"
            onClick={() => skip(30)}
          >
            <RotateCw size={34} />
            <span>30</span>
          </button>
          <button
            aria-label="Próximo capítulo"
            disabled={chapter + 1 >= chapters.length || scope === "selection"}
            onClick={() => jumpChapter(chapter + 1)}
          >
            <SkipForward size={26} />
          </button>
        </div>
        <div className="audio-tools">
          <button onClick={() => setOptions(true)}>
            <strong>{rate.toLocaleString("pt-BR")}×</strong>
            <span>Velocidade</span>
          </button>
          <button onClick={() => setOptions(true)}>
            <Volume2 size={25} />
            <span>Voz e idioma</span>
          </button>
          <button onClick={() => setOptions(true)}>
            <Timer size={25} />
            <span>{timer ? `${timer} min` : "Timer"}</span>
          </button>
          <button aria-pressed={marked} onClick={onBookmark}>
            <Bookmark size={25} fill={marked ? "currentColor" : "none"} />
            <span>{marked ? "Marcado" : "+ Marcação"}</span>
          </button>
        </div>
        <p className="audio-current-excerpt">
          {segments[index]?.slice(0, 160)}
        </p>
        {error && (
          <p className="audio-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {options && (
        <div className="audio-settings-overlay">
          <section
            className="audio-settings"
            role="dialog"
            aria-label="Configurar áudio"
          >
            <header>
              <h2>Seu áudio</h2>
              <button
                aria-label="Fechar opções de áudio"
                onClick={() => setOptions(false)}
              >
                <X size={22} />
              </button>
            </header>
            <label>
              O que ouvir
              <select
                aria-label="O que ouvir"
                value={scope}
                onChange={(event) =>
                  change(() => {
                    setScope(event.target.value);
                    setIndex(0);
                  })
                }
              >
                <option value="current">Capítulo</option>
                {selection && (
                  <option value="selection">Trecho selecionado</option>
                )}
              </select>
            </label>
            <label>
              Idioma
              <select
                aria-label="Idioma"
                value={language}
                onChange={(event) =>
                  change(() => {
                    setLanguage(event.target.value);
                    setVoice("");
                  })
                }
              >
                {Array.from(
                  new Set([language, ...voices.map((v) => v.language)]),
                )
                  .sort()
                  .map((item) => (
                    <option key={item}>{item}</option>
                  ))}
              </select>
            </label>
            <label>
              Voz
              <select
                aria-label="Voz"
                value={voice}
                onChange={(event) => change(() => setVoice(event.target.value))}
              >
                <option value="">Padrão do aparelho</option>
                {voices
                  .filter((v) => v.language === language)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.network ? " · online" : " · offline"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Velocidade: {rate}×
              <input
                aria-label="Velocidade"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={rate}
                onChange={(event) =>
                  change(() => setRate(Number(event.target.value)))
                }
              />
            </label>
            <label>
              Temporizador
              <select
                aria-label="Temporizador"
                value={timer}
                onChange={(event) => {
                  const minutes = Number(event.target.value);
                  setTimer(minutes);
                  deadline.current =
                    active.current && minutes
                      ? Date.now() + minutes * 60000
                      : 0;
                  void window.folio?.speechTimer?.(deadline.current);
                }}
              >
                {[0, 5, 15, 30, 60].map((item) => (
                  <option key={item} value={item}>
                    {item ? `${item} minutos` : "Desligado"}
                  </option>
                ))}
              </select>
            </label>
            <label className="audio-checkbox">
              <input
                type="checkbox"
                checked={continuous}
                onChange={(event) => setContinuous(event.target.checked)}
              />
              Continuar no próximo capítulo
            </label>
            <label className="audio-checkbox">
              <input
                type="checkbox"
                checked={followText}
                onChange={(event) => setFollowText(event.target.checked)}
              />
              Virar páginas junto com o áudio
            </label>
            <button
              className="audio-start-current"
              onClick={() => {
                pause();
                const start = fromCurrent();
                void play(start ?? index);
                setOptions(false);
              }}
            >
              A partir do parágrafo atual
            </button>
            <p>Voz sintética. Ao pausar, retoma no início do trecho atual.</p>
            <button
              className="audio-start-current"
              onClick={() => setOptions(false)}
            >
              Pronto
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
