import test from "node:test";
import assert from "node:assert/strict";
import { retrievePassages, searchBook } from "../src/retrieval.ts";
const chapters = [
  {
    id: "1",
    label: "Atenção",
    href: "one.xhtml",
    text: "A atenção melhora quando desligamos notificações.\n\nUma cadeira confortável apoia a leitura.",
  },
  {
    id: "2",
    label: "Memória",
    href: "two.xhtml",
    text: "A memória recupera relações e perguntas.\n\nRevisitar uma nota depois de alguns dias ajuda a memória.",
  },
  {
    id: "3",
    label: "Conversa",
    href: "three.xhtml",
    text: "Uma interpretação precisa de evidências e citações.\n\nO contexto de um capítulo deve ser preservado.",
  },
];
test("ranks the chapter containing relevant terms and preserves navigation", () => {
  const result = retrievePassages(chapters, "Como melhorar a memória?");
  assert.equal(result[0].href, "two.xhtml");
  assert.match(result[0].text, /memória/);
});
test("overview samples multiple chapters and bounds the context", () => {
  const large = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    label: `Capítulo ${i}`,
    href: `${i}.xhtml`,
    text: `Texto único sobre assunto ${i}.`.repeat(100),
  }));
  const result = retrievePassages(large, "Resumo do livro inteiro");
  assert.equal(result.length, 8);
  assert.equal(new Set(result.map((r) => r.href)).size, 8);
  assert.ok(result[7].href !== "7.xhtml");
});
test("selection is first, bounded and identified as selected text", () => {
  const result = retrievePassages(
    chapters,
    "Explique isto",
    "x".repeat(20000),
    "one.xhtml",
  );
  assert.equal(result[0].label, "Trecho selecionado");
  assert.equal(result[0].text.length, 8000);
  assert.equal(result[0].href, "one.xhtml");
});
test("search ignores accents and reports contextual excerpts", () => {
  const result = searchBook(chapters, "ATENCAO");
  assert.equal(result.length, 1);
  assert.match(result[0].excerpt, /atenção/);
  assert.equal(result[0].href, "one.xhtml");
});
test("empty search yields no results; many matches stay bounded", () => {
  assert.deepEqual(searchBook(chapters, " "), []);
  assert.equal(
    searchBook(
      [
        {
          id: "a",
          label: "Teste",
          href: "a.xhtml",
          text: "memória ".repeat(200),
        },
      ],
      "memória",
    ).length,
    60,
  );
});
test("a large paragraph still yields bounded passages", () => {
  const result = retrievePassages(
    [
      {
        id: "a",
        label: "Longo",
        href: "a.xhtml",
        text: "atenção ".repeat(4000),
      },
    ],
    "atenção",
  );
  assert.ok(result.length <= 8);
  assert.ok(result.every((r) => r.text.length <= 1800));
});
