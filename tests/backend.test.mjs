import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import security from "../electron/security.cjs";
import settingsModule from "../electron/settings.cjs";
import aiModule from "../electron/ai.cjs";
const {
  httpsURL,
  publicIP,
  downloadEPUB,
  validateChat,
  chatMessages,
  validateEPUB,
} = security;
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (data, status = 200, headers = {}) => ({
  status,
  headers,
  body: Readable.from([data]),
});
const book = async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>',
  );
  zip.file("content.opf", "<package/>");
  return zip.generateAsync({ type: "nodebuffer" });
};

test("IPC accepts only the trusted local main frame and denies book frames or another window", () => {
  const mainFrame = { url: "file:///tmp/folio/dist/index.html" };
  const webContents = { mainFrame };
  const window = { webContents };
  const event = { sender: webContents, senderFrame: mainFrame };
  assert.equal(
    security.isTrustedIPC(event, window, "/tmp/folio/dist/index.html"),
    true,
  );
  assert.equal(
    security.isTrustedIPC(
      { ...event, senderFrame: { url: mainFrame.url } },
      window,
      "/tmp/folio/dist/index.html",
    ),
    false,
  );
  assert.equal(
    security.isTrustedIPC(
      { ...event, sender: {} },
      window,
      "/tmp/folio/dist/index.html",
    ),
    false,
  );
  mainFrame.url = "https://example.org/";
  assert.equal(
    security.isTrustedIPC(event, window, "/tmp/folio/dist/index.html"),
    false,
  );
  mainFrame.url = "file:///tmp/other.html";
  assert.equal(
    security.isTrustedIPC(event, window, "/tmp/folio/dist/index.html"),
    false,
  );
});

test("download URLs reject insecure schemes, credentials and alternate ports", () => {
  for (const url of [
    "file:///a.epub",
    "http://example.org/a.epub",
    "https://u:p@example.org/a.epub",
    "https://example.org:8443/a.epub",
    "javascript:alert(1)",
  ])
    assert.throws(() => httpsURL(url));
  assert.equal(httpsURL("https://example.org/a.epub").hostname, "example.org");
});

test("local, private, shared and documentation addresses cannot be download targets", () => {
  for (const ip of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.31.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "3fff::1",
  ])
    assert.equal(publicIP(ip), false, ip);
  assert.equal(publicIP("93.184.216.34"), true);
  assert.equal(publicIP("2606:4700::1111"), true);
});

test("redirects revalidate DNS and prevent reaching private networks", async () => {
  const requests = [];
  await assert.rejects(
    downloadEPUB("https://public.example/book.epub", {
      lookup: async (host) => [
        {
          address: host === "internal.example" ? "127.0.0.1" : "93.184.216.34",
          family: 4,
        },
      ],
      transport: async (url) => {
        requests.push(url.href);
        return response("", 302, {
          location: "https://internal.example/book.epub",
        });
      },
    }),
    /público/,
  );
  assert.equal(requests.length, 1);
  await assert.rejects(
    downloadEPUB("https://example.org/a.epub", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
      transport: async () => {
        throw new Error("must never request");
      },
    }),
    /público/,
  );
});

test("valid EPUB download returns bytes and a clean filename", async () => {
  const data = await book();
  const result = await downloadEPUB("https://example.org/book%3F.epub", {
    lookup,
    transport: async (_url, addresses) => {
      assert.equal(addresses[0].address, "93.184.216.34");
      return response(data, 200, { "content-type": "application/epub+zip" });
    },
  });
  assert.equal(result.name, "book_.epub");
  assert.deepEqual(Buffer.from(result.data), data);
});

test("download deadline also bounds stalled DNS resolution", async () => {
  await assert.rejects(
    downloadEPUB("https://example.org/book.epub", {
      timeoutMs: 10,
      lookup: () => new Promise(() => {}),
      transport: () => {
        throw new Error("must never request");
      },
    }),
    /tempo limite/,
  );
});

