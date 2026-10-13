import { useState } from "react";
import type { BookRecord } from "./types";
import type { MetricsData } from "./metrics";
import { formatTime, dayKey } from "./metrics";
import {
  loadProfile,
  readingEstimate,
  type ReadingProfile,
} from "./reading-profile";
export default function ReadingInsights({
  books,
  data,
  onOpen,
}: {
  books: BookRecord[];
  data: MetricsData;
  onOpen: (book: BookRecord) => void;
}) {
  const [revision, setRevision] = useState(0),
    [selected, setSelected] = useState(books[0]?.id || "");
  const book = books.find((b) => b.id === selected),
    profile = book ? loadProfile(book.id) : null;
  function update(patch: Partial<ReadingProfile>) {
    if (!book || !profile) return;
    localStorage.setItem(
      "folio:profile:" + book.id,
      JSON.stringify({ ...profile, ...patch }),
    );
    setRevision(revision + 1);
  }
  const categories = (field: "theme" | "language" | "author" | "format") => {
    const values = new Map<string, number>();
    for (const b of books) {
      const p = loadProfile(b.id),
        key =
          field === "author"
            ? b.author
            : field === "format"
              ? "EPUB"
              : p[field];
      values.set(key, (values.get(key) || 0) + 1);
    }
    return [...values].sort((a, b) => b[1] - a[1]);
  };
  const now = dayKey(Date.now()),
    month = now.slice(0, 7),
    year = now.slice(0, 4);
  return (
    <section className="stats-section reading-insights">
      <div className="insights-books-group">
        <h2>Seu ritmo e suas próximas páginas</h2>
        <p className="muted">
          Estimativas a partir do avanço e do tempo ativo registrados nesta
          versão. Áudio e releituras não entram no ritmo de leitura.
        </p>
        <div className="insight-books">
          {books.map((b) => {
            const estimate = readingEstimate(b, data);
            return (
              <article key={b.id}>
                <button
                  className="insight-book-title"
                  onClick={() => onOpen(b)}
                >
                  {b.cover && <img src={b.cover} alt="" />}
                  <strong>{b.title}</strong>
                </button>
                <progress value={b.progress} max="1" />
                <p>
                  {Math.round(b.progress * 100)}% lido ·{" "}
                  {estimate
                    ? `${formatTime(estimate.remainingMs)} restantes · ${Math.round(estimate.wordsPerMinute)} palavras/min`
                    : "Continue lendo para calcular seu ritmo"}
                </p>
                {estimate?.daysRemaining != null && (
                  <p>
                    Conclusão em cerca de {estimate.daysRemaining} dias de
                    leitura no ritmo atual.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <div className="insights-profile-group">
        <h2>Perfil de leitura</h2>
        {(["theme", "language", "author", "format"] as const).map(
          (field, i) => (
            <section className="profile-distribution" key={field}>
              <h3>{["Temas", "Idiomas", "Autores", "Formatos"][i]}</h3>
              {categories(field).length ? (
                categories(field).map(([name, count]) => (
                  <div className="profile-distribution-row" key={name}>
                    <span>{name}</span>
                    <strong>{count}</strong>
                    <progress max={Math.max(1, books.length)} value={count} />
                  </div>
                ))
              ) : (
                <p>Sem livros registrados.</p>
              )}
            </section>
          ),
        )}
        <label>
          Organizar livro
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        {profile && (
          <div className="profile-fields">
            <label>
              Tema
              <input
                key={selected + "theme"}
                defaultValue={profile.theme === "Sem tema" ? "" : profile.theme}
                placeholder="Ex.: Psicologia"
                onBlur={(e) =>
                  update({ theme: e.target.value.trim() || "Sem tema" })
                }
              />
            </label>
            <label>
              Idioma
              <input
                key={selected + "lang"}
                defaultValue={
                  profile.language === "Não informado" ? "" : profile.language
                }
                placeholder="Ex.: Português"
                onBlur={(e) =>
                  update({ language: e.target.value.trim() || "Não informado" })
                }
              />
            </label>
            <label>
              Palavras aprendidas (uma por linha)
              <textarea
                key={selected + "words"}
                defaultValue={profile.words.join("\n")}
                onBlur={(e) =>
                  update({
                    words: [
                      ...new Set(
                        e.target.value
                          .split("\n")
                          .map((w) => w.trim())
                          .filter(Boolean),
                      ),
                    ],
                  })
                }
              />
            </label>
          </div>
        )}
        <h2>Grifos e aprendizado</h2>
        <p>
          {books.reduce((n, b) => n + b.annotations.length, 0)} destaques ·{" "}
          {books.reduce(
            (n, b) => n + b.annotations.filter((a) => a.note).length,
            0,
          )}{" "}
          notas ·{" "}
          {books.reduce((n, b) => n + loadProfile(b.id).words.length, 0)}{" "}
          palavras aprendidas ·{" "}
          {books.reduce((n, b) => n + loadProfile(b.id).reviewed.length, 0)}{" "}
          destaques revisados
        </p>
        {book?.annotations.map((a) => (
          <label className="review-highlight" key={a.id}>
            <input
              type="checkbox"
              checked={profile?.reviewed.includes(a.id) || false}
              onChange={(e) =>
                update({
                  reviewed: e.target.checked
                    ? [...(profile?.reviewed || []), a.id]
                    : (profile?.reviewed || []).filter((id) => id !== a.id),
                })
              }
            />
            <span>
              {a.text.slice(0, 180)}
              {a.note && <small>{a.note}</small>}
            </span>
          </label>
        ))}
      </div>
      <div className="insights-retro-group">
        <h2>Retrospectiva</h2>
        {[month, year].map((prefix) => {
          const spans = data.spans.filter((s) => s.day.startsWith(prefix));
          const themes = new Map<string, number>();
          for (const span of spans) {
            const theme = loadProfile(span.bookId).theme;
            themes.set(theme, (themes.get(theme) || 0) + span.durationMs);
          }
          return (
            <article key={prefix}>
              <h3>{prefix === month ? "Este mês" : "Este ano"}</h3>
              <p>
                {
                  data.completions.filter((c) => c.day.startsWith(prefix))
                    .length
                }{" "}
                livros concluídos ·{" "}
                {formatTime(
                  spans
                    .filter((s) => s.mode === "read")
                    .reduce((a, s) => a + s.durationMs, 0),
                )}{" "}
                lidos ·{" "}
                {formatTime(
                  spans
                    .filter((s) => s.mode === "listen")
                    .reduce((a, s) => a + s.durationMs, 0),
                )}{" "}
                ouvidos
              </p>
              <p>
                Temas mais presentes:{" "}
                {[...themes]
                  .filter(([name]) => name !== "Sem tema")
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([name]) => name)
                  .join(", ") || "Cadastre os temas dos seus livros"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
