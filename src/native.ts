import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import type { ChatRequest, Settings } from "./types";
interface NativeAPI {
  addListener(
    eventName: string,
    listener: (data: any) => void,
  ): Promise<PluginListenerHandle>;
  recommendationsFeed(): Promise<{base64: string}>;
  openRecommendations(): Promise<void>;
  neuralVoices(): Promise<{voices: import("./types").NeuralVoice[]}>;
  downloadNeuralVoice(input: {id: string}): Promise<void>;
  beginKindleShare(): Promise<void>;
  putKindleBook(input: {id: string; offset: number; base64: string; complete: boolean; title?: string; author?: string}): Promise<void>;
  startKindleShare(): Promise<{url: string; expiresAt: number}>;
  stopKindleShare(): Promise<void>;
  kindleShareStatus(): Promise<{running: boolean}>;
  setAppTheme(input: { theme: string }): Promise<void>;
  setImmersive(input: { enabled: boolean }): Promise<void>;
  speak(input: {
    text: string;
    language?: string;
    voice?: string;
    rate?: number;
    sleepUntil?: number;
  }): Promise<void>;
  speechVoices(): Promise<{
    voices: { id: string; name: string; language: string; network: boolean }[];
  }>;
  speechTimer(input: { sleepUntil: number }): Promise<void>;
  stopSpeaking(): Promise<void>;
  searchBooks(input: {
    query: string;
    language?: string;
    page?: number;
  }): Promise<import("./catalog").CatalogResult>;
  searchCatalog(input: {
    query: string;
    language?: string;
    format?: string;
    page?: number;
  }): Promise<import("./catalog").CatalogResult>;
  openCatalog(input: {
    url: string;
    collect?: "search" | "links";
  }): Promise<void>;
  catalogLinks(input: {
    url: string;
  }): Promise<import("./catalog").CatalogLinks>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: {
    model?: string;
    annaUrl?: string;
    apiKey?: string;
    annaKey?: string;
    removeAnnaKey?: boolean;
  }): Promise<Settings>;
  chat(request: ChatRequest): Promise<{ text: string }>;
  openExternal(input: { url: string }): Promise<void>;
  download(input: { url: string }): Promise<{ name: string; base64: string }>;
  downloadAnna(input: {
    md5: string;
    pathIndex?: number;
    domainIndex?: number;
  }): Promise<{
    name: string;
    base64: string;
    quota?: { remaining: number; perDay: number };
  }>;
  exportFile(input: {
    name: string;
    text: string;
  }): Promise<{ saved: boolean }>;
}
let foreground = true;
export const isAppForeground = () => foreground;
const native = registerPlugin<NativeAPI>("FolioNative");
export function initializeNative() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add("native-app");
  const stateChanged = ({ isActive }: { isActive: boolean }) => {
    foreground = isActive;
    window.dispatchEvent(new Event("folio-app-state"));
  };
  void CapacitorApp.getState().then(stateChanged);
  void CapacitorApp.addListener("appStateChange", stateChanged);
  void CapacitorApp.addListener("pause", () =>
    stateChanged({ isActive: false }),
  );
  void CapacitorApp.addListener("resume", () =>
    stateChanged({ isActive: true }),
  );
  void CapacitorApp.addListener("backButton", () => {
    const event = new Event("folio-back", { cancelable: true });
    if (window.dispatchEvent(event)) void CapacitorApp.exitApp();
  });
  void native.addListener("speechStopped", () =>
    window.dispatchEvent(new Event("folio-speech-stopped")),
  );
  void native.addListener("speechProgress", (detail) =>
    window.dispatchEvent(new CustomEvent("folio-speech-progress", { detail })),
  );
  void native.addListener("speechError", () =>
    window.dispatchEvent(new Event("folio-speech-error")),
  );
  void native.addListener("speechEnded", () =>
    window.dispatchEvent(new Event("folio-speech-ended")),
  );
  void native.addListener("catalogResults", (result) =>
    window.dispatchEvent(
      new CustomEvent("folio-catalog-results", { detail: result }),
    ),
  );
  void native.addListener("catalogDownload", (result) => {
    const raw = atob(result.base64);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    window.dispatchEvent(
      new CustomEvent("folio-catalog-download", {
        detail: { name: result.name, data: bytes },
      }),
    );
  });
  void native.addListener("catalogLinks", (result) =>
    window.dispatchEvent(
      new CustomEvent("folio-catalog-links", { detail: result }),
    ),
  );
  void native.addListener("neuralDownloadProgress", detail => window.dispatchEvent(new CustomEvent("folio-neural-download", {detail})));
  window.folio = {
    recommendationsFeed: () => native.recommendationsFeed(),
    openRecommendations: () => native.openRecommendations(),
    neuralVoices: () => native.neuralVoices(),
    downloadNeuralVoice: id => native.downloadNeuralVoice({id}),
    beginKindleShare: () => native.beginKindleShare(),
    putKindleBook: (input) => native.putKindleBook(input),
    startKindleShare: () => native.startKindleShare(),
    stopKindleShare: () => native.stopKindleShare(),
    kindleShareStatus: () => native.kindleShareStatus(),
    searchBooks: (input) => native.searchBooks(input),
    searchCatalog: (input) => native.searchCatalog(input),
    openCatalog: (url, options) => native.openCatalog({ url, ...options }),
    catalogLinks: (url) => native.catalogLinks({ url }),
    setAppTheme: (theme) => native.setAppTheme({ theme }),
    setImmersive: (enabled) => native.setImmersive({ enabled }),
    speechTimer: (sleepUntil) => native.speechTimer({ sleepUntil }),
    speak: (text, options) => native.speak({ text, ...options }),
    speechVoices: () => native.speechVoices(),
    stopSpeaking: () => native.stopSpeaking(),
    getSettings: () => native.getSettings(),
    saveSettings: (s) => native.saveSettings(s),
    chat: (r) => native.chat(r),
    openExternal: (url) => native.openExternal({ url }),
    download: async (url) => {
      const r = await native.download({ url });
      const raw = atob(r.base64);
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      return { name: r.name, data };
    },
    downloadAnna: async (md5, options) => {
      const r = await native.downloadAnna({ md5, ...options });
      const data = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      return { name: r.name, data, quota: r.quota };
    },
    exportFile: async (name, text) =>
      (await native.exportFile({ name, text })).saved,
  };
}
