import JSZip from "jszip";
import type { BookRecord, Chapter } from "./types";
export function audioSegments(text: string): string[] {
  const blocks = text.match(/[^\n]+(?:\n+|$)/g) || [text];
  return blocks.flatMap((block) => {
    const parts = block.match(/[\s\S]+?(?:[.!?]+(?=\s|$)\s*|$)/g) || [block];
    return parts.flatMap((part) => {
      const chunks: string[] = [];
      while (part.length > 1400) {
        const end = part.lastIndexOf(" ", 1400);
        let cut = end > 700 ? end + 1 : 1400;
        if (/[\uD800-\uDBFF]/.test(part[cut - 1])) cut--;
        chunks.push(part.slice(0, cut));
        part = part.slice(cut);
      }
      if (part.trim()) chunks.push(part);
      else if (chunks.length) chunks[chunks.length - 1] += part;
      return chunks;
    });
  });
}
export async function audioChapters(book: BookRecord): Promise<Chapter[]> {
  if (!book.toc.length) return book.chapters;
  const zip = await JSZip.loadAsync(book.data);
  const docs = new Map<string, Document>();
  const output: Chapter[] = [];
  for (let i = 0; i < book.toc.length; i++) {
    const entry = book.toc[i],
      [file, anchor] = entry.href.split("#");
    let doc = docs.get(file);
    if (!doc) {
      const key = Object.keys(zip.files).find(
        (key) => key === file || key.endsWith("/" + file),
      );
      if (!key) continue;
      doc = new DOMParser().parseFromString(
        await zip.file(key)!.async("string"),
        "application/xhtml+xml",
      );
      docs.set(file, doc);
    }
    const body = doc.getElementsByTagNameNS("*", "body")[0];
    if (!body) continue;
    const start = anchor
      ? doc.getElementById(decodeURIComponent(anchor))
      : body;
    if (!start) continue;
    const next = book.toc
      .slice(i + 1)
      .find((e) => e.href.split("#")[0] === file && e.href.includes("#"));
    const end = next
      ? doc.getElementById(decodeURIComponent(next.href.split("#")[1]))
      : null;
    const range = doc.createRange();
    range.setStartBefore(start === body ? body.firstChild || body : start);
    if (end && start.compareDocumentPosition(end) & 4) range.setEndBefore(end);
    else range.setEnd(body, body.childNodes.length);
    const fragment = range.cloneContents();
    fragment.querySelectorAll("script,style").forEach((e) => e.remove());
    fragment
      .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,br")
      .forEach((e) => {
        e.insertBefore(doc.createTextNode("\n\n"), e.firstChild);
        e.appendChild(doc.createTextNode("\n\n"));
      });
    const text =
      fragment.textContent
        ?.replace(/[ \t\r]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || "";
    if (text)
      output.push({
        id: String(i),
        label: entry.label,
        href: entry.href,
        text,
      });
  }
  return output.length ? output : book.chapters;
}
const audioDocumentMaps = new Map<
  Document,
  { text: string; nodes: { node: Text; offset: number }[] }
>();
export function audioTextRange(
  doc: Document,
  needle: string,
  context?: { anchor?: string; offset?: number },
): Range | null {
  let map = audioDocumentMaps.get(doc);
  if (!map) {
    const nodes: { node: Text; offset: number }[] = [];
    let text = "",
      previousBlock: Element | null = null;
    const walker = doc.createTreeWalker(doc.body || doc.documentElement, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("script,style,head")) continue;
      const block =
        node.parentElement?.closest("p,div,h1,h2,h3,h4,li,section,article") ||
        null;
      if (previousBlock && block !== previousBlock && !text.endsWith(" ")) {
        text += " ";
        nodes.push({ node: node as Text, offset: 0 });
      }
      previousBlock = block;
      const value = node.textContent || "";
      for (let i = 0; i < value.length; i++) {
        const char = /\s/.test(value[i]) ? " " : value[i];
        if (char === " " && text.endsWith(" ")) continue;
        text += char;
        nodes.push({ node: node as Text, offset: i });
      }
    }
    map = { text, nodes };
    if (audioDocumentMaps.size >= 2)
      audioDocumentMaps.delete(audioDocumentMaps.keys().next().value!);
    audioDocumentMaps.set(doc, map);
  }
  const { text, nodes } = map;
  const query = needle.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!query) return null;
  let anchorIndex = 0;
  if (context?.anchor) {
    let anchor: Element | null = null;
    try {
      anchor = doc.getElementById(decodeURIComponent(context.anchor));
    } catch {}
    if (anchor) {
      const first = nodes.findIndex(
        (point) =>
          anchor!.contains(point.node) ||
          Boolean(anchor!.compareDocumentPosition(point.node) & 4),
      );
      anchorIndex = Math.max(0, first);
    }
  }
  let at = text.indexOf(query, anchorIndex);
  if (context?.offset !== undefined && at >= 0) {
    const expected = anchorIndex + context.offset;
    let best = at,
      next = at;
    while ((next = text.indexOf(query, next + 1)) >= 0) {
      if (Math.abs(next - expected) < Math.abs(best - expected)) best = next;
      else if (next > expected) break;
    }
    at = best;
  }
  if (at < 0) return null;
  const start = nodes[at],
    end = nodes[at + query.length - 1];
  if (!start || !end) return null;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}
