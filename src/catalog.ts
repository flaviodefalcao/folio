import { get, set } from "idb-keyval";
export type CatalogBook = {
  id: string;
  title: string;
  author: string;
  language: string;
  format: string;
  size?: string;
  url: string;
  downloadUrl?: string;
  coverUrl?: string;
  provider?: string;
  metadata?: string;
  md5?: string;
};
export type CatalogResult = {
  results: CatalogBook[];
  page: number;
  hasMore: boolean;
  count?: number;
  challenge?: boolean;
  error?: string;
  query?: string;
  language?: string;
  format?: string;
  provider?: string;
};
export type DownloadOption = { id: string; label: string; url: string; kind: "premium" | "direct" | "page"; pathIndex?: number; domainIndex?: number };
export type CatalogLinks = { options: DownloadOption[]; error?: string; challenge?: boolean };
export type LocalCatalog = {
  updatedAt: string;
  books: CatalogBook[];
  coveredCount: number;
  catalogTotal?: number;
  complete: boolean;
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
let seed: Promise<LocalCatalog> | null = null;
export function loadLocalCatalog() {
  return (seed ||= (async () => {
    const r = await fetch("./catalog-pt.json");
    if (!r.ok) throw new Error("Catálogo local indisponível");
    return (await r.json()) as LocalCatalog;
  })());
}
export function filterLocalBooks(
  catalog: LocalCatalog,
  query: string,
  language: string,
) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return catalog.books.filter(
    (b) =>
      (!language || language === b.language) &&
      words.every((w) => norm(`${b.title} ${b.author}`).includes(w)),
  );
}
export async function searchRemote(
  query: string,
  language: string,
  page: number,
): Promise<CatalogResult> {
  if (window.folio?.searchBooks)
    return window.folio.searchBooks({ query, language, page });
  const url = new URL("https://gutendex.com/books/");
  if (query.trim()) url.searchParams.set("search", query.toLowerCase().trim());
  else if (language) url.searchParams.set("languages", language);
  if (page > 1) url.searchParams.set("page", String(page));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error("O catálogo está indisponível. Tente novamente.");
  const result = await response.json();
  const books: CatalogBook[] = (result.results || [])
    .filter(
      (b: {
        copyright?: boolean;
        formats?: Record<string, string>;
        languages: string[];
      }) =>
        b.copyright === false &&
        b.formats?.["application/epub+zip"] &&
        (!language || b.languages.includes(language)),
    )
    .map(
      (b: {
        id: number;
        title: string;
        authors: { name: string }[];
        languages: string[];
        formats: Record<string, string>;
      }) => ({
        id: `gutenberg:${b.id}`,
        title: b.title,
        author: b.authors.map((a) => a.name).join(", "),
        language: b.languages.join(", "),
        format: "epub",
        url: `https://www.gutenberg.org/ebooks/${b.id}`,
        downloadUrl: b.formats["application/epub+zip"].replace(
          /^http:/,
          "https:",
        ),
        coverUrl: b.formats["image/jpeg"]?.replace(/^http:/, "https:"),
        provider: "gutenberg",
      }),
    );
  return {
    results: books,
    page,
    hasMore: !!result.next,
    count: result.count,
    provider: "gutenberg",
  };
}
const key = (q: string, l: string, p: number) =>
  `folio:catalog-cache:${norm(q)}:${l}:${p}`;
export async function cachedSearch(
  q: string,
  l: string,
  p: number,
): Promise<CatalogResult | null> {
  const cached = await get<{ at: number; data: CatalogResult }>(key(q, l, p));
  return cached && Date.now() - cached.at < 86400000 * 7 ? cached.data : null;
}
export async function cacheSearch(
  q: string,
  l: string,
  p: number,
  data: CatalogResult,
) {
  await set(key(q, l, p), { at: Date.now(), data });
}
