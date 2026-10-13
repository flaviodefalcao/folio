export type NeuralVoice = {id: string; name: string; language: string; bytes: number; installed: boolean};
export type Chapter = { id: string; label: string; href: string; text: string };
export type Annotation = {
  id: string;
  cfi: string;
  text: string;
  note: string;
  color: string;
  chapter: string;
  created: number;
};
export type Bookmark = { cfi: string; label: string };
export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { label: string; href: string; excerpt: string }[];
};
export type ReaderPrefs = {
  theme: "paper" | "sepia" | "night";
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  width: number;
  flow: "paginated" | "scrolled-doc";
};
export type BookRecord = {
  id: string;
  title: string;
  author: string;
  cover?: string;
  data: ArrayBuffer;
  chapters: Chapter[];
  toc: { label: string; href: string }[];
  added: number;
  lastOpened: number;
  cfi?: string;
  progress: number;
  collection: string;
  favorite: boolean;
  finished: boolean;
  annotations: Annotation[];
  bookmarks: Bookmark[];
  messages: Message[];
  prefs?: ReaderPrefs;
  readingBaseline?: { at: number; progress: number };
};
export type AnnaQuota = {
  remaining: number;
  perDay: number;
  reportedAt?: number;
};
export type Settings = {
  model: string;
  annaUrl: string;
  hasApiKey: boolean;
  hasAnnaKey?: boolean;
  supportsAnnaPremium?: boolean;
  supportsIntegratedCatalog?: boolean;
  annaQuota?: AnnaQuota;
};
export type BookDownload = {
  name: string;
  data: Uint8Array;
  quota?: AnnaQuota;
};
export type ChatRequest = {
  title: string;
  question: string;
  selection?: string;
  history: { role: "user" | "assistant"; content: string }[];
  passages: { label: string; href: string; text: string }[];
};
declare global {
  interface Window {
    folio?: {
      neuralVoices?(): Promise<{voices: NeuralVoice[]}>;
      downloadNeuralVoice?(id: string): Promise<void>;
      beginKindleShare?(): Promise<void>;
      putKindleBook?(input: {id: string; offset: number; base64: string; complete: boolean; title?: string; author?: string}): Promise<void>;
      startKindleShare?(): Promise<{url: string; expiresAt: number}>;
      stopKindleShare?(): Promise<void>;
      kindleShareStatus?(): Promise<{running: boolean}>;
      setAppTheme?(theme: "dark" | "light"): Promise<void>;
      setImmersive?(enabled: boolean): Promise<void>;
      speak?(
        text: string,
        options?: {
          language?: string;
          voice?: string;
          rate?: number;
          sleepUntil?: number;
        },
      ): Promise<void>;
      speechVoices?(): Promise<{
        voices: {
          id: string;
          name: string;
          language: string;
          network: boolean;
        }[];
      }>;
      speechTimer?(sleepUntil: number): Promise<void>;
      stopSpeaking?(): Promise<void>;
      searchBooks?(input: {
        query: string;
        language?: string;
        page?: number;
      }): Promise<import("./catalog").CatalogResult>;
      searchCatalog?(input: {
        query: string;
        language?: string;
        format?: string;
        page?: number;
      }): Promise<import("./catalog").CatalogResult>;
      openCatalog?(
        url: string,
        options?: { collect?: "search" | "links" },
      ): Promise<void>;
      catalogLinks?(url: string): Promise<import("./catalog").CatalogLinks>;
      getSettings(): Promise<Settings>;
      saveSettings(settings: {
        model?: string;
        annaUrl?: string;
        apiKey?: string;
        annaKey?: string;
        removeAnnaKey?: boolean;
      }): Promise<Settings>;
      chat(request: ChatRequest): Promise<{ text: string }>;
      openExternal(url: string): Promise<void>;
      download(url: string): Promise<{ name: string; data: Uint8Array }>;
      downloadAnna?(
        md5: string,
        options?: { pathIndex?: number; domainIndex?: number },
      ): Promise<BookDownload>;
      exportFile(name: string, text: string): Promise<boolean>;
    };
  }
}
