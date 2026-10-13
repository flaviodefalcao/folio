"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  dialog,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { settingsStore } = require("./settings.cjs");
const {
  isTrustedIPC,
  httpsURL,
  downloadEPUB,
  boundedString,
  chatMessages,
} = require("./security.cjs");
const { generateBookReply } = require("./ai.cjs");
const entry = path.resolve(__dirname, "../dist/index.html");
let window,
  settings,
  chatInFlight = false,
  downloadInFlight = false;

function trusted(event) {
  if (!isTrustedIPC(event, window, entry))
    throw new Error("Origem não autorizada.");
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    trusted(event);
    return fn(...args);
  });
}

function registerIPC() {
  handle("folio:settings:get", () => settings.get());
  handle("folio:settings:save", (value) => settings.save(value));
  handle("folio:external", async (value) => {
    await shell.openExternal(httpsURL(value).href);
  });
  handle("folio:download", async (value) => {
    if (downloadInFlight)
      throw new Error("Já existe um download em andamento.");
    downloadInFlight = true;
    try {
      return await downloadEPUB(value);
    } finally {
      downloadInFlight = false;
    }
  });
  handle("folio:export", async (name, text) => {
    boundedString(name, "Nome", 200);
    boundedString(text, "Conteúdo", 10 * 1024 * 1024, true);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: name.replace(/[\x00-\x1f/\\:*?"<>|]/g, "_"),
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Texto", extensions: ["txt"] },
      ],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, text, "utf8");
    return true;
  });
  handle("folio:chat", async (request) => {
    chatMessages(request);
    const apiKey = settings.apiKey();
    if (!apiKey)
      throw new Error(
        "Configure sua chave da API OpenAI em Ajustes. A assinatura ChatGPT não fornece uma chave de API.",
      );
    if (chatInFlight) throw new Error("Uma resposta já está sendo gerada.");
    chatInFlight = true;
    try {
      return await generateBookReply(apiKey, settings.get().model, request);
    } catch (error) {
      if (error.statusCode === 401)
        throw new Error(
          "A chave da API OpenAI não foi aceita. Revise a chave em Ajustes.",
        );
      if (error.statusCode === 429)
        throw new Error(
          "Limite ou saldo da API OpenAI atingido. Confira sua conta da API.",
        );
      if (error.statusCode === 404)
        throw new Error(
          "Modelo indisponível para esta chave. Escolha um modelo válido em Ajustes.",
        );
      if (error.name === "AbortError" || error.name === "TimeoutError")
        throw new Error("A resposta excedeu o tempo limite. Tente novamente.");
      // Provider errors can carry request bodies/credentials: never forward them to the renderer.
      throw new Error(
        "Não foi possível obter a resposta da OpenAI. Confira a conexão, o modelo e a chave da API.",
      );
    } finally {
      chatInFlight = false;
    }
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 700,
    title: "Folio",
    backgroundColor: "#f5f4ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("will-frame-navigate", (event) => {
    // EPUB frames are generated locally as blob documents by epub.js.
    if (
      !event.isMainFrame &&
      !["about:blank", "about:srcdoc"].includes(event.url) &&
      !/^blob:(?:file:|null\/)/.test(event.url)
    )
      event.preventDefault();
  });
  window.loadFile(entry);
  window.on("closed", () => {
    window = null;
  });
}
app.whenReady().then(async () => {
  settings = settingsStore(app.getPath("userData"), safeStorage);
  await settings.load();
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerIPC();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
