package org.folio.reader;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import okhttp3.HttpUrl;
import org.json.JSONObject;

public class CatalogTest {
    private HttpUrl base() throws Exception { return FolioPlugin.httpsURL("https://annas-archive.gl"); }

    @Test public void buildsSourceVerifiedSearchParametersWithoutQueryInjection() throws Exception {
        HttpUrl url = FolioPlugin.catalogSearchURL(base().toString(), new JSONObject().put("query", "Alice &ext=pdf").put("page", 2).put("language", "en"));
        assertEquals("/search", url.encodedPath()); assertEquals("Alice &ext=pdf", url.queryParameter("q"));
        assertEquals("epub", url.queryParameter("ext")); assertEquals("list_compact", url.queryParameter("display"));
        assertEquals("2", url.queryParameter("page")); assertEquals("en", url.queryParameter("lang"));
        try { FolioPlugin.catalogSearchURL(base().toString(), new JSONObject().put("query", "Alice").put("page", 1.5)); fail("fractional page accepted"); } catch (FolioPlugin.UserError expected) {}
        try { FolioPlugin.catalogSearchURL(base().toString(), new JSONObject().put("query", "Alice").put("format", "pdf")); fail("unsupported format accepted"); } catch (FolioPlugin.UserError expected) {}
    }

    @Test public void parsesCompactCardsDerivedFromPinnedOfficialTemplate() throws Exception {
        // Structure derived from the official list_compact template at commit 8d4c23e.
        // This is a parser fixture, not a claim that live search currently returns these books.
        String id = "0123456789abcdef0123456789abcdef";
        String html = "<div class='js-aarecord-list-outer'><a class='js-vim-focus' href='/md5/"+id+"'>"
            + "<img src='https://127.0.0.1/private.png'><div class='text-gray-500'>English [en], .epub, 2.4 MB</div>"
            + "<h3>Alice &amp; a book</h3><div class='italic'>Public author</div></a>"
            + "<a class='js-vim-focus' href='https://evil.example/md5/abcdefabcdefabcdefabcdefabcdefab'><h3>External</h3></a></div>"
            + "<a href='/search?q=Alice&amp;page=2&amp;display=list_compact'>Next</a>";
        JSONObject parsed = FolioPlugin.parseCatalogHTML(html, base(), 1, 200);
        assertEquals(1, parsed.getJSONArray("results").length()); assertTrue(parsed.getBoolean("hasMore"));
        JSONObject item = parsed.getJSONArray("results").getJSONObject(0);
        assertEquals(id, item.getString("id")); assertEquals("Alice & a book", item.getString("title"));
        assertEquals("Public author", item.getString("author")); assertEquals("en", item.getString("language"));
        assertEquals("epub", item.getString("format")); assertEquals("2.4 MB", item.getString("size"));
        assertTrue(item.getString("url").startsWith(base().toString())); assertFalse(item.has("coverUrl"));
    }

    @Test public void detectsActualCapturedDdosGuardResponseInsteadOfReportingEmptySearch() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/anna-challenge.html")) {
            assertNotNull(input);
            String html = new String(FolioPlugin.readLimited(input, 8L * 1024 * 1024), StandardCharsets.UTF_8);
            JSONObject captured = FolioPlugin.parseCatalogHTML(html, base(), 1, 403);
            assertTrue(captured.getBoolean("challenge")); assertTrue(captured.has("error"));
            assertEquals(0, captured.getJSONArray("results").length()); assertFalse(captured.getBoolean("hasMore"));
            assertTrue(FolioPlugin.parseCatalogHTML(html, base(), 1, 200).getBoolean("challenge"));
        }
    }

    @Test public void distinguishesChangedMarkupFromARealEmptyResultsContainer() throws Exception {
        assertTrue(FolioPlugin.parseCatalogHTML("<html>Unknown page</html>", base(), 1, 200).has("error"));
        JSONObject empty = FolioPlugin.parseCatalogHTML("<div class='js-aarecord-list-outer'></div>", base(), 1, 200);
        assertFalse(empty.has("error")); assertEquals(0, empty.getJSONArray("results").length());
    }

    @Test public void rejectsCrossOriginAndPrivilegedCatalogLinks() throws Exception {
        for (String link : new String[]{"https://evil.example/book", "https://127.0.0.1/book", "https://[::1]/book", "file:///book", "javascript:alert(1)", "https://u:p@annas-archive.gl/book"}) {
            try { FolioPlugin.catalogLink(base(), link); fail(link); } catch (FolioPlugin.UserError expected) {}
        }
        assertEquals("annas-archive.gl", FolioPlugin.catalogLink(base(), "/search?q=Alice").host());
    }

    @Test public void exportsMetricsWithTheMatchingDocumentMimeTypes() {
        assertEquals("text/csv", FolioPlugin.exportMime("metricas.csv")); assertEquals("application/json", FolioPlugin.exportMime("metricas.JSON"));
        assertEquals("text/markdown", FolioPlugin.exportMime("notas.md")); assertEquals("text/plain", FolioPlugin.exportMime("notas.txt"));
    }
}
