import JSZip from "jszip";
import { get, getMany, setMany, delMany } from "idb-keyval";
import type { BookRecord, Chapter } from "./types";

const STORAGE_KEY = "folio:ids:v1";
const metaKey = (id: string) => `folio:book:${id}`;
const dataKey = (id: string) => `folio:data:${id}`;
const dataMarker = (id: string) => `folio:stored:${id}`;
let storageQueue: Promise<unknown> = Promise.resolve();
export async function loadBooks(): Promise<BookRecord[]> {
  const ids = (await get<string[]>(STORAGE_KEY)) || [];
  const records = await getMany<Omit<BookRecord, "data">>(ids.map(metaKey));
  const buffers = await getMany<ArrayBuffer>(ids.map(dataKey));
  return records.flatMap((book, i) =>
    book && buffers[i] ? [{ ...book, data: buffers[i] }] : [],
  );
}
export async function saveBook(book: BookRecord): Promise<void> {
  const operation = storageQueue.then(async () => {
    const ids = (await get<string[]>(STORAGE_KEY)) || [];
    const { data, ...metadata } = book;
    const changes: [IDBValidKey, unknown][] = [
      [metaKey(book.id), metadata],
      [STORAGE_KEY, [book.id, ...ids.filter((id) => id !== book.id)]],
    ];
    if (!(await get<boolean>(dataMarker(book.id))))
      changes.push([dataKey(book.id), data], [dataMarker(book.id), true]);
    await setMany(changes);
  });
  storageQueue = operation.catch(() => {});
  return operation;
}
export async function deleteBook(id: string): Promise<void> {
  const operation = storageQueue.then(async () => {
    const ids = (await get<string[]>(STORAGE_KEY)) || [];
    await setMany([[STORAGE_KEY, ids.filter((bookId) => bookId !== id)]]);
    await delMany([metaKey(id), dataKey(id), dataMarker(id)]);
  });
  storageQueue = operation.catch(() => {});
  return operation;
}

function xml(source: string, name: string): Document {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source))
    throw new Error(
      `O EPUB contém uma declaração XML não permitida (${name}).`,
    );
  // EPUB 2 frequently contains a standard XHTML PUBLIC doctype. Remove it without resolving any DTD.
  const doc = new DOMParser().parseFromString(
    source.replace(/<!DOCTYPE[^>]*>/gi, ""),
    "application/xml",
  );
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error(`XML inválido no EPUB: ${name}.`);
  return doc;
}
const elements = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagNameNS("*", name));
const firstText = (doc: Document, name: string) =>
  elements(doc, name)[0]?.textContent?.trim() || "";
