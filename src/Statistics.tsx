import { useEffect, useMemo, useState, useRef } from "react";
import {
  Clock,
  Flame,
  Target,
  TrendingUp,
  CalendarDays,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings2,
  X,
  Headphones,
} from "lucide-react";
import ReadingInsights from "./ReadingInsights";
import { loadMetrics, saveMetricsPreferences } from "./metrics-store";
import {
  dayKey,
  addDays,
  dateOf,
  formatTime,
  summarize,
  movePeriod,
  metricsCSV,
  type MetricsData,
  type Period,
} from "./metrics";
import type { BookRecord } from "./types";
const periods: { value: Period; label: string }[] = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];
const dateLabel = (d: string) =>
  dateOf(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
export default function Statistics({
  books,
  onOpen,
}: {
  books: BookRecord[];
  onOpen: (b: BookRecord) => void;
}) {
  const [tab, setTab] = useState("overview"),
    [annualGoal, setAnnualGoal] = useState(
      () =>
        Number(
          localStorage.getItem("folio:annual-goal:" + new Date().getFullYear()),
        ) || 12,
    );
  const [data, setData] = useState<MetricsData | null>(null),
    [period, setPeriod] = useState<Period>("week"),
    [anchor, setAnchor] = useState(dayKey(Date.now())),
    [error, setError] = useState(""),
    [prefs, setPrefs] = useState(false),
    [goal, setGoal] = useState(20),
    [idle, setIdle] = useState(120),
    [selected, setSelected] = useState<string | null>(null);
  const [today, setToday] = useState(dayKey(Date.now()));
  const dayRef = useRef(today);
  useEffect(() => {
    const refreshDay = () => {
      const next = dayKey(Date.now());
      if (next !== dayRef.current) {
        const previous = dayRef.current;
        dayRef.current = next;
        setToday(next);
        setAnchor((old) => (old === previous ? next : old));
      }
    };
    const timer = setInterval(refreshDay, 60000);
    window.addEventListener("folio-app-state", refreshDay);
    document.addEventListener("visibilitychange", refreshDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("folio-app-state", refreshDay);
      document.removeEventListener("visibilitychange", refreshDay);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void loadMetrics()
        .then((d) => {
          if (alive) {
            setData(d);
            setGoal(d.goalMinutes);
            setIdle(d.idleSeconds);
          }
        })
        .catch(() => setError("Não foi possível carregar as estatísticas."));
    };
    reload();
    window.addEventListener("folio-metrics-changed", reload);
    return () => {
      alive = false;
      window.removeEventListener("folio-metrics-changed", reload);
    };
  }, []);
  const s = useMemo(
    () => (data ? summarize(data, period, anchor, today) : null),
    [data, period, anchor, today],
  );
  async function exportData(format: "csv" | "json") {
    if (!data) return;
    const text =
        format === "csv" ? metricsCSV(data) : JSON.stringify(data, null, 2),
      name = `folio-estatisticas-${today}.${format}`;
    try {
      if (window.folio) await window.folio.exportFile(name, text);
      else {
        const u = URL.createObjectURL(
          new Blob([text], {
            type: format === "csv" ? "text/csv" : "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = u;
        a.download = name;
        a.click();
        URL.revokeObjectURL(u);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!data || !s)
    return (
      <div className="empty-state" role={error ? "alert" : undefined}>
        {error || "Carregando suas estatísticas…"}
      </div>
    );
  const totalAll = data.spans.reduce((v, p) => v + p.durationMs, 0),
    todayMs = s.days.get(today) || 0,
    goalRatio = Math.min(1, todayMs / (data.goalMinutes * 60000));
  const highest = Math.max(60000, ...s.buckets.map((v) => v.ms));
  const chosen = s.buckets.find((v) => v.key === selected);
  const firstWeek = addDays(today, -((dateOf(today).getDay() + 6) % 7) - 84);
  const heat = Array.from({ length: 91 }, (_, i) => addDays(firstWeek, i));
  const comparison =
    s.changePercent === null
      ? s.comparisonMs
        ? "Sem leitura no período anterior"
        : "Ainda sem base anterior"
      : `${s.changePercent >= 0 ? "+" : ""}${Math.round(s.changePercent)}% em relação ao anterior`;
  return (
    <div className="statistics" data-tab={tab}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">SEU TEMPO, SUAS HISTÓRIAS</div>
          <h1>
            Seu ritmo de leitura<span>.</span>
          </h1>
          <p>Veja como um capítulo por vez se transforma em hábito.</p>
        </div>
        <button className="stats-prefs-button" onClick={() => setPrefs(!prefs)}>
          <Settings2 size={16} />
          Meta e contagem
        </button>
      </div>
      <nav
        className="stats-navigation"
        role="tablist"
        aria-label="Organizar estatísticas"
      >
        {[
          ["overview", "Visão geral"],
          ["history", "Histórico"],
          ["books", "Livros"],
          ["profile", "Perfil"],
        ].map(([id, label]) => (
          <button
            role="tab"
            id={`stats-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="stats-panel"
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        role="tabpanel"
        id="stats-panel"
        aria-labelledby={`stats-tab-${tab}`}
      >
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {prefs && (
          <form
            className="stats-settings"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveMetricsPreferences(goal, idle);
                localStorage.setItem(
                  "folio:annual-goal:" + new Date().getFullYear(),
                  String(annualGoal),
                );
                setPrefs(false);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <label className="form-field">
              Meta diária (minutos)
              <input
                aria-label="Meta diária em minutos"
                type="number"
                min="1"
                max="240"
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              Pausar após inatividade
              <select
                aria-label="Limite de inatividade"
                value={idle}
                onChange={(e) => setIdle(Number(e.target.value))}
              >
                <option value="60">1 minuto</option>
                <option value="120">2 minutos</option>
                <option value="300">5 minutos</option>
                <option value="600">10 minutos</option>
              </select>
            </label>
            <label className="form-field">
              Meta de livros neste ano
              <input
                aria-label="Meta anual de livros"
                type="number"
                min="1"
                max="500"
                value={annualGoal}
                onChange={(event) =>
                  setAnnualGoal(
                    Math.max(1, Math.min(500, Number(event.target.value))),
                  )
                }
              />
            </label>
            <button className="primary-button">Salvar meta</button>
          </form>
        )}
        <section className="stats-sequence-panel">
          <h2>Sequência de leitura</h2>
          <p className="stats-encouragement">
            {s.streak.todayMet
              ? "Você já reservou um tempo para ler hoje."
              : s.streak.current
                ? "Uma página hoje mantém seu hábito vivo."
                : "Seu próximo minuto pode começar um novo hábito."}
          </p>
          <div className="stats-sequence-badges">
            <div>
              <Flame size={48} />
              <strong>{s.streak.current} dias seguidos</strong>
              <span>Sequência atual</span>
            </div>
            <div>
              <Flame size={48} />
              <strong>{s.streak.longest} dias</strong>
              <span>Seu recorde</span>
            </div>
          </div>
          <div className="stats-week-strip">
            {Array.from({ length: 7 }, (_, i) =>
              addDays(today, -dateOf(today).getDay() + i),
            ).map((day) => (
              <button
                key={day}
                disabled={day > today || day < data.firstDay}
                aria-label={`Ver leitura de ${dateLabel(day)}`}
                aria-current={day === today ? "date" : undefined}
                className={(s.days.get(day) || 0) >= 60000 ? "day-read" : ""}
                onClick={() => {
                  setPeriod("day");
                  setAnchor(day);
                  setTab("history");
                }}
              >
                <span>
                  {dateOf(day).toLocaleDateString("pt-BR", {
                    weekday: "short",
                  })}
                </span>
                <span>
                  {(s.days.get(day) || 0) >= 60000 ? <Flame size={20} /> : null}
                  <b>{dateOf(day).getDate()}</b>
                </span>
              </button>
            ))}
          </div>
          <button className="stats-link" onClick={() => setTab("history")}>
            Detalhes da sequência <ChevronRight size={18} />
          </button>
        </section>
        <section className="stats-habit-row">
          <article className="habit-card">
            <Flame size={24} />
            <div>
              <strong>
                {s.streak.current}
                <small> dias seguidos</small>
              </strong>
              <p>Recorde: {s.streak.longest} dias · mínimo de 1 min/dia</p>
              <span>
                {s.streak.todayMet
                  ? "Sequência mantida hoje ✓"
                  : s.streak.current
                    ? "Leia hoje para manter sua sequência."
                    : "Seu próximo minuto começa a sequência."}
              </span>
            </div>
          </article>
          <article className="habit-card goal-card">
            <div
              className="goal-ring"
              style={{
                background: `conic-gradient(var(--accent) ${goalRatio * 360}deg,var(--border) 0)`,
              }}
            >
              <span>{Math.round(goalRatio * 100)}%</span>
            </div>
            <div>
              <strong>
                {formatTime(todayMs)}
                <small> hoje</small>
              </strong>
              <p>Meta: {data.goalMinutes} min por dia</p>
              <span>
                {todayMs >= data.goalMinutes * 60000
                  ? "Meta de hoje atingida ✓"
                  : `Faltam ${formatTime(data.goalMinutes * 60000 - todayMs)} para a meta.`}
              </span>
            </div>
          </article>
        </section>
        <section className="stats-year-challenge">
          <div className="stats-year-badge">
            <strong>{today.slice(0, 4)}</strong>
            <BookOpen size={38} />
          </div>
          <div>
            <h2>Desafio de leitura</h2>
            <p>
              {
                new Set(
                  data.completions
                    .filter((c) => c.day.startsWith(today.slice(0, 4)))
                    .map((c) => c.bookId),
                ).size
              }{" "}
              de {annualGoal} livros concluídos neste ano
            </p>
            <progress
              max={annualGoal}
              value={
                new Set(
                  data.completions
                    .filter((c) => c.day.startsWith(today.slice(0, 4)))
                    .map((c) => c.bookId),
                ).size
              }
            />
          </div>
          <button className="stats-goal-action" onClick={() => setPrefs(true)}>
            Estabelecer uma meta
          </button>
        </section>
        <div className="stats-period-bar">
          <div className="stats-period-tabs">
            {periods.map((p) => (
              <button
                key={p.value}
                className={period === p.value ? "active" : ""}
                aria-pressed={period === p.value}
                onClick={() => {
                  setPeriod(p.value);
                  setSelected(null);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="stats-date-picker">
            <button
              aria-label="Período anterior"
              onClick={() => setAnchor(movePeriod(period, anchor, -1))}
            >
              <ChevronLeft size={17} />
            </button>
            <label>
              Data de referência
              <input
                aria-label="Data de referência"
                type="date"
                max={today}
                value={anchor}
                onChange={(e) => {
                  if (e.target.value) setAnchor(e.target.value);
                }}
              />
            </label>
            <button
              aria-label="Próximo período"
              disabled={movePeriod(period, anchor, 1) > today}
              onClick={() => setAnchor(movePeriod(period, anchor, 1))}
            >
              <ChevronRight size={17} />
            </button>
            <button className="today-button" onClick={() => setAnchor(today)}>
              Hoje
            </button>
          </div>
        </div>
        <div className="stats-range-label">
          {dateLabel(s.range.start)}
          {s.range.end !== s.range.start ? ` — ${dateLabel(s.range.end)}` : ""}
          <span>
            {s.end === today ? "Período atual · dia de hoje parcial" : ""}
          </span>
        </div>
        <section className="stats-cards">
          <Metric
            icon={<Clock size={18} />}
            label="Tempo de leitura"
            value={formatTime(s.totalMs)}
            detail={
              s.listenMs
                ? `${formatTime(s.readMs)} na página · ${formatTime(s.listenMs)} em voz`
                : "Tempo ativo com o livro na tela"
            }
          />
          <Metric
            icon={<CalendarDays size={18} />}
            label="Dias com leitura"
            value={`${s.activeDays} / ${s.count}`}
            detail={`${s.goalDays} dias atingiram a meta`}
          />
          <Metric
            icon={<BookOpen size={18} />}
            label="Livros no período"
            value={String(s.books.length)}
            detail={`${s.completionCount} marcados concluídos`}
          />
          <Metric
            icon={<TrendingUp size={18} />}
            label="Média por dia"
            value={formatTime(s.averageDay)}
            detail="Inclui dias sem leitura"
          />
          <Metric
            icon={<Clock size={18} />}
            label="Sessões de leitura"
            value={String(s.sessionCount)}
            detail={`${formatTime(s.averageSession)} em média por sessão`}
          />
          <Metric
            icon={<Target size={18} />}
            label="Sequência da meta"
            value={`${s.goalStreak.current} dias`}
            detail={`Recorde: ${s.goalStreak.longest} dias de meta`}
          />
        </section>
        <section className="stats-chart-card">
          <div className="stats-card-heading">
            <div>
              <h2>Tempo que vira leitura</h2>
              <p>
                {period === "day"
                  ? "Por hora do dia"
                  : period === "year"
                    ? "Por mês do ano"
                    : "Por dia do período"}
              </p>
            </div>
            <span className="stats-change">{comparison}</span>
          </div>
          <div
            className={`reading-bars bars-${period}`}
            role="group"
            aria-label="Gráfico de tempo de leitura"
          >
            {s.buckets.map((b, i) => (
              <button
                key={b.key}
                aria-label={`${b.label}: ${formatTime(b.ms)}`}
                aria-pressed={selected === b.key}
                title={formatTime(b.ms)}
                onClick={() => setSelected(b.key)}
              >
                <div className="bar-area">
                  <span
                    className={selected === b.key ? "chosen" : ""}
                    style={{
                      height: `${Math.max(b.ms ? 3 : 1, (b.ms / highest) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {period === "day" && i % 3 !== 0
                    ? ""
                    : period === "month" &&
                        i % 5 !== 0 &&
                        i !== s.buckets.length - 1
                      ? ""
                      : b.label}
                </small>
              </button>
            ))}
          </div>
          <div className="chart-selection">
            {chosen
              ? `${chosen.label} · ${formatTime(chosen.ms)}`
              : "Toque em uma barra para ver o tempo."}
          </div>
        </section>
        <div className="stats-two-columns">
          <section className="stats-detail-card stats-comparison-panel">
            <h2>Como você está evoluindo</h2>
            {s.compareDays > 0 ? (
              <>
                <div className="comparison-row">
                  <span>Neste período*</span>
                  <strong>{formatTime(s.comparisonMs)}</strong>
                </div>
                <div className="comparison-row">
                  <span>Período anterior*</span>
                  <strong>{formatTime(s.previousMs)}</strong>
                </div>
                <p className="stat-explanation">
                  * {s.compareDays} dias correspondentes com registro em ambos
                  os períodos, começando em{" "}
                  {dateLabel(s.comparisonCurrentStart)} e{" "}
                  {dateLabel(s.comparisonPreviousStart)}. O dia atual ainda está
                  em andamento.
                </p>
              </>
            ) : (
              <p className="stat-explanation">
                Ainda não há dias correspondentes registrados no período
                anterior. A comparação aparece conforme seu histórico cresce.
              </p>
            )}
            <div className="divider" />
            <div className="comparison-row">
              <span>Sua média histórica diária</span>
              <strong>
                {s.historicalCount
                  ? formatTime(s.historicalAverage)
                  : "Ainda sem histórico"}
              </strong>
            </div>
            <p className="stat-explanation">
              {s.historicalCount
                ? `${s.historicalCount} dias completos anteriores desde a ativação, incluindo dias sem leitura. Exclui hoje e o primeiro dia se a ativação ocorreu após meia-noite.`
                : "A média histórica aparece após o primeiro dia completo de registro."}
            </p>
            {s.bestDay && (
              <div className="best-day">
                <CalendarDays size={16} />
                <div>
                  <span>Seu melhor dia no período</span>
                  <strong>
                    {dateLabel(s.bestDay.day)} · {formatTime(s.bestDay.ms)}
                  </strong>
                </div>
              </div>
            )}
          </section>
          <section className="stats-detail-card stats-calendar-panel">
            <h2>Seu calendário de leitura</h2>
            <p className="stat-explanation">
              Últimas 13 semanas · toque para abrir um dia
            </p>
            <div className="heatmap-layout">
              <div className="heatmap-weekdays">
                {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="reading-heatmap">
                {heat.map((day) => {
                  const ms = s.days.get(day) || 0,
                    level = !ms
                      ? 0
                      : ms < 60000
                        ? 1
                        : ms < data.goalMinutes * 60000
                          ? 2
                          : ms < data.goalMinutes * 120000
                            ? 3
                            : 4;
                  return (
                    <button
                      key={day}
                      className={
                        day < data.firstDay ? "heat-unknown" : `heat-${level}`
                      }
                      disabled={day > today || day < data.firstDay}
                      aria-label={`${dateLabel(day)}: ${day < data.firstDay ? "Sem histórico antes da ativação" : formatTime(ms)}`}
                      title={`${dateLabel(day)} · ${day < data.firstDay ? "Sem histórico antes da ativação" : formatTime(ms)}`}
                      onClick={() => {
                        setPeriod("day");
                        setAnchor(day);
                        setSelected(null);
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="heatmap-legend">
              Menos{" "}
              {[0, 1, 2, 3, 4].map((n) => (
                <span className={`heat-${n}`} key={n} />
              ))}{" "}
              Mais
            </div>
            <div className="lifetime-note">
              Você já dedicou <strong>{formatTime(totalAll)}</strong> às suas
              leituras.
            </div>
          </section>
        </div>
        <div className="stats-two-columns stats-book-time-group">
          <section className="stats-detail-card stats-books-panel">
            <h2>Livros que receberam seu tempo</h2>
            {s.books.length ? (
              s.books.slice(0, 8).map((b, i) => (
                <button
                  className="stats-book-row"
                  key={b.id}
                  disabled={!books.some((v) => v.id === b.id)}
                  onClick={() => {
                    const item = books.find((v) => v.id === b.id);
                    if (item) onOpen(item);
                  }}
                >
                  <span className="stats-book-index">{i + 1}</span>
                  <div>
                    <strong>{b.title}</strong>
                    <small>
                      {b.author} · {b.sessions.size} sessões
                    </small>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${s.totalMs ? (b.ms / s.totalMs) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span>{formatTime(b.ms)}</span>
                </button>
              ))
            ) : (
              <p className="stats-empty">
                Abra um livro e comece a ler para registrar seu tempo.
              </p>
            )}
          </section>
          <section className="stats-detail-card stats-hours-panel">
            <h2>Quando você costuma ler</h2>
            <div className="time-of-day">
              {s.times.map((t) => (
                <div key={t.label}>
                  <span>{t.label}</span>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${s.totalMs ? (t.ms / s.totalMs) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{formatTime(t.ms)}</strong>
                </div>
              ))}
            </div>
            <div className="divider" />
            <h3>Leitura e voz</h3>
            <div className="comparison-row">
              <span>
                <BookOpen size={14} /> Na página
              </span>
              <strong>{formatTime(s.readMs)}</strong>
            </div>
            <div className="comparison-row">
              <span>
                <Headphones size={14} /> Em voz alta
              </span>
              <strong>{formatTime(s.listenMs)}</strong>
            </div>
          </section>
        </div>
        <section className="stats-detail-card sessions-card">
          <div className="stats-card-heading">
            <h2>Sessões recentes no período</h2>
            <div className="stats-export">
              <button onClick={() => void exportData("csv")}>
                <Download size={14} />
                CSV diário
              </button>
              <button onClick={() => void exportData("json")}>
                <Download size={14} />
                JSON completo
              </button>
            </div>
          </div>
          {s.sessions.length ? (
            s.sessions.slice(0, 8).map((v) => (
              <div className="session-row" key={v.id}>
                <Clock size={16} />
                <div>
                  <strong>{v.title}</strong>
                  <span>
                    {new Date(v.start).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <strong>{formatTime(v.ms)}</strong>
              </div>
            ))
          ) : (
            <p className="stats-empty">Nenhuma sessão neste período.</p>
          )}
        </section>
        <ReadingInsights books={books} data={data} onOpen={onOpen} />
        <div className="stats-method">
          <Clock size={18} />
          <p>
            <strong>Como contamos</strong> — livro visível, app em primeiro
            plano e interação recente. Painéis, chat e preferências pausam o
            contador. Após {data.idleSeconds / 60} min sem interação, a leitura
            silenciosa pausa; toque ou vire a página para continuar. Voz é
            registrada separadamente, somente com o app em primeiro plano. Uma
            sequência exige pelo menos 1 min/dia. Horários seguem o aparelho. Os
            registros começaram em <strong>{dateLabel(data.firstDay)}</strong>;
            leituras anteriores à atualização não são estimadas. Dados ficam
            neste dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
