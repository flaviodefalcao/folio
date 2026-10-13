"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { httpsURL, boundedString } = require("./security.cjs");
const DEFAULTS = { model: "gpt-5-nano", annaUrl: "https://annas-archive.gl" };

function settingsStore(directory, encryption) {
  const file = path.join(directory, "settings.json");
  let state = { ...DEFAULTS };
  const canEncrypt = () =>
    encryption.isEncryptionAvailable() &&
    (!encryption.getSelectedStorageBackend ||
      encryption.getSelectedStorageBackend() !== "basic_text");
  const decrypt = () => {
    if (!state.encryptedKey || !canEncrypt()) return "";
    try {
      return encryption.decryptString(
        Buffer.from(state.encryptedKey, "base64"),
      );
    } catch {
      return "";
    }
  };
  const publicSettings = () => ({
    model: state.model,
    annaUrl: state.annaUrl,
    hasApiKey: Boolean(decrypt()),
  });
  return {
    async load() {
      try {
        const saved = JSON.parse(await fs.readFile(file, "utf8"));
        state = { ...DEFAULTS };
        if (
          typeof saved.model === "string" &&
          /^[a-zA-Z0-9._:/-]{1,120}$/.test(saved.model)
        )
          state.model =
            saved.model === "gpt-6-astra" ? "gpt-5-nano" : saved.model;
        if (typeof saved.annaUrl === "string") {
          try {
            state.annaUrl = httpsURL(saved.annaUrl).href;
          } catch {}
        }
        if (
          typeof saved.encryptedKey === "string" &&
          saved.encryptedKey.length < 20000
        )
          state.encryptedKey = saved.encryptedKey;
      } catch (error) {
        if (error.code !== "ENOENT")
          console.warn(
            "As configurações não puderam ser lidas; usando padrões.",
          );
      }
      return publicSettings();
    },
    get: publicSettings,
    apiKey: decrypt,
    async save(input) {
      if (!input || typeof input !== "object")
        throw new Error("Configurações inválidas.");
      const next = { ...state };
      if (input.model !== undefined) {
        boundedString(input.model, "Modelo", 120);
        if (!/^[a-zA-Z0-9._:/-]+$/.test(input.model))
          throw new Error("Identificador de modelo inválido.");
        next.model = input.model;
      }
      if (input.annaUrl !== undefined)
        next.annaUrl = httpsURL(input.annaUrl).href;
      if (input.apiKey !== undefined) {
        boundedString(input.apiKey, "Chave de API", 4096, true);
        if (input.apiKey.trim()) {
          if (!canEncrypt())
            throw new Error(
              "A proteção do sistema para guardar a chave está indisponível.",
            );
          next.encryptedKey = encryption
            .encryptString(input.apiKey.trim())
            .toString("base64");
        }
      }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.writeFile(file + ".tmp", JSON.stringify(next), { mode: 0o600 });
      await fs.rename(file + ".tmp", file);
      state = next;
      return publicSettings();
    },
  };
}
module.exports = { settingsStore, DEFAULTS };
