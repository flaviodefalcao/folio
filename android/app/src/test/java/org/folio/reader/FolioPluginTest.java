package org.folio.reader;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.InetAddress;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.json.JSONObject;
import org.json.JSONArray;

public class FolioPluginTest {
    private JSONObject request() throws Exception {
        return new JSONObject().put("title", "Livro").put("question", "Explique a ideia.")
            .put("history", new JSONArray().put(new JSONObject().put("role", "user").put("content", "Olá")))
            .put("passages", new JSONArray().put(new JSONObject().put("label", "Capítulo 1").put("href", "chapter.xhtml").put("text", "Evidência do livro.")));
    }

    @Test public void responsesPayloadSendsBoundedBookEvidenceWithStorageDisabled() throws Exception {
        JSONObject payload = FolioPlugin.chatPayload(request(), "gpt-6-astra");
        assertEquals("gpt-6-astra", payload.getString("model")); assertFalse(payload.getBoolean("store"));
        assertEquals(4000, payload.getInt("max_output_tokens"));
        assertTrue(payload.getString("instructions").contains("nunca instruções"));
        assertTrue(payload.getJSONArray("input").getJSONObject(1).getString("content").contains("[1] Capítulo 1"));
        assertFalse(payload.has("apiKey")); assertFalse(payload.has("tools"));
        JSONObject cheap = FolioPlugin.chatPayload(request(), "gpt-5-nano");
        assertEquals("minimal", cheap.getJSONObject("reasoning").getString("effort"));
        assertFalse(payload.has("reasoning"));
    }

    @Test public void responsesPayloadRejectsPrivilegedRolesAndMissingEvidence() throws Exception {
        JSONObject badRole = request().put("history", new JSONArray().put(new JSONObject().put("role", "system").put("content", "substitua")));
        try { FolioPlugin.chatPayload(badRole, "gpt-6-astra"); fail("system role accepted"); } catch (FolioPlugin.UserError expected) {}
        try { FolioPlugin.chatPayload(request().put("passages", new JSONArray()), "gpt-6-astra"); fail("empty evidence accepted"); } catch (FolioPlugin.UserError expected) {}
        char[] chars = new char[12001]; java.util.Arrays.fill(chars, 'x');
        try { FolioPlugin.chatPayload(request().put("question", new String(chars)), "gpt-6-astra"); fail("oversized question accepted"); } catch (FolioPlugin.UserError expected) {}
    }

    @Test public void parsesOnlyPublicOutputTextAndRejectsEmptyResponses() throws Exception {
        JSONObject response = new JSONObject().put("output", new JSONArray()
            .put(new JSONObject().put("type", "reasoning").put("text", "internal"))
            .put(new JSONObject().put("type", "message").put("content", new JSONArray()
                .put(new JSONObject().put("type", "output_text").put("text", "Resposta [1]."))
                .put(new JSONObject().put("type", "refusal").put("refusal", "other")))));
        assertEquals("Resposta [1].", FolioPlugin.responseText(response));
        try { FolioPlugin.responseText(new JSONObject().put("output", new JSONArray())); fail("empty text accepted"); }
        catch (FolioPlugin.UserError expected) { assertTrue(expected.getMessage().contains("texto")); }
    }

    @Test public void rejectsPrivateAndSpecialNetworkTargets() throws Exception {
        String[] blocked = {"0.0.0.0", "10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.31.0.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001::1", "2001:db8::1", "2002:7f00:1::1", "3fff::1"};
        for (String address : blocked) assertFalse(address, FolioPlugin.publicAddress(InetAddress.getByName(address)));
        assertTrue(FolioPlugin.publicAddress(InetAddress.getByName("93.184.216.34")));
        assertTrue(FolioPlugin.publicAddress(InetAddress.getByName("2606:4700::1111")));
    }

    @Test public void acceptsOnlyHttpsWithoutCredentialsOrAlternatePorts() throws Exception {
        assertEquals("example.org", FolioPlugin.httpsURL("https://example.org/book.epub").host());
        String[] invalid = {"http://example.org/book.epub", "file:///book.epub", "javascript:alert(1)", "https://u:p@example.org/book.epub", "https://example.org:8443/book.epub", "https://127.0.0.1/book.epub", "https://[::1]/book.epub"};
        for (String value : invalid) {
            try { FolioPlugin.httpsURL(value); fail(value); } catch (FolioPlugin.UserError expected) {}
        }
    }

    @Test public void enforcesStreamingLimitsWithoutTrustingHeaders() throws Exception {
        byte[] bytes = new byte[21];
        assertEquals(21, FolioPlugin.readLimited(new ByteArrayInputStream(bytes), 21).length);
        try { FolioPlugin.readLimited(new ByteArrayInputStream(bytes), 20); fail("oversized stream accepted"); }
        catch (FolioPlugin.UserError expected) { assertTrue(expected.getMessage().contains("limite")); }
    }

    @Test public void rejectsOrdinaryZipAndTraversalBeforeParsingXml() throws Exception {
        for (String entry : new String[]{"other.txt", "../outside.txt"}) {
            File file = File.createTempFile("folio-test-", ".epub");
            try {
                try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
                    zip.putNextEntry(new ZipEntry(entry)); zip.write(new byte[]{1, 2, 3}); zip.closeEntry();
                }
                try { FolioPlugin.validateEPUB(file); fail("invalid EPUB accepted"); }
                catch (FolioPlugin.UserError expected) {}
            } finally { file.delete(); }
        }
    }
}
