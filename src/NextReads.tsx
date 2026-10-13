import type { BookRecord } from "./types";
import { loadProfile } from "./reading-profile";
export default function NextReads({
  books,
  onOpen,
  onSearch,
}: {
  books: BookRecord[];
  onOpen: (b: BookRecord) => void;
  onSearch: () => void;
}) {
  const favorites = books.filter((b) => b.favorite || b.finished);
  const ranked = books
    .filter((b) => !b.finished)
    .map((book) => {
      const profile = loadProfile(book.id);
      const author = favorites.some((b) => b.author === book.author);
      const theme =
        profile.theme !== "Sem tema" &&
        favorites.some((b) => loadProfile(b.id).theme === profile.theme);
      return {
        book,
        score: (book.progress > 0 ? 4 : 0) + (author ? 2 : 0) + (theme ? 1 : 0),
        reason:
          book.progress > 0
            ? "Continue uma leitura que já começou"
            : author
              ? "Autor presente nos seus favoritos ou concluídos"
              : theme
                ? "Um tema que você já explorou"
                : "Ainda não lido na sua biblioteca",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return (
    <section>
      <h1>
        Próximas leituras<span>.</span>
      </h1>
      <p>
        Sugestões da sua biblioteca, com base no que você começou, favoritou e
        concluiu.
      </p>
      <div className="next-reads">
        {ranked.map(({ book, reason }) => (
          <article key={book.id}>
            {book.cover && <img src={book.cover} alt="" />}
            <div>
              <h2>{book.title}</h2>
              <p>{book.author}</p>
              <p>{reason}</p>
              <button className="primary-button" onClick={() => onOpen(book)}>
                Ler agora
              </button>
            </div>
          </article>
        ))}
      </div>
      {!ranked.length && <p>Adicione livros para receber sugestões.</p>}
      <button onClick={onSearch}>Buscar outras leituras</button>
    </section>
  );
}
