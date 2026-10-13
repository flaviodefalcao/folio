import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("EPUB import validates, sanitizes and stores books in the browser", async () => {
  const vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5193",
      "--strictPort",
    ],
    { cwd: new URL("..", import.meta.url), stdio: "ignore" },
  );
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch("http://127.0.0.1:5193");
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage();
    await page.route("http://127.0.0.1:5193/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>EPUB test harness</title>",
      }),
    );
    await page.goto("http://127.0.0.1:5193");
    const original = await readFile(
      new URL("../public/sample.epub", import.meta.url),
    );
    const zip = await JSZip.loadAsync(original);
    let chapter = await zip.file("OEBPS/chapter1.xhtml").async("string");
    chapter = chapter.replace(
      "<html",
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "https://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html',
    );
    chapter = chapter.replace(
      "<body>",
      '<body onload="window.bad=true"><script>window.bad=true</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input/></form><img src="https://evil.test/spy.png"/><a href="javascript:alert(1)">Texto seguro</a><p style="background:url(https://evil.test);color:red">Segurança</p>',
    );
    zip.file("OEBPS/chapter1.xhtml", chapter);
    const modified = await zip.generateAsync({ type: "base64" });
    const result = await page.evaluate(async (base64) => {
      const { importEpub, saveBook, loadBooks, deleteBook } =
        await import("/src/books.ts");
      const { default: JSZip } =
        await import("/node_modules/.vite/deps/jszip.js");
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const book = await importEpub(new File([data], "teste.epub"));
      const clean = await JSZip.loadAsync(book.data);
      const markup = await clean.file("OEBPS/chapter1.xhtml").async("string");
      await saveBook(book);
      await Promise.all([
        saveBook({ ...book, progress: 0.5 }),
        saveBook({ ...book, progress: 0.7 }),
      ]);
      const stored = (await loadBooks()).find((b) => b.id === book.id);
      await deleteBook(book.id);
      return {
        title: book.title,
        chapters: book.chapters.length,
        toc: book.toc.length,
        cover: book.cover?.slice(0, 30),
        href: book.chapters[0].href,
        text: book.chapters[0].text,
        markup,
        progress: stored.progress,
        bytes: stored.data.byteLength,
        remaining: (await loadBooks()).length,
      };
    }, modified);
    assert.equal(result.title, "A arte de ler devagar");
    assert.equal(result.chapters, 4);
    assert.equal(result.toc, 4);
    assert.equal(result.href, "chapter1.xhtml");
    assert.ok(result.cover.startsWith("data:image/svg+xml"));
    assert.match(result.text, /Texto seguro/);
    assert.doesNotMatch(
      result.markup,
      /<script|<iframe|<form|onload|evil\.test|javascript:/i,
    );
    assert.equal(result.progress, 0.7);
    assert.ok(result.bytes > 1000);
    assert.equal(result.remaining, 0);
    const invalid = await page.evaluate(async () => {
      const { importEpub } = await import("/src/books.ts");
      try {
        await importEpub(new File(["not an epub"], "fake.epub"));
        return "";
      } catch (e) {
        return e.message;
      }
    });
    assert.match(invalid, /EPUB válido/);
    zip.file(
      "OEBPS/chapter1.xhtml",
      '<!DOCTYPE html [<!ENTITY evil "unsafe">]><html xmlns="http://www.w3.org/1999/xhtml"><body>&evil;</body></html>',
    );
    const unsafe = await zip.generateAsync({ type: "base64" });
    const entityError = await page.evaluate(async (base64) => {
      const { importEpub } = await import("/src/books.ts");
      try {
        await importEpub(
          new File(
            [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
            "unsafe.epub",
          ),
        );
        return "";
      } catch (e) {
        return e.message;
      }
    }, unsafe);
    assert.match(entityError, /declaração XML não permitida/);
  } finally {
    await browser?.close();
    vite.kill();
  }
});