test("downloads reject HTML, malformed ZIP, missing EPUB metadata and oversized streams", async () => {
  await assert.rejects(
    downloadEPUB("https://example.org/book.epub", {
      lookup,
      transport: async () =>
        response("<html/>", 200, { "content-type": "text/html" }),
    }),
    /página/,
  );
  await assert.rejects(
    downloadEPUB("https://example.org/book.epub", {
      lookup,
      transport: async () => response("invalid epub"),
    }),
    /EPUB válido/,
  );
  await assert.rejects(
    downloadEPUB("https://example.org/book.epub", {
      lookup,
      maxBytes: 20,
      transport: async () => response(Buffer.alloc(21)),
    }),
    /limite/,
  );
  await assert.rejects(
    downloadEPUB("https://example.org/book.epub", {
      lookup,
      maxBytes: 20,
      transport: async () => response("", 200, { "content-length": "21" }),
    }),
    /limite/,
  );
  const zip = new JSZip();
  zip.file("other.txt", "not epub");
  await assert.rejects(
    validateEPUB(await zip.generateAsync({ type: "nodebuffer" })),
    /estrutura EPUB/,
  );
});

test("chat validates roles and bounds, keeps excerpts as data, and requires evidence", () => {
  const request = {
    title: "Livro",
    question: "Qual a ideia?",
    history: [],
    passages: [{ label: "Capítulo 1", href: "a.xhtml", text: "Evidência" }],
  };
  assert.equal(validateChat(request).passages.length, 1);
  assert.match(chatMessages(request).at(-1).content, /\[1\] Capítulo 1/);
  assert.throws(
    () =>
      validateChat({
        ...request,
        history: [{ role: "system", content: "overwrite" }],
      }),
    /Histórico/,
  );
  assert.throws(
    () => validateChat({ ...request, question: "x".repeat(12001) }),
    /Pergunta/,
  );
  assert.throws(() => validateChat({ ...request, passages: [] }), /trechos/);
  assert.throws(
    () =>
      validateChat({
        ...request,
        passages: Array(5).fill({
          label: "C",
          href: "c",
          text: "x".repeat(30000),
        }),
      }),
    /Contexto/,
  );
});

test("settings encrypt keys at rest and never expose them to renderer responses", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "folio-settings-"));
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
    decryptString: (b) => b.toString().split("").reverse().join(""),
  };
  try {
    const store = settingsModule.settingsStore(dir, encryption);
    await store.load();
    assert.equal(store.get().hasApiKey, false);
    const result = await store.save({
      apiKey: "sk-secret-test",
      model: "gpt-6-astra",
    });
    assert.deepEqual(Object.keys(result).sort(), [
      "annaUrl",
      "hasApiKey",
      "model",
    ]);
    assert.equal(result.hasApiKey, true);
    assert.equal(store.apiKey(), "sk-secret-test");
    assert.equal(
      (await readFile(path.join(dir, "settings.json"), "utf8")).includes(
        "sk-secret-test",
      ),
      false,
    );
    await store.save({ apiKey: "", annaUrl: "https://example.org" });
    assert.equal(store.apiKey(), "sk-secret-test");
    const reloaded = settingsModule.settingsStore(dir, encryption);
    await reloaded.load();
    assert.equal(reloaded.apiKey(), "sk-secret-test");
    await assert.rejects(
      store.save({ annaUrl: "http://example.org" }),
      /HTTPS/,
    );
    assert.equal(store.get().annaUrl, "https://example.org/");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("API key persistence refuses unavailable system encryption", async () => {
  const store = settingsModule.settingsStore("/unused", {
    isEncryptionAvailable: () => false,
  });
  await assert.rejects(store.save({ apiKey: "secret" }), /proteção/);
});

test("real AI SDK sends Responses context and store:false; only generated text is returned", async () => {
  let seen;
  const result = await aiModule.generateBookReply(
    "sk-test-only",
    "gpt-6-astra",
    {
      title: "Livro",
      question: "Explique",
      history: [{ role: "user", content: "Olá" }],
      passages: [
        { label: "Capítulo 1", href: "a.xhtml", text: "Evidência local" },
      ],
    },
    {
      fetch: async (url, options) => {
        seen = {
          url: String(url),
          body: JSON.parse(options.body),
          headers: options.headers,
        };
        return new Response(
          JSON.stringify({
            id: "resp_test",
            model: "gpt-6-astra",
            output: [
              {
                type: "message",
                id: "msg_test",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: "Explicação baseada no capítulo [1].",
                    annotations: [],
                  },
                ],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );
  assert.match(seen.url, /\/responses$/);
  assert.equal(seen.body.store, false);
  assert.equal(seen.body.model, "gpt-6-astra");
  assert.match(JSON.stringify(seen.body.input), /Evidência local/);
  assert.equal(JSON.stringify(seen.body).includes("sk-test-only"), false);
  assert.deepEqual(result, { text: "Explicação baseada no capítulo [1]." });
});
