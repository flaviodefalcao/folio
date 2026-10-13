"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "folio",
  Object.freeze({
    getSettings: () => ipcRenderer.invoke("folio:settings:get"),
    saveSettings: (settings) =>
      ipcRenderer.invoke("folio:settings:save", settings),
    chat: (request) => ipcRenderer.invoke("folio:chat", request),
    openExternal: (url) => ipcRenderer.invoke("folio:external", url),
    download: (url) => ipcRenderer.invoke("folio:download", url),
    exportFile: (name, text) => ipcRenderer.invoke("folio:export", name, text),
  }),
);
