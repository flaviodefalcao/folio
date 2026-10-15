import JSZip from "jszip";
import { get, set } from "idb-keyval";
import type { BookRecord } from "./types";
import type { CatalogBook } from "./catalog";

export const ENTRELINHAS_URL = "https://curadoria-flavio.glossy-bead-2771.chatgpt.site/";
export const RECOMMENDATIONS_FEED = "https://docs.google.com/spreadsheets/d/1pVi-r2cOlY_fdVOrGeQg8XB0QJqXT0lUpaZljlDH9Jk/export?format=xlsx";
const CACHE = "folio:entrelinhas:v1";
export type Recommendation = {
  id: string; title: string; originalTitle: string; author: string;
  theme: string; reason: string; related: string; date: string; url: string; epubUrl: string;
};
export type RecommendationFeed = { updatedAt: number; books: Recommendation[] };
export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const titleBase = (s: string) => normalize(s.split(/[:：]/)[0]);
export function sameBook(item: Recommendation, book: Pick<BookRecord, "title" | "author"> | Pick<CatalogBook, "title" | "author">) {
  const titles = [item.title, item.originalTitle].filter(Boolean).map(titleBase);
  const surnames = item.author.split(/;|\be\b|\band\b/i).map(a => normalize(a).split(" ").filter(Boolean).at(-1)).filter((a): a is string => !!a && a.length > 2);
  const authorWords = new Set(normalize(book.author).split(" "));
  return titles.includes(titleBase(book.title)) && surnames.length > 0 && surnames.every(s => authorWords.has(s));
}
export function httpsLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) || /\.(local|internal)$/i.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}
function sheetDate(value: string) {
  // XLSX keeps dates in daily sheets as Excel serials; historical sheets use text.
  const serial = Number(value);
  if (/^\d{4,6}(?:\.\d+)?$/.test(value) && serial > 20000 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return `${String(date.getUTCDate()).padStart(2,"0")}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${date.getUTCFullYear()}`;
  }
  return value;
}
export function directEpub(value: string) {
  const safe = httpsLink(value);
  return safe && new URL(safe).pathname.toLowerCase().endsWith(".epub") ? safe : "";
}
function xml(value: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error("A planilha contém XML inválido.");
  const doc = new DOMParser().parseFromString(value, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Não foi possível ler a planilha.");
  return doc;
}
const nodes = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagNameNS("*", tag));
export async function parseRecommendations(data: ArrayBuffer): Promise<Recommendation[]> {
  if (data.byteLength > 8 * 1024 * 1024) throw new Error("Planilha muito grande.");
  const zip = await JSZip.loadAsync(data);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    expanded += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
    if (expanded > 40 * 1024 * 1024) throw new Error("Planilha muito grande após descompactar.");
  }
  const read = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error("A planilha não contém os dados esperados.");
    return xml(await file.async("string"));
  };
  const workbook = await read("xl/workbook.xml");
  const sheets = nodes(workbook, "sheet").filter(s => ["livros", "livros do dia"].includes(normalize(s.getAttribute("name") || "")));
  if (!sheets.length) throw new Error("A aba Livros não foi encontrada no Entrelinhas.");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const result = new Map<string, Recommendation>();
  const strings = zip.file("xl/sharedStrings.xml") ? nodes(await read("xl/sharedStrings.xml"), "si").map(s => nodes(s, "t").map(t => t.textContent || "").join("")) : [];
  for (const sheet of sheets) {
  const rel = nodes(rels, "Relationship").find(r => r.getAttribute("Id") === sheet.getAttribute("r:id"));
  const target = rel?.getAttribute("Target") || "";
  if (!/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target)) throw new Error("Aba Livros inválida.");
  const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`;
  const rows = nodes(await read(path), "row").map(row => {
    const cells: Record<string, string> = {};
    for (const cell of nodes(row, "c")) {
      const column = (cell.getAttribute("r") || "").replace(/\d/g, "");
      const formula = nodes(cell, "f")[0]?.textContent || "";
      const hyperlink = /^HYPERLINK\(\s*"((?:[^"]|"")+)"\s*[,;]/i.exec(formula);
      const value = nodes(cell, "v")[0]?.textContent || "";
      cells[column] = (hyperlink ? hyperlink[1].replace(/""/g, '"') : cell.getAttribute("t") === "s" ? strings[Number(value)] || "" : cell.getAttribute("t") === "inlineStr" ? nodes(cell, "t").map(t => t.textContent || "").join("") : value).slice(0, 12000);
    }
    return cells;
  });
  const headerIndex = rows.findIndex(r => Object.values(r).some(v => normalize(v) === "titulo"));
  if (headerIndex < 0) throw new Error("A planilha não tem uma coluna Título.");
  const headers = Object.fromEntries(Object.entries(rows[headerIndex]).map(([column, label]) => [normalize(label), column]));
  for (const row of rows.slice(headerIndex + 1, headerIndex + 1001)) {
    const value = (name: string) => row[headers[name]]?.trim() || "";
    const title = value("titulo"), author = value("autor");
    if (!title || !author) continue;
    const id = `${normalize(title)}|${normalize(author)}`;
    const url = httpsLink(value("link"));
    result.set(id, { id, title, author, originalTitle: value("titulo original"), date: sheetDate(value("data sugerida")), theme: value("tema"), reason: value("por que ler"), related: value("ligacao com os artigos"), url, epubUrl: directEpub(value("epub") || value("url epub") || value("download epub") || url) });
  }
  }
  const stamp = (date: string) => date.split("/").reverse().join("-");
  return [...result.values()].sort((a,b) => stamp(b.date).localeCompare(stamp(a.date)));
}
export const cachedRecommendations = () => get<RecommendationFeed>(CACHE);
export async function fetchRecommendations(): Promise<RecommendationFeed> {
  let buffer: ArrayBuffer;
  if (window.folio?.recommendationsFeed) {
    const { base64 } = await window.folio.recommendationsFeed();
    buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
  } else {
    const response = await fetch(RECOMMENDATIONS_FEED, { signal: AbortSignal.timeout(30000), credentials: "omit" });
    if (!response.ok) throw new Error("Não foi possível atualizar o Entrelinhas.");
    if (Number(response.headers.get("Content-Length")) > 8 * 1024 * 1024) throw new Error("Planilha muito grande.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("A planilha não respondeu.");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 8 * 1024 * 1024) throw new Error("Planilha muito grande."); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    buffer = bytes.buffer;
  }
  const feed = { updatedAt: Date.now(), books: await parseRecommendations(buffer) };
  await set(CACHE, feed);
  return feed;
}
