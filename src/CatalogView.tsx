import { useEffect, useRef, useState } from "react";
import {
  Search,
  Download,
  BookOpen,
  ArrowUpRight,
  Compass,
  ChevronLeft,
  ChevronRight,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  loadLocalCatalog,
  filterLocalBooks,
  searchRemote,
  cachedSearch,
  cacheSearch,
  type CatalogBook,
  type CatalogResult,
  type LocalCatalog,
  type DownloadOption,
  type CatalogLinks,
} from "./catalog";
import type { Settings, BookRecord, BookDownload } from "./types";
import { openExternal, Modal } from "./App";
export default function Catalog({
  settings,
  onImport,
  onDownload,
  books,
}: {
  settings: Settings;
  onImport: (files: File[]) => Promise<boolean | undefined>;
  onDownload: () => void;
  books: BookRecord[];
}) {
  const [query, setQuery] = useState(""),
    [language, setLanguage] = useState("pt"),
    [provider, setProvider] = useState<"gutenberg" | "anna">(settings.hasAnnaKey ? "anna" : "gutenberg"),
    [seed, setSeed] = useState<LocalCatalog | null>(null),
    [result, setResult] = useState<CatalogResult>({
      results: [],
      page: 1,
      hasMore: false,
    }),
    [loading, setLoading] = useState(false),
    [downloading, setDownloading] = useState(""),
    [error, setError] = useState(""),
    [origin, setOrigin] = useState(settings.hasAnnaKey ? "anna" : "local"),
    [quota, setQuota] = useState<{ remaining: number; perDay: number } | null>(null),
    [submitted, setSubmitted] = useState(""),
    [selectedBook, setSelectedBook] = useState<CatalogBook | null>(null),
    [links, setLinks] = useState<CatalogLinks>({ options: [] }),
    [linksLoading, setLinksLoading] = useState(false),
    [phase, setPhase] = useState<"download" | "import">("download");
  const linksGeneration = useRef(0), selectedRef = useRef(selectedBook), returnedCount = useRef(0);
  selectedRef.current = selectedBook;
  const generation = useRef(0),
    queryRef = useRef({ query, language, provider });
  queryRef.current = { query, language, provider };
  useEffect(() => {
    let live = true;
    loadLocalCatalog()
      .then((d) => {
        if (live) {
          setSeed(d);
          if (queryRef.current.provider === "gutenberg") setResult({ results: filterLocalBooks(d, queryRef.current.query, queryRef.current.language), page: 1, hasMore: false });
        }
      })
      .catch(() => {});
    void window.folio?.getSettings().then(s => {
      if (live) setQuota(s.annaQuota || null);
    }).catch(() => {});
    const returned = (event: Event) => {
      const value = (event as CustomEvent<CatalogResult>).detail;
      returnedCount.current++; generation.current++;
      setProvider("anna");
      if (typeof value.query === "string") { setQuery(value.query); setSubmitted(value.query); }
      setResult(value);
      setOrigin("anna");
      setLoading(false);
      setError(value.error || "");
    };
    window.addEventListener("folio-catalog-results", returned);
    const returnedLinks = (event: Event) => {
      const value = (event as CustomEvent<CatalogLinks & { sourceUrl?: string }>).detail;
      if (!selectedRef.current) return;
      if (value.sourceUrl) {
        try {
          const actual = new URL(value.sourceUrl), expected = new URL(selectedRef.current.url);
          if (actual.origin !== expected.origin || actual.pathname.replace(/\/$/, "").toLowerCase() !== expected.pathname.replace(/\/$/, "").toLowerCase()) return;
        } catch { return; }
      }
      linksGeneration.current++;
      setLinks(value); setLinksLoading(false);
    };
    window.addEventListener("folio-catalog-links", returnedLinks);
    return () => {
      live = false;
      generation.current++;
      window.removeEventListener("folio-catalog-results", returned);
      window.removeEventListener("folio-catalog-links", returnedLinks);
    };
  }, []);
  const canUsePremium = (book: CatalogBook) => !!settings.hasAnnaKey && !!window.folio?.downloadAnna && book.format.toLowerCase() === "epub" && /^[a-f0-9]{32}$/i.test(book.md5 || book.id);
  async function search(page = 1, forceRemote = false) {
    const id = ++generation.current;
    const q = query.trim();
    setError("");
    setSubmitted(q);
    if (q !== submitted) setResult({ results: [], page: 1, hasMore: false });
    if (provider === "anna" && settings.supportsIntegratedCatalog && window.folio?.openCatalog) {
      setLoading(true);
      const before = returnedCount.current;
      await insideCatalog(annaURL(page), "search");
      if (before === returnedCount.current) setError("A busca integrada foi fechada antes de carregar os resultados. Você pode reabri-la abaixo.");
      setLoading(false); return;
    }
    let hasImmediate = false;
    if (provider === "gutenberg" && page === 1 && seed && !forceRemote) {
      const found = filterLocalBooks(seed, q, language);
      if (found.length) {
        setResult({ results: found, page: 1, hasMore: false });
        setOrigin("local");
        hasImmediate = true;
        setLoading(false);
        return;
      }
    }
    if (provider === "gutenberg") {
      const cached = await cachedSearch(q, language, page).catch(() => null);
      if (id !== generation.current) return;
      if (cached) {
        setResult(cached);
        setOrigin("cache");
        hasImmediate = true;
      }
    }
    setLoading(true);
    try {
      const value =
        provider === "anna"
          ? await (window.folio?.searchCatalog
              ? window.folio.searchCatalog({
                  query: q,
                  language,
                  format: "epub",
                  page,
                })
              : Promise.reject(
                  new Error(
                    "A busca no Anna’s Archive está disponível no APK Android.",
                  ),
                ))
          : await searchRemote(q, language, page);
      if (id !== generation.current) return;
      setResult(value);
      setOrigin(provider === "anna" ? "anna" : "api");
      if (provider === "gutenberg")
        void cacheSearch(q, language, page, value).catch(() => {});
      if (value.error) setError(value.error);
    } catch (e) {
      if (id === generation.current)
        setError(
          hasImmediate
            ? "A API não respondeu; os resultados salvos continuam disponíveis."
            : (e as Error).message,
        );
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  async function downloadBook(book: CatalogBook, option?: DownloadOption) {
    if (downloading) return;
    setError("");
    const premium = canUsePremium(book) && (!option || option.kind === "premium");
    const direct = option?.kind === "direct" ? option.url : book.downloadUrl;
    if (option?.kind === "page" || (!direct && !premium)) {
      await insideCatalog(option?.url || book.url);
      return;
    }
    if (!window.folio) {
      setError("Abra o APK Folio para baixar e importar com um toque.");
      return;
    }
    setDownloading(book.id);
    setPhase("download");
    try {
      const r: BookDownload = premium
        ? await window.folio.downloadAnna!(book.md5 || book.id, option ? { pathIndex: option.pathIndex, domainIndex: option.domainIndex } : undefined)
        : await window.folio.download(direct!);
      if (r.quota) setQuota(r.quota);
      const bytes = Uint8Array.from(r.data);
      setPhase("import");
      const ok = await onImport([
        new File([bytes.buffer], r.name, { type: "application/epub+zip" }),
      ]);
      if (ok === false)
        throw new Error("O EPUB recebido não pôde ser importado.");
    } catch (e) {
      setError((e as Error).message);
      if ((e as { code?: string }).code === "ANNA_VERIFICATION") setResult(r => ({ ...r, challenge: true }));
    } finally {
      setDownloading("");
    }
  }
  async function insideCatalog(url: string, collect?: "search" | "links") {
    try {
      if (window.folio?.openCatalog) await window.folio.openCatalog(url, collect ? { collect } : undefined);
      else await openExternal(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const annaURL = (page = 1) => {
    const url = new URL("/search", settings.annaUrl);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("ext", "epub");
    if (language) url.searchParams.set("lang", language);
    url.searchParams.set("display", "list_compact");
    if (page > 1) url.searchParams.set("page", String(page));
    return url.href;
  };
  async function showLinks(book: CatalogBook) {
    const id = ++linksGeneration.current;
    setSelectedBook(book);
    setLinksLoading(false);
    const options: DownloadOption[] = book.downloadUrl
      ? [{ id: "direct", label: "EPUB · download direto", url: book.downloadUrl, kind: "direct" }]
      : canUsePremium(book) ? [{ id: "premium-default", label: "API premium · servidor padrão", url: book.url, kind: "premium", pathIndex: 0, domainIndex: 0 }] : [];
    setLinks({ options });
    if (!/^[a-f0-9]{32}$/i.test(book.md5 || book.id) || !window.folio?.catalogLinks) return;
    setLinksLoading(true);
    try {
      const value = await window.folio.catalogLinks(book.url);
      if (id !== linksGeneration.current) return;
      setLinks({ ...value, options: value.options.length ? value.options : options });
    } catch (e) { if (id === linksGeneration.current) setLinks({ options, error: (e as Error).message }); }
    finally { if (id === linksGeneration.current) setLinksLoading(false); }
  }
  return (
    <div className="catalog-native catalog-v4">
      <h1>Buscar livros<span>.</span></h1>
      <p className="intro">
        Busque, escolha um link e baixe para sua biblioteca.
      </p>
      <form
        className="native-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="catalog-search">
          <Search size={18} />
          <input
            aria-label="Buscar título ou autor no catálogo"
            placeholder="Dom Casmurro, Machado de Assis…"
            value={query}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="primary-button"
            aria-label="Buscar"
            disabled={loading && provider === "anna"}
          >
            <span className="search-button-caption">{loading ? "Buscando…" : "Buscar"}</span>
            <Search size={15} />
          </button>
        </div>
        <div className="catalog-filters">
          <label>
            Catálogo
            <select
              aria-label="Fonte do catálogo"
              value={provider}
              onChange={(e) => {
                generation.current++;
                setLoading(false);
                setError("");
                setProvider(e.target.value as typeof provider);
                setResult({
                  results:
                    e.target.value === "gutenberg" && seed
                      ? filterLocalBooks(seed, query, language)
                      : [],
                  page: 1,
                  hasMore: false,
                });
                setOrigin(e.target.value === "gutenberg" ? "local" : "anna");
              }}
            >
              <option value="gutenberg">Gutenberg · download direto</option>
              <option value="anna">Anna’s Archive</option>
            </select>
          </label>
          <label>
            Idioma
            <select
              aria-label="Idioma dos livros"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="pt">Português</option>
              <option value="">Todos os idiomas</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
              <option value="fr">Francês</option>
            </select>
          </label>
          <button type="button" className="text-button" onClick={onDownload}>
            <Download size={14} />
            Importar link
          </button>
        </div>
      </form>
      {provider === "anna" && settings.hasAnnaKey && (
        <p className="catalog-premium-status"><Check size={13} /> Premium configurado</p>
      )}
      {provider === "anna" && settings.hasAnnaKey && quota && <p className="catalog-premium-status" role="status">Última franquia informada pela API: {quota.remaining} downloads disponíveis · plano de {quota.perDay} por dia.</p>}
      {(result.challenge || (provider === "anna" && error)) && (
        <section className="catalog-challenge">
          <Compass size={22} />
          <h2>{result.challenge ? "O catálogo pediu uma verificação" : "A busca não carregou"}</h2>
          <p>
            {result.challenge ? "Conclua a verificação do site. Assim que a página carregar, os livros voltam automaticamente para esta lista." : error}
          </p>
          <button
            className="primary-button"
            onClick={() => void insideCatalog(annaURL(), "search")}
          >
            Abrir busca dentro do app
            <ArrowUpRight size={16} />
          </button>
        </section>
      )}
      {error && provider !== "anna" && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="catalog-loading" role="status">Carregando os resultados…</p>}
      {!loading && (submitted || result.results.length > 0) && (!error || result.results.length > 0) && <div className="catalog-results-heading">
        <div>
          <strong>
            {result.results.length} {result.results.length === 1 ? "EPUB disponível" : "EPUBs disponíveis"}
            {result.page > 1 ? ` · página ${result.page}` : ""}
          </strong>
          <p>
            {origin === "local"
              ? `Busca local imediata · ${seed?.coveredCount || seed?.books.length || 0} clássicos em português`
              : origin === "cache"
                ? "Resultados salvos no aparelho"
                : provider === "gutenberg"
                  ? "Catálogo online via API Gutendex"
                  : "Resultados do Anna’s Archive"}
          </p>
        </div>
        {provider === "gutenberg" && origin === "local" && (
          <button
            className="text-button"
            onClick={() => void search(1, true)}
            disabled={loading}
          >
            <RefreshCw size={14} />
            {loading ? "Consultando API…" : "Ampliar na API"}
          </button>
        )}
      </div>}
      <div className="native-catalog-grid">
        {result.results.map((book, i) => {
          const owned = books.some(
            (b) =>
              b.title.toLocaleLowerCase() === book.title.toLocaleLowerCase(),
          );
          return (
            <article className="native-catalog-book" key={book.id}>
              <div className={`catalog-book-cover color-${i % 5}`}>
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <BookOpen size={37} strokeWidth={1} />
                )}
              </div>
              <div className="catalog-book-copy">
                <h3>{book.title}</h3>
                <p>{book.author || "Autor não informado"}</p>
                <div className="catalog-book-tags">
                  <span>EPUB</span>
                  {book.language && <span>{book.language.toUpperCase()}</span>}
                  {book.size && <span>{book.size}</span>}
                  {owned && (
                    <span>
                      <Check size={10} /> Na biblioteca
                    </span>
                  )}
                </div>
                <div className="catalog-card-actions"><button
                  className="primary-button"
                  disabled={!!downloading}
                  onClick={() => void downloadBook(book)}
                >
                  {downloading === book.id
                    ? phase === "import" ? "Importando…" : "Baixando…"
                    : canUsePremium(book)
                      ? "Baixar premium"
                      : book.downloadUrl
                      ? "Adicionar à biblioteca"
                      : "Ver downloads no app"}
                  <Download size={14} />
                </button>
                <button className="text-button catalog-links-button" onClick={() => void showLinks(book)} disabled={!!downloading}>Ver links <ChevronRight size={14} /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!result.results.length && !loading && !result.challenge && !error && (
        <div className="empty-state">
          <BookOpen size={30} />
          <h3>
            {submitted ? "Nenhum EPUB encontrado" : "Busque uma nova história"}
          </h3>
          <p>
            {provider === "gutenberg"
              ? "O catálogo cobre principalmente livros em domínio público. Experimente também o nome do autor ou outros idiomas."
              : "A disponibilidade depende do catálogo e das condições do site."}
          </p>
        </div>
      )}
      {result.hasMore && (
        <div className="catalog-pagination">
          <button
            className="text-button"
            disabled={result.page <= 1 || loading}
            onClick={() => void search(result.page - 1, true)}
          >
            <ChevronLeft size={15} />
            Anterior
          </button>
          <span>Página {result.page}</span>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void search(result.page + 1, true)}
          >
            Próxima
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      <p className="catalog-source-note">
        {provider === "gutenberg"
          ? `O catálogo local é uma seleção inicial, não a biblioteca inteira. A busca online amplia os resultados e depende da disponibilidade da API. Downloads vêm do Project Gutenberg. Livros atuais podem não estar disponíveis. ${seed?.updatedAt ? "Metadados locais atualizados em " + new Date(seed.updatedAt).toLocaleDateString("pt-BR") + "." : ""}`
          : "Anna’s Archive pode exigir verificação, associação ou etapas intermediárias. A navegação acontece dentro do app, sem acesso à sua chave da OpenAI."}
      </p>
      {selectedBook && <Modal title="Links de download" onClose={() => { linksGeneration.current++; setSelectedBook(null); }}>
        <div className="download-book-heading"><h3>{selectedBook.title}</h3><p>{selectedBook.author} · {selectedBook.format.toUpperCase()} {selectedBook.size ? "· " + selectedBook.size : ""}</p></div>
        {linksLoading && <p role="status">Carregando links do livro…</p>}
        {links.error && <p className="form-error" role="alert">{links.error}</p>}
        <div className="download-options">
          {links.options.map(option => <div className="download-option" key={option.id}>
            <strong>{option.label}</strong><span className="download-link-url">{option.url}</span>
            <button className="primary-button" disabled={!!downloading} onClick={() => void downloadBook(selectedBook, option)}>
              {downloading === selectedBook.id ? phase === "import" ? "Importando…" : "Baixando…" : option.kind === "direct" || (option.kind === "premium" && settings.hasAnnaKey) ? "Baixar para biblioteca" : "Continuar dentro do app"}<Download size={14} />
            </button>
          </div>)}
        </div>
        <button className="text-button" onClick={() => void insideCatalog(selectedBook.url, "links")}>Carregar links pela página no app <ArrowUpRight size={14} /></button>
      </Modal>}
    </div>
  );
}