function resolvePath(base: string, href: string): string {
  if (
    !href ||
    /^(?:[a-z][\w+.-]*:|\/\/|\/|\\)/i.test(href) ||
    href.includes("\\")
  )
    throw new Error("O EPUB contém um caminho de recurso inválido.");
  const path = decodeURIComponent(href.split(/[?#]/)[0]);
  const parts = base.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "..") {
      if (!parts.length)
        throw new Error("Um recurso do EPUB aponta para fora do arquivo.");
      parts.pop();
    } else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

const ALLOWED_TAGS = new Set(
  "html head title meta link style body section article aside nav header footer main div span p br hr h1 h2 h3 h4 h5 h6 a img picture source figure figcaption blockquote pre code em strong b i u s small sub sup abbr cite q time mark ruby rt rp ol ul li dl dt dd table caption colgroup col thead tbody tfoot tr td th svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask pattern symbol use image desc"
    .toLowerCase()
    .split(" "),
);
const safeReference = (value: string) =>
  !/[\u0000-\u0020\\]/.test(value) &&
  !/^(?:[a-z][\w+.-]*:|\/\/|\/)/i.test(value);
function sanitizeCss(css: string): string {
  // Escaped identifiers and URL declarations are intentionally discarded; local typography remains.
  if (css.includes("\\")) return "";
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(
      /[^{};]+:\s*[^{};]*(?:url\s*\(|expression\s*\(|javascript:|behavior\s*:)[^{};]*;?/gi,
      "",
    )
    .replace(/@font-face\s*\{[^}]*\}/gi, "");
}
function sanitizeMarkup(source: string, name: string): string {
  const doc = xml(source, name);
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (!ALLOWED_TAGS.has(el.localName.toLowerCase())) {
      el.remove();
      continue;
    }
    if (el.localName === "meta" && el.hasAttribute("http-equiv")) {
      el.remove();
      continue;
    }
    if (el.localName === "link" && el.getAttribute("rel") !== "stylesheet") {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const key = attr.localName.toLowerCase();
      if (
        key.startsWith("on") ||
        [
          "srcset",
          "srcdoc",
          "action",
          "formaction",
          "ping",
          "download",
          "integrity",
          "nonce",
        ].includes(key)
      )
        el.removeAttributeNode(attr);
      else if (
        ["href", "src", "poster", "background"].includes(key) &&
        !safeReference(attr.value)
      )
        el.removeAttributeNode(attr);
      else if (key === "style")
        el.setAttribute("style", sanitizeCss(attr.value));
    }
    if (el.localName === "style")
      el.textContent = sanitizeCss(el.textContent || "");
  }
  return new XMLSerializer().serializeToString(doc);
}
function chapterText(doc: Document): string {
  const body = elements(doc, "body")[0] || doc.documentElement;
  const copy = body.cloneNode(true) as Element;
  for (const e of elements(copy, "style")) e.remove();
  for (const e of Array.from(
    copy.querySelectorAll(
      "p,h1,h2,h3,h4,h5,h6,li,blockquote,div,section,article,tr,br,hr",
    ),
  ))
    e.appendChild(doc.createTextNode("\n\n"));
  return (copy.textContent || "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
async function dataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a capa."));
    reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  });
}

/** Validate and neutralize executable/remote book content before it reaches the renderer. */
export async function importEpub(file: File): Promise<BookRecord> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Este EPUB ultrapassa o limite de 100 MB.");
  if (!file.size) throw new Error("O arquivo está vazio.");
  const original = await file.arrayBuffer();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(original, { checkCRC32: false });
  } catch {
    throw new Error(
      "Não foi possível abrir este arquivo. Escolha um EPUB válido e sem DRM.",
    );
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > 5000)
    throw new Error("O EPUB contém arquivos demais (limite: 5.000).");
  let total = 0;
  for (const entry of entries) {
    const size =
      (entry as unknown as { _data?: { uncompressedSize: number } })._data
        ?.uncompressedSize || 0;
    total += size;
    if (size > 25 * 1024 * 1024 || total > 200 * 1024 * 1024)
      throw new Error(
        "O conteúdo descompactado do EPUB excede os limites de segurança.",
      );
  }
  const read = async (path: string) => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`Recurso ausente no EPUB: ${path}.`);
    return entry.async("string");
  };
  if ((await read("mimetype")).trim() !== "application/epub+zip")
    throw new Error("Este arquivo não tem o formato EPUB esperado.");
  if (zip.file("META-INF/encryption.xml")) {
    const encryption = xml(
      await read("META-INF/encryption.xml"),
      "encryption.xml",
    );
    const methods = elements(encryption, "EncryptionMethod");
    if (
      methods.some(
        (e) =>
          ![
            "http://www.idpf.org/2008/embedding",
            "http://ns.adobe.com/pdf/enc#RC",
          ].includes(e.getAttribute("Algorithm") || ""),
      )
    )
      throw new Error(
        "EPUB com DRM não é suportado. Importe um livro sem proteção.",
      );
  }
  const container = xml(await read("META-INF/container.xml"), "container.xml");
  const root = elements(container, "rootfile")[0]?.getAttribute("full-path");
  if (!root || root.startsWith("/") || root.includes(".."))
    throw new Error("Não foi encontrado um pacote EPUB válido.");
  const opf = xml(await read(root), root);
  const manifest = new Map(
    elements(opf, "item").map((el) => [
      el.getAttribute("id") || "",
      {
        href: el.getAttribute("href") || "",
        mime: el.getAttribute("media-type") || "",
        properties: el.getAttribute("properties") || "",
      },
    ]),
  );
  const spine = elements(opf, "itemref").filter(
    (e) => e.getAttribute("linear") !== "no",
  );
  if (!spine.length) throw new Error("O EPUB não contém capítulos de leitura.");
  // Sanitize every markup resource, including SVG images outside the reading order.
  for (const entry of entries) {
    if (/\.(xhtml|html|htm|svg)$/i.test(entry.name))
      zip.file(
        entry.name,
        sanitizeMarkup(await entry.async("string"), entry.name),
      );
    else if (/\.css$/i.test(entry.name))
      zip.file(entry.name, sanitizeCss(await entry.async("string")));
    else if (/\.(js|mjs|cjs)$/i.test(entry.name)) zip.remove(entry.name);
  }
  for (const item of manifest.values()) {
    if (
      ["application/xhtml+xml", "text/html", "image/svg+xml"].includes(
        item.mime,
      ) &&
      zip.file(resolvePath(root, item.href))
    ) {
      const path = resolvePath(root, item.href);
      zip.file(path, sanitizeMarkup(await read(path), path));
    }
    if (item.mime === "text/css" && zip.file(resolvePath(root, item.href))) {
      const path = resolvePath(root, item.href);
      zip.file(path, sanitizeCss(await read(path)));
    }
  }
  const toc: BookRecord["toc"] = [];
  const nav = Array.from(manifest.values()).find((i) =>
    i.properties.split(/\s+/).includes("nav"),
  );
  if (nav) {
    const navPath = resolvePath(root, nav.href);
    const navDoc = xml(await read(navPath), navPath);
    const navElement =
      elements(navDoc, "nav").find(
        (n) =>
          n.getAttribute("epub:type")?.split(/\s+/).includes("toc") ||
          n.getAttribute("role") === "doc-toc",
      ) || elements(navDoc, "nav")[0];
    if (navElement)
      for (const a of elements(navElement, "a")) {
        const href = a.getAttribute("href") || "";
        if (href && safeReference(href)) {
          const absolute = resolvePath(navPath, href);
          const relative = absolute.startsWith(
            root.slice(0, root.lastIndexOf("/") + 1),
          )
            ? absolute.slice(root.lastIndexOf("/") + 1)
            : absolute;
          toc.push({
            label: a.textContent?.trim() || "Capítulo",
            href:
              relative + (href.includes("#") ? "#" + href.split("#")[1] : ""),
          });
        }
      }
  }
  if (!toc.length) {
    const ncx = Array.from(manifest.values()).find(
      (i) => i.mime === "application/x-dtbncx+xml",
    );
    if (ncx) {
      const path = resolvePath(root, ncx.href),
        doc = xml(await read(path), path);
      for (const point of elements(doc, "navPoint")) {
        const label = elements(point, "navLabel")[0]?.textContent?.trim(),
          src = elements(point, "content")[0]?.getAttribute("src");
        if (label && src && safeReference(src)) toc.push({ label, href: src });
      }
    }
  }
  const chapters: Chapter[] = [];
  for (const [index, ref] of spine.entries()) {
    const id = ref.getAttribute("idref") || "",
      item = manifest.get(id);
    if (!item)
      throw new Error("O índice do EPUB aponta para um capítulo ausente.");
    if (!["application/xhtml+xml", "text/html"].includes(item.mime)) continue;
    const path = resolvePath(root, item.href),
      doc = xml(await read(path), path);
    const label =
      toc.find((t) => t.href.split("#")[0] === item.href)?.label ||
      firstText(doc, "h1") ||
      firstText(doc, "h2") ||
      `Capítulo ${index + 1}`;
    const text = chapterText(doc);
    if (text) chapters.push({ id, label, href: item.href, text });
  }
  if (!chapters.length)
    throw new Error("Não foi encontrado texto legível neste EPUB.");
  if (!toc.length)
    toc.push(...chapters.map(({ label, href }) => ({ label, href })));
  const coverId = elements(opf, "meta")
    .find((e) => e.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const coverItem =
    Array.from(manifest.values()).find((i) =>
      i.properties.split(/\s+/).includes("cover-image"),
    ) || (coverId ? manifest.get(coverId) : undefined);
  let cover: string | undefined;
  if (
    coverItem &&
    /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(coverItem.mime)
  ) {
    const entry = zip.file(resolvePath(root, coverItem.href));
    if (entry)
      cover = await dataUrl(await entry.async("uint8array"), coverItem.mime);
  }
  const hash = await crypto.subtle.digest("SHA-256", original);
  const id = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    id,
    title: firstText(opf, "title") || file.name.replace(/\.epub$/i, ""),
    author: firstText(opf, "creator") || "Autor desconhecido",
    cover,
    data: await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
    }),
    chapters,
    toc,
    added: Date.now(),
    lastOpened: 0,
    progress: 0,
    collection: "",
    favorite: false,
    finished: false,
    annotations: [],
    bookmarks: [],
    messages: [],
  };
}
