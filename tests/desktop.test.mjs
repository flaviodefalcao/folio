import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

test(
  "desktop: real EPUB reading, settings IPC, annotations, search, progress, persistence and chat key gate",
  { timeout: 120000 },
  async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "folio-desktop-"));
    const app = await electron.launch({
      args: [path.resolve("."), `--user-data-dir=${temp}`],
      env: { ...process.env, OPENAI_API_KEY: "" },
    });
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.getByRole("heading", { name: "Biblioteca", exact:true }).waitFor();
      await page
        .getByRole("button", { name: "Ler A arte de ler devagar", exact: true })
        .waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => Boolean(window.folio)), true);
      const s = await page.evaluate(() => window.folio.getSettings());
      assert.equal(s.hasApiKey, false);
      assert.equal(s.annaUrl, "https://annas-archive.gl");
      await page.screenshot({ path: "research/library.png", fullPage: true });
      await page
        .getByRole("button", { name: "Ler A arte de ler devagar", exact: true })
        .click();
      await page.locator(".epub-container iframe").waitFor({ timeout: 20000 });
      await page.waitForFunction(
        () =>
          document.querySelector(".chapter-heading span")?.textContent ===
          "Um lugar para a atenção",
      );
      const frame = page.frameLocator(".epub-container iframe").first();
      await frame
        .getByRole("heading", { name: "Um lugar para a atenção", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Sumário", exact: true }).click();
      await page
        .getByRole("button", { name: "02 Conversar com uma página" })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".chapter-heading span")?.textContent ===
          "Conversar com uma página",
      );
      await page
        .getByRole("button", { name: "Fechar painel", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Marcar página", exact: true })
        .click();
      await frame
        .locator("p")
        .first()
        .evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          el.ownerDocument.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true }),
          );
        });
      await page
        .getByRole("button", { name: "Destacar e salvar", exact: true })
        .waitFor();
      await page
        .getByRole("textbox", { name: "Nota sobre o trecho" })
        .fill("Minha primeira anotação");
      await page
        .getByRole("button", { name: "Destacar e salvar", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Destaques e notas", exact: true })
        .click();
      await page.getByRole("textbox", { name: "Editar nota" }).waitFor();
      assert.equal(
        await page.getByRole("textbox", { name: "Editar nota" }).inputValue(),
        "Minha primeira anotação",
      );
      await page
        .getByRole("button", { name: "Buscar no livro", exact: true })
        .click();
      await page.getByPlaceholder("Uma palavra ou expressão…").fill("atenção");
      assert.ok((await page.locator(".search-result").count()) > 0);
      await page
        .getByRole("button", { name: "Ajustar leitura", exact: true })
        .click();
      await page.getByRole("button", { name: "Escuro", exact: true }).click();
      assert.ok(
        await page
          .locator(".reader-shell")
          .getAttribute("class")
          .then((s) => s.includes("theme-night")),
      );
      await page
        .getByRole("button", { name: "Conversar", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Quais são as principais ideias?" })
        .click();
      await page
        .getByRole("dialog", { name: "Preferências", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      // Run the actual SDK behind IPC against a fixture; never send requests to an external API.
      await app.evaluate(async ({ ipcMain }, modulePath) => {
        const { generateBookReply } = process.mainModule.require(modulePath);
        ipcMain.removeHandler("folio:chat");
        ipcMain.handle("folio:chat", async (_event, request) =>
          generateBookReply("fixture-key", "gpt-6-astra", request, {
            fetch: async (_url, options) => {
              const body = JSON.parse(options.body);
              if (body.store !== false) throw new Error("store:false missing");
              if (!JSON.stringify(body).includes("Trecho"))
                throw new Error("book context missing");
              return new Response(
                JSON.stringify({
                  id: "resp_fixture",
                  model: "gpt-6-astra",
                  output: [
                    {
                      type: "message",
                      id: "msg_fixture",
                      role: "assistant",
                      content: [
                        {
                          type: "output_text",
                          text: "A leitura pede atenção e perguntas específicas [1].",
                          annotations: [],
                        },
                      ],
                    },
                  ],
                  usage: { input_tokens: 100, output_tokens: 10 },
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            },
          }),
        );
      }, path.resolve("electron/ai.cjs"));
      await page
        .getByRole("button", { name: "Configurar OpenAI", exact: true })
        .click();
      await page.getByLabel("Chave da API OpenAI").fill("fixture-key");
      await page
        .getByRole("button", { name: "Salvar preferências", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Pergunta sobre o livro" })
        .fill("Como a atenção influencia a leitura?");
      await page
        .getByRole("button", { name: "Enviar pergunta", exact: true })
        .click();
      await page
        .getByText("A leitura pede atenção e perguntas específicas [1].", {
          exact: true,
        })
        .waitFor({ timeout: 15000 });
      assert.ok((await page.locator(".chat-sources button").count()) > 0);
      await page.screenshot({ path: "research/chat.png", fullPage: true });
      await page
        .getByRole("button", { name: "Fechar painel", exact: true })
        .click();
      await page.screenshot({ path: "research/reader.png", fullPage: true });
      await page
        .getByRole("button", { name: "Biblioteca", exact: true })
        .click();
      await page.getByRole("heading", { name: "Biblioteca", exact:true }).waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: "Ler A arte de ler devagar", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".chapter-heading span")?.textContent ===
          "Conversar com uma página",
      );
      await page
        .getByRole("button", { name: "Destaques e notas", exact: true })
        .click();
      assert.equal(
        await page.getByRole("textbox", { name: "Editar nota" }).inputValue(),
        "Minha primeira anotação",
      );
      await page
        .getByRole("button", { name: "Conversar", exact: true })
        .click();
      await page
        .getByText("A leitura pede atenção e perguntas específicas [1].", {
          exact: true,
        })
        .waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
