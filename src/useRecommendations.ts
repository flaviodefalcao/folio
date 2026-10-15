import { useCallback, useEffect, useRef, useState } from "react";
import { importEpub, saveBook } from "./books";
import { cachedRecommendations, fetchRecommendations, sameBook, type RecommendationFeed } from "./recommendations";
import { isAppForeground } from "./native";
import type { BookDownload, BookRecord, Settings } from "./types";
export type ImportState = { state: "checking" | "downloading" | "added" | "unavailable" | "error"; message: string; at: number };
const BLOCK_KEY = "folio:recommendation-pause:v1";
const STATE_KEY = "folio:recommendation-imports:v1";
function storedStates(): Record<string, ImportState> {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
}
export default function useRecommendations(books: BookRecord[], settings: Settings, enabled: boolean, onAdded: (book: BookRecord) => void) {
  const [feed, setFeed] = useState<RecommendationFeed>();
  const [states, setStates] = useState(storedStates);
  const [auto, setAuto] = useState(() => localStorage.getItem("folio:recommendations-auto") !== "off");
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const latest = useRef({books, settings, enabled, auto, onAdded});
  latest.current = {books, settings, enabled, auto, onAdded};
  const feedRef = useRef(feed), statesRef = useRef(states), lock = useRef(false), live = useRef(true);
  const saveState = (id: string, value: ImportState) => {
    statesRef.current = {...statesRef.current, [id]: value};
    // Save only durable outcomes. A process killed mid-transfer can resume next launch.
    const durable = Object.fromEntries(Object.entries(statesRef.current).filter(([,s]) => s.state !== "checking" && s.state !== "downloading"));
    try { localStorage.setItem(STATE_KEY, JSON.stringify(durable)); } catch {}
    if (live.current) setStates(statesRef.current);
  };
  const run = useCallback(async (refresh = false, retry = false) => {
    if (lock.current || !latest.current.enabled || !isAppForeground()) return;
    lock.current = true; if (live.current) { setWorking(true); setError(""); }
    try {
      let current = feedRef.current || await cachedRecommendations();
      if (current && live.current) { feedRef.current = current; setFeed(current); }
      if (refresh || !current || Date.now() - current.updatedAt > 5 * 60 * 1000) {
        try { current = await fetchRecommendations(); feedRef.current = current; if (live.current) setFeed(current); }
        catch (e) { if (live.current) setError(`${(e as Error).message}${current ? " Exibindo sugestões salvas." : ""}`); return; }
      }
      if (!current || !latest.current.auto || !window.folio?.download) return;
      if (retry) localStorage.removeItem(BLOCK_KEY);
      try {
        const block = JSON.parse(localStorage.getItem(BLOCK_KEY) || "null");
        if (block?.until > Date.now()) { if (live.current) setError(block.message); return; }
      } catch {}
      if (!latest.current.settings.hasAnnaKey || !window.folio.searchCatalog || !window.folio.downloadAnna) {
        if (live.current) setError("Configure a chave premium do Anna’s Archive em Preferências para buscar e baixar os livros sugeridos automaticamente.");
        return;
      }
      for (const item of current.books) {
        if (!live.current || !latest.current.enabled || !latest.current.auto || !isAppForeground()) break;
        const existing = latest.current.books.find(book => sameBook(item, book));
        if (existing) continue;
        const previous = statesRef.current[item.id];
        if (!retry && previous && (previous.state === "added" || Date.now() - previous.at < 24 * 60 * 60 * 1000)) continue;
        const update = (state: ImportState["state"], message: string) => saveState(item.id, { state, message, at: Date.now() });
        update("checking", "Procurando um EPUB correspondente…");
        try {
          let direct = item.epubUrl, md5 = "";
          if (!direct) {
            let result = await window.folio.searchCatalog!({ query: `${item.title} ${item.author}`, format: "epub", page: 1 });
            if (!result.challenge && !result.error && !result.results.some(book => book.format.toLowerCase() === "epub" && sameBook(item, book)) && item.originalTitle && item.originalTitle !== item.title) {
              result = await window.folio.searchCatalog!({query: `${item.originalTitle} ${item.author}`, format: "epub", page: 1});
            }
            if (result.challenge || result.error) {
              const message = result.error || "Abra o catálogo para concluir a verificação e toque em Atualizar nas recomendações.";
              update("error", message);
              localStorage.setItem(BLOCK_KEY, JSON.stringify({until: Date.now() + 60 * 60 * 1000, message}));
              if (live.current) setError(message);
              break;
            }
            const candidates = result.results.filter(book => book.format.toLowerCase() === "epub" && sameBook(item, book));
            // Search ranking chooses the first edition with an exact title and matching author(s).
            const candidate = candidates[0];
            direct = candidate?.downloadUrl || "";
            md5 = /^[a-f0-9]{32}$/i.test(candidate?.md5 || candidate?.id || "") ? (candidate!.md5 || candidate!.id) : "";
          }
          if (!live.current || !latest.current.enabled || !latest.current.auto || !isAppForeground()) { delete statesRef.current[item.id]; break; }
          if (!direct && !md5) { update("unavailable", "Nenhum EPUB com título e autor correspondentes foi encontrado. Você pode conferir a busca."); continue; }
          update("downloading", "Baixando e validando o EPUB…");
          const download: BookDownload = md5 ? await window.folio.downloadAnna!(md5) : await window.folio.download(direct);
          const bytes = Uint8Array.from(download.data);
          const book = await importEpub(new File([bytes.buffer], download.name, {type: "application/epub+zip"}));
          if (!sameBook(item, book)) throw new Error("Título ou autor do arquivo não corresponde à recomendação. O livro não foi adicionado.");
          const known = latest.current.books.find(b => b.id === book.id || sameBook(item, b));
          if (!known) { book.collection = "Entrelinhas"; await saveBook(book); latest.current.onAdded(book); }
          update("added", "Adicionado à biblioteca · coleção Entrelinhas");
          if (download.quota && download.quota.remaining <= 0) {
            const message = "A franquia premium terminou. Os livros restantes aguardam a renovação da sua conta.";
            localStorage.setItem(BLOCK_KEY, JSON.stringify({until: Date.now() + 24 * 60 * 60 * 1000, message}));
            if (live.current) setError(message); break;
          }
        } catch (e) {
          const code = (e as {code?: string}).code;
          update("error", (e as Error).message || "Não foi possível importar este livro.");
          // Network errors, verification and quota limits should not trigger a burst of retries.
          if (code === "ANNA_VERIFICATION" || /franquia|quota|limite|conex|network|download em andamento/i.test((e as Error).message)) {
            const message = (e as Error).message;
            localStorage.setItem(BLOCK_KEY, JSON.stringify({until: Date.now() + (/franquia|quota/i.test(message) ? 24 * 60 : 15) * 60 * 1000, message}));
            if (live.current) setError(message); break;
          }
        }
      }
    } catch (e) { if (live.current) setError((e as Error).message); }
    finally { lock.current = false; if (live.current) setWorking(false); }
  }, []);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    if (enabled) void run();
    const resume = () => { if (document.visibilityState === "visible" && isAppForeground()) void run(); };
    const timer = window.setInterval(resume, 5 * 60 * 1000);
    window.addEventListener("folio-app-state", resume); document.addEventListener("visibilitychange", resume);
    return () => { clearInterval(timer); window.removeEventListener("folio-app-state", resume); document.removeEventListener("visibilitychange", resume); };
  }, [enabled, auto, settings.hasAnnaKey, run]);
  return { feed, states, working, error, auto, setAuto: (value: boolean) => { latest.current.auto = value; localStorage.setItem("folio:recommendations-auto", value ? "on" : "off"); setAuto(value); }, refresh: () => run(true, true) };
}
