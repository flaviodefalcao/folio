import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, RefreshCw } from "lucide-react";
import { ENTRELINHAS_URL, sameBook } from "./recommendations";
import type useRecommendations from "./useRecommendations";
import type { BookRecord } from "./types";

type Props = { model: ReturnType<typeof useRecommendations>; books: BookRecord[]; onOpen: (book: BookRecord) => void; onSearch: (query: string) => void; onLocal: () => void };
export default function Recommendations({model, books, onOpen, onSearch, onLocal}: Props) {
  const [tab, setTab] = useState<"site" | "books">("site");
  const [opening, setOpening] = useState(false), [webError, setWebError] = useState("");
  const opened = useRef(false);
  async function openSite() {
    if (!window.folio?.openRecommendations || opening) return;
    setOpening(true); setWebError("");
    try { await window.folio.openRecommendations(); }
    catch (e) { setWebError((e as Error).message); }
    finally { setOpening(false); }
  }
  useEffect(() => {
    if (!opened.current && window.folio?.openRecommendations) { opened.current = true; void openSite(); }
  }, []);
  const inLibrary = model.feed?.books.filter(item => books.some(book => sameBook(item, book))).length || 0;
  return <section className="recommendations">
    <header className="recommendations-heading"><div><div className="eyebrow">ENTRELINHAS + FOLIO</div><h1>Recomendações<span>.</span></h1><p>Sua curadoria, do próximo assunto à próxima leitura.</p></div><button className="icon-button" aria-label="Atualizar recomendações e tentar importar" disabled={model.working} onClick={() => void model.refresh()}><RefreshCw size={20}/></button></header>
    <div className="recommendations-tabs" role="tablist" aria-label="Recomendações"><button role="tab" id="rec-site-tab" aria-controls="rec-site" aria-selected={tab === "site"} onClick={() => {setTab("site"); void openSite();}}>Entrelinhas</button><button role="tab" id="rec-books-tab" aria-controls="rec-books" aria-selected={tab === "books"} onClick={() => setTab("books")}>Livros sugeridos {model.feed?.books.length || ""}</button></div>
    {tab === "site" ? <div id="rec-site" role="tabpanel" aria-labelledby="rec-site-tab">
      {window.folio?.openRecommendations ? <div className="recommendations-launch"><BookOpen size={38}/><h2>Entrelinhas dentro do Folio</h2><p>Artigos, vídeos, livros e os resumos da sua curadoria. Entre com o ChatGPT quando solicitado.</p><button className="primary-button" disabled={opening} onClick={() => void openSite()}>{opening ? "Entrelinhas aberto…" : "Abrir Entrelinhas"}</button></div> : <><p className="recommendations-help">Se o login impedir a exibição, abra o Entrelinhas no navegador. No aplicativo, ele abre em uma tela própria dentro do Folio.</p><iframe className="entrelinhas-frame" title="Entrelinhas — Curadoria Digital" src={ENTRELINHAS_URL} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" /></>}
      {webError && <p role="alert">{webError}</p>}
      <a className="text-link" href={ENTRELINHAS_URL} target="_blank" rel="noopener noreferrer">Abrir no navegador <ExternalLink size={15}/></a>
    </div> : <div id="rec-books" role="tabpanel" aria-labelledby="rec-books-tab">
      <div className="recommendation-sync"><label><input type="checkbox" checked={model.auto} onChange={e => model.setAuto(e.target.checked)}/> Buscar e baixar com Anna’s Archive premium</label><p>Procura cada sugestão no Anna’s Archive e importa o EPUB com título e autor correspondentes. Usa a chave salva e a franquia da sua conta premium. A fila avança enquanto o Folio está aberto, fora do leitor.</p><small>{model.working ? "Atualizando sugestões e verificando arquivos…" : `${inLibrary} na biblioteca${model.feed ? ` · Atualizado em ${new Date(model.feed.updatedAt).toLocaleString("pt-BR")}` : ""}`}</small></div>
      {model.error && <p role="alert" className="error-banner">{model.error}</p>}
      {!window.folio?.download && <p>Para baixar e importar automaticamente, use o aplicativo Folio no celular.</p>}
      <div className="recommendation-list">{model.feed?.books.map(item => {
        const book = books.find(b => sameBook(item, b)), state = model.states[item.id];
        return <article key={item.id}><div className="eyebrow">{item.theme.split(";")[0]} · {item.date}</div><h2>{item.title}</h2><p className="recommendation-author">{item.author}</p><p>{item.reason}</p>{item.related && <details><summary>Conexão com os artigos</summary><p>{item.related}</p></details>}<p className="recommendation-status" role="status">{book ? "Disponível na sua biblioteca" : state?.message || "Aguardando verificação de EPUB"}</p><div className="recommendation-actions">{book ? <button className="primary-button" onClick={() => onOpen(book)}>Continuar leitura</button> : <button className="primary-button" onClick={() => onSearch(item.title)}>Procurar EPUB</button>}{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">Ver indicação <ExternalLink size={14}/></a>}</div></article>;
      })}</div>
      {!model.feed && !model.working && <p>Toque em atualizar para carregar as sugestões do Entrelinhas.</p>}
    </div>}
    <button className="text-link recommendations-local" onClick={onLocal}>Sugestões da minha biblioteca</button>
  </section>;
}
