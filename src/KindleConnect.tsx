import { useEffect, useRef, useState } from "react";
import type { BookRecord } from "./types";

export default function KindleConnect({ books, onClose }: {books: BookRecord[]; onClose: () => void}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [session, setSession] = useState<{url: string; expiresAt: number} | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(true);
  const api = window.folio;
  const supported = Boolean(api?.startKindleShare);
  useEffect(() => {
    alive.current = true;
    const check = async () => {
      const status = await window.folio?.kindleShareStatus?.().catch(() => null);
      if (alive.current && status && !status.running) setSession(null);
    };
    const timer = window.setInterval(() => { void check(); }, 5000);
    return () => {
      alive.current = false; window.clearInterval(timer);
      void window.folio?.stopKindleShare?.();
    };
  }, []);
  async function start() {
    if (!api?.beginKindleShare || !api.putKindleBook || !api.startKindleShare) return;
    const chosen = books.filter(book => selected.includes(book.id));
    if (!chosen.length || chosen.length > 10 || chosen.some(book => book.data.byteLength > 40*1024*1024) || chosen.reduce((sum, book) => sum + book.data.byteLength, 0) > 200*1024*1024) {
      setError("Selecione de 1 a 10 livros, até 40 MB cada e 200 MB no total."); return;
    }
    setBusy(true); setError("");
    try {
      await api.beginKindleShare();
      const seen = new Set<string>();
      for (let index = 0; index < chosen.length; index++) {
        if (!alive.current) return;
        const book = chosen[index]; setMessage(`Preparando ${index+1} de ${chosen.length}: ${book.title}`);
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", book.data));
        const id = Array.from(hash, byte => byte.toString(16).padStart(2,"0")).join("");
        if (seen.has(id)) continue; seen.add(id);
        const bytes = new Uint8Array(book.data);
        for (let offset = 0; offset < bytes.length; offset += 192*1024) {
          if (!alive.current) return;
          const chunk = bytes.subarray(offset, offset+192*1024);
          let raw = ""; for (const byte of chunk) raw += String.fromCharCode(byte);
          await api.putKindleBook({id, offset, base64: btoa(raw), complete: offset+chunk.length===bytes.length, title: book.title, author: book.author});
        }
      }
      if (!alive.current) return;
      const result = await api.startKindleShare();
      if (alive.current) { setSession(result); setMessage(""); }
      else await api.stopKindleShare?.();
    } catch (err) {
      await api.stopKindleShare?.();
      if (alive.current) { setError((err as Error).message); setMessage(""); }
    } finally { if (alive.current) setBusy(false); }
  }
  return <section className="kindle-connect" aria-labelledby="kindle-heading">
    <h2 id="kindle-heading">Conectar Kindle</h2>
    <p>Envie EPUBs para o KOReader pela mesma rede Wi-Fi. Os livros continuam disponíveis no Kindle depois do download.</p>
    {!supported ? <p role="status">Instale o APK Android com conexão Kindle para ativar este recurso.</p> : session ? <>
      <p><strong>Catálogo ativo por até 15 minutos.</strong> Mantenha esta tela aberta no celular.</p>
      <label className="form-field">Endereço do catálogo<input aria-label="Endereço OPDS" readOnly value={session.url} onFocus={event => event.target.select()} /></label>
      <ol><li>No KOReader, abra o catálogo OPDS.</li><li>Adicione um catálogo chamado Folio com o endereço acima.</li><li>Abra o catálogo e escolha um livro para baixar.</li></ol>
      <p>Use uma rede Wi-Fi de confiança: a transferência local usa HTTP. O endereço exclusivo muda a cada sessão; não compartilhe com outras pessoas.</p>
      <p>Se não conectar, verifique se os aparelhos estão na mesma rede e se o roteador permite comunicação entre dispositivos.</p>
      <button type="button" className="primary-button" onClick={async () => {await api?.stopKindleShare?.();setSession(null);}}>Encerrar compartilhamento</button>
    </> : <>
      <div className="kindle-book-list">{books.map(book => <label key={book.id} className="kindle-book-choice"><input type="checkbox" checked={selected.includes(book.id)} disabled={busy} onChange={event => setSelected(ids => event.target.checked ? [...ids, book.id] : ids.filter(id => id!==book.id))} /><span><strong>{book.title}</strong><small>{book.author}</small></span></label>)}</div>
      {!books.length && <p>Adicione um EPUB à biblioteca primeiro.</p>}
      <button type="button" className="primary-button" disabled={busy || !selected.length} onClick={() => {void start();}}>{busy ? "Preparando…" : `Compartilhar ${selected.length} livro(s)`}</button>
      <p>Até 10 livros por sessão. O catálogo encerra ao sair do aplicativo ou ao fechar esta tela.</p>
    </>}
    {message && <p role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    <p>Esta versão transfere livros. Posição, notas, estatísticas e atualização da extensão ainda não são sincronizadas.</p>
    <button type="button" disabled={busy} onClick={onClose}>Voltar à biblioteca</button>
  </section>;
}
