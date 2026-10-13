import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
test(
  "one spine file with multiple anchors highlights only the visible chapter and keeps its label",
  { timeout: 60000 },
  async () => {
    const preview = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "5198",
        "--strictPort",
      ],
      { cwd: new URL("..", import.meta.url), stdio: "ignore" },
    );
    let browser;
    try {
      for (let i = 0; i < 50; i++) {
        try {
          if ((await fetch("http://127.0.0.1:5198")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {}),
      });
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await page.goto("http://127.0.0.1:5198");
      await page
        .getByRole("button", { name: "Ler A arte de ler devagar", exact: true })
        .waitFor();
      const zip = await JSZip.loadAsync(
        await readFile(new URL("../public/sample.epub", import.meta.url)),
      );
      const text = await zip.file("OEBPS/chapter1.xhtml").async("string");
      const base = text.replace("<body>", '<body><a id="one"></a>');
      const second =
        '<section style="break-before:page;page-break-before:always"><a id="two"></a><h1>Segundo capítulo no mesmo arquivo</h1>' +
        Array.from(
          { length: 12 },
          (_, i) =>
            `<p>Segundo capítulo, parágrafo ${i}. Esta leitura demonstra navegação real entre âncoras de um único documento, como ocorre em muitos EPUBs de clássicos.</p>`,
        ).join("") +
        "</section>";
      zip.file(
        "OEBPS/chapter1.xhtml",
        base.replace("</body>", second + "</body>"),
      );
      let opf = await zip.file("OEBPS/content.opf").async("string");
      opf = opf
        .replace("A arte de ler devagar", "Livro com âncoras")
        .replace(
          /<spine>[\s\S]*?<\/spine>/,
          '<spine><itemref idref="c0"/></spine>',
        );
      zip.file("OEBPS/content.opf", opf);
      zip.file(
        "OEBPS/nav.xhtml",
        '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml#one">Primeiro capítulo</a></li><li><a href="chapter1.xhtml#two">Segundo capítulo</a></li></ol></nav></body></html>',
      );
      await page
        .locator("input[type=file]")
        .setInputFiles({
          name: "ancoras.epub",
          mimeType: "application/epub+zip",
          buffer: await zip.generateAsync({ type: "nodebuffer" }),
        });
      await page
        .getByRole("button", { name: "Ler Livro com âncoras", exact: true })
        .click();
      await page
        .frameLocator(".epub-container iframe")
        .first()
        .locator("h1")
        .first()
        .waitFor();
      await expect(page.locator(".chapter-heading>span")).toHaveText(
        "Primeiro capítulo",
      );
      await page.getByRole("button", { name: "Sumário", exact: true }).click();
      await page
        .getByRole("button", { name: "02 Segundo capítulo", exact: true })
        .click();
      await expect(page.locator(".chapter-heading>span")).toHaveText(
        "Segundo capítulo",
      );
      assert.equal(await page.locator(".toc-link.current").count(), 1);
      await expect(page.locator(".toc-link.current")).toContainText(
        "Segundo capítulo",
      );
      await page
        .getByRole("button", { name: "01 Primeiro capítulo", exact: true })
        .click();
      await expect(page.locator(".chapter-heading>span")).toHaveText(
        "Primeiro capítulo",
      );
      assert.equal(await page.locator(".toc-link.current").count(), 1);
    } finally {
      await browser?.close();
      preview.kill();
    }
  },
);
