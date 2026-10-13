import type { Chapter } from "./types";

export type Passage = { label: string; href: string; text: string };
const STOP = new Set(
  "a ao aos as o os e em de da das do dos um uma uns umas por para com sem no na nos nas que qual quais como sobre esse essa isso este esta isto seu sua seus suas me voce eu ele ela eles elas se ou mais muito livro texto autor capítulo capitulo explique resumo resumir principais todo toda fazer foi são sao tem também tambem entre pelo pela porque".split(
    " ",
  ),
);
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const tokens = (s: string) =>
  normalize(s)
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.filter((w) => !STOP.has(w)) || [];

function chunks(chapters: Chapter[]): Passage[] {
  const result: Passage[] = [];
  for (const c of chapters) {
    const paragraphs = c.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    let text = "";
    for (const p of paragraphs) {
      if (p.length > 1800) {
        if (text) {
          result.push({ label: c.label, href: c.href, text });
          text = "";
        }
        for (let i = 0; i < p.length; i += 1500)
          result.push({
            label: c.label,
            href: c.href,
            text: p.slice(i, i + 1800),
          });
      } else if (text.length + p.length > 1800) {
        result.push({ label: c.label, href: c.href, text });
        text = `${text.slice(-250)}\n\n${p}`;
      } else text += (text ? "\n\n" : "") + p;
    }
    if (text) result.push({ label: c.label, href: c.href, text });
  }
  return result;
}

/** Local lexical retrieval, not an exhaustive analysis of an entire book. */
export function retrievePassages(
  chapters: Chapter[],
  question: string,
  selection?: string,
  currentHref?: string,
): Passage[] {
  const all = chunks(chapters);
  const query = [...new Set(tokens(question))];
  const docs = all.map((p) => tokens(p.text));
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1);
  const df = new Map(
    query.map((term) => [
      term,
      docs.reduce((n, d) => n + Number(d.includes(term)), 0),
    ]),
  );
  const ranked = all
    .map((p, i) => {
      const words = docs[i];
      let score = 0;
      for (const term of query) {
        const count = words.filter((w) => w === term).length;
        const idf = Math.log(
          1 +
            (docs.length - (df.get(term) || 0) + 0.5) /
              ((df.get(term) || 0) + 0.5),
        );
        score +=
          (idf * count * 2.2) /
          (count + 1.2 * (0.25 + (0.75 * words.length) / (avgLength || 1)));
      }
      if (score > 0 && p.href === currentHref) score *= 1.1;
      return { p, score, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const output: Passage[] = [];
  if (selection?.trim())
    output.push({
      label: "Trecho selecionado",
      href: currentHref || "",
      text: selection.trim().slice(0, 8000),
    });
  const overview =
    /\b(resum[oa]|resumir|visao geral|ideias principais|principais ideias|todo o livro|livro inteiro|overview|summary)\b/.test(
      normalize(question),
    );
  if (overview || ranked.every((r) => r.score === 0)) {
    // Spread the finite context across chapters instead of presenting the first chapter as the whole book.
    const nonempty = chapters.filter((c) => c.text.trim());
    const slots = Math.min(8 - output.length, nonempty.length);
    for (let i = 0; i < slots; i++) {
      const c = nonempty[Math.floor((i * nonempty.length) / slots)];
      const p = all.find((x) => x.href === c.href);
      if (p) output.push(p);
    }
  }
  for (const { p, score } of ranked) {
    if (output.length >= 8) break;
    if (
      score > 0 &&
      !output.some((x) => x.href === p.href && x.text === p.text)
    )
      output.push(p);
  }
  if (!output.length && all.length) output.push(all[0]);
  return output;
}

export function searchBook(
  chapters: Chapter[],
  query: string,
): { label: string; href: string; excerpt: string }[] {
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  const result: { label: string; href: string; excerpt: string }[] = [];
  for (const c of chapters) {
    const haystack = normalize(c.text);
    let start = 0;
    while (result.length < 60) {
      const index = haystack.indexOf(needle, start);
      if (index < 0) break;
      result.push({
        label: c.label,
        href: c.href,
        excerpt:
          (index > 90 ? "…" : "") +
          c.text
            .slice(Math.max(0, index - 90), index + needle.length + 150)
            .replace(/\s+/g, " ") +
          (index + needle.length + 150 < c.text.length ? "…" : ""),
      });
      start = index + needle.length;
    }
    if (result.length >= 60) break;
  }
  return result;
}
