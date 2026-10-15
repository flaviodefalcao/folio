# Folio

An open-source EPUB reader for Android with a local library, text-to-speech narration, reading statistics, and book conversations powered by the OpenAI API.

Folio is an independent implementation inspired by familiar reading features. The original Folio source is MIT-licensed; dependencies retain their own licenses. Neural Android binaries include GPL-3.0 components; see [runtime notices](NEURAL-NOTICES.md). The current app interface is in Portuguese. This README uses English descriptions and includes Portuguese labels where useful.

## Download and install

**[Download Folio 0.10.0 beta for Android](https://github.com/flaviodefalcao/folio/releases/download/v0.10.0/Folio-Android-v0.10.0.apk)**

Requires **Android 7.0 (API 24) or later on an ARM device (arm64-v8a or armeabi-v7a)** and an up-to-date Android System WebView. Open the APK on your phone and allow installation from the application used to download it when Android asks.

To update an existing Folio installation, install the new APK **without uninstalling**. Official releases use the same package name and signing key to preserve local data. The APK is distributed directly through GitHub Releases and is not listed on Google Play.

Books, reading positions, notes, and conversations stay on your device. Reading imported EPUBs works offline. Online catalogs, dictionary lookups, and OpenAI conversations require internet access.

## Reading and library

- Import DRM-free EPUB files using **Add EPUB** (`Adicionar EPUB`), multiple file selection, or drag and drop in supported environments.
- Browse a minimal cover grid and adjust cover size using the display controls next to the library title. Your choice is saved.
- Manage favorites, collections, completed books, and sorting by title, author, or recency.
- Use paginated or scrolling navigation, a table of contents, saved progress, and bookmarks.
- Adjust font, size, spacing, and reading width.
- Search words or phrases with accent-insensitive matching. Results open the relevant chapter; exact occurrence positioning is not guaranteed.
- Select text to highlight it, add an editable note, open Wiktionary, or ask the AI about the passage. Notes can be exported as Markdown.
- View suggested next reads based on unfinished books and authors or topics found in your favorites and completed books. Each suggestion explains its reason.

The included **A arte de ler devagar** is an original four-chapter demonstration book. Reading it does not make AI requests.

The previous expanded library layout remains available: turn off **Minimal view** (`Visual minimalista`) in the display controls. Its header and continue-reading card can be collapsed independently.

## Fullscreen and gestures

Tap the fullscreen button in the reader to hide menus and use almost the entire screen, with small margins and a discreet location/progress footer.

- Tap the center of the page to show controls.
- Tap the right or left quarter of the screen to turn pages in paginated mode.
- Swipe horizontally to move forward or backward.
- Pinch to adjust font size between 14 and 36.

Links, text selection, and scrolling retain their own interactions. On Android, fullscreen hides the system bars; an edge gesture can reveal them temporarily. Leaving the reader restores them.

## Audio player

Folio uses the text-to-speech voices installed on your device. Install any additional voice data through Android's text-to-speech settings. Voices requiring a network connection are identified in the selector.

The player provides:

- Book cover, chapter selection, play/pause, and previous/next chapter controls.
- Voice, language, and speed selection from 0.5× to 2×.
- Playback from the current paragraph or selected text.
- A continuously updating timeline, seeking within a passage, and approximately 30-second skips.
- Sleep timers of 5, 15, 30, or 60 minutes.
- Page bookmarks and a compact player while you read.
- Optional automatic page following as narration moves beyond the visible text.

Titles, headings, paragraphs, lists, and quotations retain block separation during extraction. Android adds explicit pauses between blocks. Abbreviations, decimal numbers, and Unicode text are preserved.

Android playback uses a foreground media service with a notification and a Stop action. Some voices require internet access. Playback duration and seeks are estimated because the speech engine does not provide an exact total duration. Resume and page-following precision depend on the progress events supported by the selected engine.

This is synthetic narration using device voices. Folio does not include Audible's service or catalog. **Background listening time is not yet included in reading statistics.**

## Light and dark themes

Open **More → Preferences → App theme** (`Mais → Preferências → Tema do aplicativo`) and choose **Light** (`Claro`) or **Dark** (`Escuro`).

The saved choice applies to the library, native search interface, statistics, dialogs, reader, and audio player, as well as Android system-bar contrast. Changing the theme from the reader also updates the rest of the app. Legacy sepia preferences remain compatible in storage but are no longer offered as a third theme. External websites retain their own appearance.

## Reading statistics

The dashboard is organized into four tabs:

| Tab | Contents |
| --- | --- |
| Overview (`Visão geral`) | Reading streak, current week, daily goal, annual book challenge, and period summary |
| History (`Histórico`) | Comparisons, reading calendar, recent sessions, exports, and monthly/yearly retrospectives |
| Books (`Livros`) | Reading time, progress, estimated pace and completion, with links to open each book |
| Profile (`Perfil`) | Topic, language, author, and format distributions, notes, reviewed highlights, and learned words |

Statistics include minutes and hours by day, week, month, and year; daily averages; session counts and average length; best day; time per book; usual reading hours; and a thirteen-week calendar. Tap a day in the streak display to view its history.

The daily goal and annual book goal are configurable. Annual completion progress counts distinct books recorded as completed in that year. A reading streak requires at least one minute per day; yesterday's streak remains valid until today ends if you have not read yet.

Comparisons use corresponding days actually recorded in both periods. Days before tracking began are unknown, rather than zero. Historical averages include complete days with no reading but exclude today and a partial activation day.

Personal pace estimates require at least one minute and measurable progress recorded after the relevant update. Until enough history exists, chapter completion estimates use an explicitly indicated baseline of 200 words per minute. Topics, languages, learned words, and highlight reviews can be recorded in the Profile tab.

### How time is counted

Tracking begins with a loaded, visible book while the app is in the foreground. Silent reading pauses when opening panels, chat, preferences, or annotation editing, and when the app goes into the background or the screen locks.

By default, silent reading pauses after two minutes without interaction. Set the inactivity limit to 1, 2, 5, or 10 minutes under **Goal and tracking** (`Meta e contagem`). Tap, scroll, or turn a page to resume. Narration is recorded separately and also requires the app to be in the foreground. These measurements track active reader usage, not eye movement.

Durations use a monotonic clock. Days and hours use the device's local time, including hour boundaries, midnight, and daylight-saving changes. Records are saved every five seconds and when leaving or pausing; an abrupt system interruption can lose the unsaved fraction. Previous reading activity is not reconstructed. Removing a book preserves its time history for statistical averages.

Export daily totals as CSV or complete records as JSON. Statistics remain on the device and are not sent to OpenAI.

## Find and download EPUBs

Under **Discover books** (`Descobrir livros`), search by title or author. The primary public catalog uses actual **Gutendex/Project Gutenberg API** metadata and direct EPUB downloads. Adding a result downloads, validates, and imports it into the library.

The APK includes an offline index of **32 Portuguese classics**, including Dom Casmurro, Os Lusíadas, and Memórias Póstumas de Braz Cubas. It is a selected starter catalog, not the full Portuguese catalog. Expand the search online using **Expand through the API** (`Ampliar na API`). Previous online queries are cached for seven days. Change the language filter for other languages. Availability and latency depend on the public server; the catalog mainly contains public-domain works.

### Anna's Archive

The Android app supports an additional Anna's Archive catalog and premium downloads using the user's own account key.

Enter it under **Preferences → Anna's Archive premium key** (`Chave premium do Anna’s Archive`). The key is encrypted using AndroidKeyStore/AES-GCM and stored separately from the OpenAI key. Leaving the field blank preserves it; the removal option deletes it from that device.

The download API resolves files by MD5. It does not provide a public JSON title-search endpoint. Android search loads the actual search page in an isolated in-app browser, then returns parsed results to the native list. **View links** (`Ver links`) shows available addresses and servers. Choose a supported download to validate and import the EPUB directly into the library. Links requiring additional website steps offer **Continue in the app** (`Continuar dentro do app`).

Normal website verification may still be required. The isolated browser has no access to the OpenAI key; Folio does not bypass verification challenges. The premium key and signed API URLs are kept in native code rather than displayed in download links. Account sessions remain in native memory.

Recognized domains for transmitting the premium key are `annas-archive.gl`, `annas-archive.gd`, and `annas-archive.pk`, based on inspected official source. Additional domains require verification before being added. A download API request can consume account quota even if a subsequent transfer fails. The catalog displays the latest quota reported by the server.

Premium protocol tests use controlled responses, not a real premium account. Users configure their own credentials on their device.

**Import link** (`Importar link`) also accepts a public, direct HTTPS EPUB URL. Android downloads have a 40 MB limit. Availability is not guaranteed; errors are shown in the interface. The public-catalog flow has been tested with actual Project Gutenberg EPUBs.

## Chat with a book

1. Enter your own OpenAI API key in Preferences. Android stores it encrypted with AndroidKeyStore/AES-GCM; Electron uses `safeStorage`. The raw key is not returned to the interface.
2. Select a model available to your API account. The default is **`gpt-5-nano`** with minimal reasoning effort. Its listed price on October 12, 2026 was US$0.05 per million input tokens and US$0.40 per million output tokens. Check [OpenAI's pricing page](https://developers.openai.com/api/docs/pricing) for current prices.
3. Open a book and choose **Chat** (`Conversar`), or select a passage and choose **Ask AI** (`Perguntar à IA`).
4. Local keyword retrieval selects up to eight passages and sends the last eight messages, capped at 6,000 characters per message. Answers request numbered references; context controls open the source chapters.

The integration uses the separately billed **OpenAI API**. A ChatGPT subscription does not automatically include API credits. Only the book title, conversation history, selected text, and retrieved passages are sent when you ask a question. Responses requests use `store:false`; other provider policies still apply.

Retrieval does not exhaustively read long books and can miss semantic matches. Check the supplied sources. Conversations are stored locally with the book.

## Data and credentials

Library data is stored in IndexedDB within Folio's private application profile. API keys are stored in encrypted private preferences. Import and export use file pickers rather than broad storage permissions.

Removing a book deletes its EPUB, notes, and conversation from the library. Keep backups of your original files: uninstalling the app or clearing its data removes local content.

EPUB import validates ZIP/XML, limits resources, and removes scripts, frames, forms, remote URLs, and active CSS. Embedded CSS fonts or unsupported elements may be omitted. Book frames do not run scripts. Electron also uses sandboxing and context isolation. Downloads enforce size/time limits, HTTPS, DNS checks, and redirect validation, and reject private-network destinations.

**No OpenAI key, Anna's Archive key, personal library, or private signing key is distributed with this project.** Tests use nonfunctional credentials. Never commit `.env` files, personal databases, credential-bearing captures, keystores, or their passwords.

## Build from source

```sh
npm ci
bash scripts/bootstrap-android.sh
npm run android:build
```

Android/JDK dependencies are isolated in `.toolchain`, without changing global installations. On the first build, the script generates a local signing key and reuses it for later builds.

Keep these files in a private backup if you need to sign your own compatible updates:

- `.toolchain/folio-release.jks`
- `.toolchain/keystore-password`
- `.toolchain/signing.properties`

These files are excluded from Git and source archives. **A newly generated local key cannot update an APK signed with the official release key.** The official private signing key is not published.

The code also includes an Electron application (`npm run desktop`) and a browser preview (`npm run dev`). The browser preview supports library and reading workflows; native integrations require Android or Electron.

## Verify the application

```sh
npm run build
npx playwright install chromium
npm test
npm run android:build
```

Version 0.7.0 passed **45 JavaScript tests and 30 JVM tests**, plus the release build and APK signature verification. Browser tests cover actual EPUB import/rendering, persistence, statistics with a virtual clock, theme switching, audio controls, and simulated native transport. Backend tests exercise the real SDK against controlled responses without API charges.

Device-specific voices, long-running background playback, and native system-bar appearance have not been fully verified on the user's physical phone. A real OpenAI response requires a user-configured key with API access and credit.

## Current scope

Folio currently supports EPUB reading, synthetic narration, local organization, statistics, and the integrations described above. It does not provide cross-device synchronization, an Amazon store or Kindle Unlimited access, AZW/KFX/MOBI/PDF reading, DRM removal, X-Ray, popular highlights, integrated translation, or a recorded audiobook catalog. Dictionary lookups open an external service.

## Kindle connection (Android 0.8.0)

A jailbroken Kindle running KOReader can download selected EPUBs from Folio over the same trusted Wi-Fi network. In Folio, open **More → Connect Kindle**, select up to 10 books (40 MB per book, 200 MB per session), and start sharing. Add the displayed URL as an OPDS catalog in KOReader and download a book. Keep Folio in the foreground while downloading.

The catalog uses local HTTP, a new random eight-digit access code for every session (the session closes after ten unauthorized requests), an IPv4 Wi-Fi address, and a 15-minute lifetime. It closes when Folio leaves the foreground or the connection screen closes. Only selected EPUBs are served; API keys, annotations, conversations, and other private app files are excluded. Use a trusted network; HTTP traffic is not encrypted. Guest networks with client isolation and active VPNs may prevent connection.

This is a book-transfer integration. Reading positions, annotations, metrics, and Kindle extension updates are **not synchronized yet**. The Android APK itself does not run on a Kindle e-reader.

## Folio Kindle extension and audio

The optional [Folio KOReader extension](kindle/README.md) adds a Portuguese Folio menu for the phone OPDS catalog and the independently installed Audiobook Read-Along plugin. The audio plugin provides read-along, voice controls, and Bluetooth playback on supported devices; actual playback must be verified with headphones. The extension is separate from the Android APK. The current compact KT4 installation excludes optional Piper files due to storage limits.

## Built-in offline neural voices (Android 0.9.0)

Open a book, open the audio player, and choose **Voice and language → Offline neural voices**. Download **Faber (Brazilian Portuguese)** or **Lessac (American English)**, approximately 67 MB each. Folio verifies each archive against a pinned SHA-256 digest and installs it in private app storage. After downloading, select the neural voice and start narration. No separate TTS application, API key, or subscription is required. Internet access is used for downloading the voice; synthesis and playback run on the device.

Neural narration preserves the existing speed controls, timer, text transition, and background audio service. Progress follows sentences; within-sentence timing is estimated from playback duration. Generation speed and battery usage depend on the phone. Initial model loading and sentence generation can introduce pauses. Downloading requires at least 300 MB of free storage for installation. Keep the app open during the download.

The original Folio source remains MIT-licensed. The neural Android binary includes GPL-3.0 eSpeak components and is distributed under GPL-3.0 terms for the combined binary. See [neural runtime notices and corresponding source links](NEURAL-NOTICES.md). The pinned runtime is downloaded by `scripts/prepare-neural-runtime.py` during the Android build; the AAR is excluded from Git.


## Entrelinhas recommendations (Android 0.10.0 beta)

The **Recomendações** tab opens Entrelinhas in a separate in-app WebView. The page has no Capacitor bridge, access to the library, or access to API keys. Sign in to ChatGPT when prompted. Some identity providers restrict embedded sign-in; an external-browser button is available, but browser and WebView sessions are separate.

The suggested-book list reads the public **Livros** and **Livros do dia** worksheets from the same curation spreadsheet. It refreshes on launch, resume, and every five minutes while Folio is active; cached suggestions remain visible offline. This source is read-only and does not receive your reading history or notes.

Automatic importing is enabled by default for this integration and can be disabled in **Recomendações → Livros sugeridos**. Configure your existing Anna’s Archive premium key in **Preferências**. Folio searches Anna’s Archive for each suggestion, filters EPUB results by title and author, selects the first matching edition in search order, downloads through the existing premium endpoint, validates the EPUB and its metadata, and adds it to the **Entrelinhas** collection. An optional direct HTTPS EPUB URL in the worksheet is also supported. Publisher landing pages are never treated as EPUB files.

Transfers run sequentially while Folio is active and outside the reader. They use your account’s existing download allowance; no key is embedded in this repository. A verification challenge, connectivity failure, or exhausted quota can pause the queue. No CAPTCHA bypass is attempted. Unavailable books show a search button, and **Atualizar** retries pending or failed suggestions. Previously imported books are not automatically reimported after deletion. Imports do not overwrite existing reading progress or notes. This is not an Android background scheduler: the app must be open for the queue to advance.

Validation covers the real public spreadsheet, mocked premium search/download through EPUB validation and persistent library import, duplicate prevention, wrong-author rejection, secure source redirects, mobile layout and the signed Android build. A real premium API transfer was verified with **The Craftsman** by Richard Sennett (recommended as **O artífice**): a 1,993,021-byte EPUB with the expected MD5 was imported, persisted and rendered by Folio. The native catalog parser also recognized a matching EPUB in an actual authenticated search response. Embedded ChatGPT login and execution on a physical phone still need device testing.
