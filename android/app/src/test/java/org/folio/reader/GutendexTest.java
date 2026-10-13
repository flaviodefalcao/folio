package org.folio.reader;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import okhttp3.HttpUrl;
import org.json.JSONObject;
import org.json.JSONArray;

public class GutendexTest {
    @Test public void encodesQueryAndUsesOnlyTheFixedPublicApiHost() throws Exception {
        HttpUrl url = FolioPlugin.gutendexSearchURL(new JSONObject().put("query", "Dom Casmurro &x=1").put("language", "pt").put("page", 2));
        assertEquals("gutendex.com", url.host()); assertEquals("/books/", url.encodedPath());
        assertEquals("dom casmurro &x=1", url.queryParameter("search")); assertNull(url.queryParameter("languages"));
        assertNull(url.queryParameter("mime_type")); assertNull(url.queryParameter("copyright"));
        assertNull(url.queryParameter("x")); assertEquals("2", url.queryParameter("page"));
        HttpUrl languageOnly = FolioPlugin.gutendexSearchURL(new JSONObject().put("query", "").put("language", "pt"));
        assertEquals("pt", languageOnly.queryParameter("languages")); assertNull(languageOnly.queryParameter("search")); assertNull(languageOnly.queryParameter("page"));
    }

    @Test public void parsesActualPortugueseResponseWithDirectEpubLinks() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/gutendex-portuguese.json")) {
            assertNotNull(input);
            JSONObject source = new JSONObject(new String(FolioPlugin.readLimited(input, 4L * 1024 * 1024), StandardCharsets.UTF_8));
            JSONObject result = FolioPlugin.parseGutendex(source, 1);
            assertEquals("gutenberg", result.getString("provider")); assertTrue(result.getBoolean("hasMore"));
            assertEquals(source.getInt("count"), result.getInt("count"));
            boolean foundDom = false;
            for (int i = 0; i < result.getJSONArray("results").length(); i++) {
                JSONObject book = result.getJSONArray("results").getJSONObject(i);
                assertEquals("epub", book.getString("format")); assertTrue(book.getString("downloadUrl").startsWith("https://www.gutenberg.org/"));
                if (book.getString("id").equals("gutenberg:55752")) { foundDom = true; assertTrue(book.getString("title").contains("Casmurro")); }
            }
            assertTrue("captured response must include Dom Casmurro", foundDom);
            JSONObject filtered = FolioPlugin.parseGutendex(source, 1, "xx");
            assertEquals(0, filtered.getJSONArray("results").length()); assertTrue(filtered.getBoolean("hasMore"));
        }
    }

    @Test public void filtersUntrustedDownloadsCopyrightedBooksAndNonEpubEntries() throws Exception {
        JSONArray books = new JSONArray();
        for (String link : new String[]{"https://127.0.0.1/book.epub", "http://www.gutenberg.org/book.epub", "https://evil.example/book.epub", "javascript:alert(1)"}) {
            books.put(new JSONObject().put("id", 1).put("title", "Unsafe").put("copyright", false).put("formats", new JSONObject().put("application/epub+zip", link)));
        }
        books.put(new JSONObject().put("id", 2).put("title", "Restricted").put("copyright", true).put("formats", new JSONObject().put("application/epub+zip", "https://www.gutenberg.org/ebooks/2.epub3.images")));
        books.put(new JSONObject().put("id", 3).put("title", "Text only").put("copyright", false).put("formats", new JSONObject().put("text/plain", "https://www.gutenberg.org/ebooks/3.txt")));
        JSONObject result = FolioPlugin.parseGutendex(new JSONObject().put("results", books).put("next", "https://127.0.0.1/books/"), 1);
        assertEquals(0, result.getJSONArray("results").length()); assertFalse(result.getBoolean("hasMore"));
    }
}
