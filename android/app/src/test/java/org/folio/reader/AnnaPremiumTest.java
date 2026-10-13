package org.folio.reader;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.HttpUrl;
import okhttp3.FormBody;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.json.JSONObject;

public class AnnaPremiumTest {
    private final String hash = "0123456789abcdef0123456789abcdef";
    private HttpUrl base() { return HttpUrl.get("https://annas-archive.gl/"); }
    private Response response(Request request, int status, String body) {
        return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("fixture")
            .body(ResponseBody.create(body, MediaType.get("application/json"))).build();
    }

    @Test public void secretsOnlyGoToExplicitOfficialHostsAndExactEndpoint() throws Exception {
        Request request = AnnaPremium.downloadRequest(HttpUrl.get("https://annas-archive.gl/account/?unrelated=value"), "FAKE-key&md5=evil", hash.toUpperCase());
        assertEquals("GET", request.method()); assertEquals("/dyn/api/fast_download.json", request.url().encodedPath());
        assertEquals(hash, request.url().queryParameter("md5")); assertEquals("FAKE-key&md5=evil", request.url().queryParameter("key"));
        assertNull(request.url().queryParameter("unrelated")); assertEquals("0", request.url().queryParameter("path_index"));
        for (String url : Arrays.asList("https://evil.example/", "https://annas-archive.gl.evil.example/", "http://annas-archive.gl/", "https://user:password@annas-archive.gl/")) {
            try { AnnaPremium.origin(HttpUrl.get(url)); fail(url); } catch (FolioPlugin.UserError expected) {}
        }
        for (String bad : Arrays.asList("", hash + "?key=evil", "../../file", hash.substring(1))) {
            try { AnnaPremium.md5(bad); fail(bad); } catch (FolioPlugin.UserError expected) {}
        }
    }

    @Test public void sourceVerifiedTicketExposesOnlyNumericQuota() throws Exception {
        JSONObject data = new JSONObject().put("download_url", "https://books.example/signed.epub")
            .put("account_fast_download_info", new JSONObject().put("downloads_left", 24).put("downloads_per_day", 25)
                .put("recently_downloaded_md5s", Arrays.asList(hash)).put("account_secret", "MUST-NOT-BE-RETURNED"));
        AnnaPremium.Ticket ticket = AnnaPremium.parseTicket(data, 200);
        assertEquals("books.example", ticket.url.host()); assertEquals(24, ticket.quota.getInt("remaining")); assertEquals(25, ticket.quota.getInt("perDay"));
        assertEquals(2, ticket.quota.length()); assertFalse(ticket.quota.toString().contains(hash)); assertFalse(ticket.quota.toString().contains("MUST-NOT"));
        data.getJSONObject("account_fast_download_info").put("downloads_left", 2.5);
        assertNull(AnnaPremium.parseTicket(data, 200).quota);
    }

    @Test public void rejectsInvalidOrPrivateDownloadDestinations() throws Exception {
        for (String url : Arrays.asList("http://books.example/book.epub", "https://127.0.0.1/book.epub", "https://[::1]/book.epub", "https://user:secret@books.example/book.epub", "javascript:alert(1)")) {
            try { AnnaPremium.parseTicket(new JSONObject().put("download_url", url), 200); fail(url); } catch (FolioPlugin.UserError expected) {}
        }
        try { AnnaPremium.parseTicket(new JSONObject().put("download_url", JSONObject.NULL), 200); fail(); } catch (FolioPlugin.UserError expected) {}
    }

    @Test public void mapsOfficialFailuresWithoutEchoingResponseOrSecret() throws Exception {
        for (String error : Arrays.asList("Invalid secret key", "Not a member", "No downloads left", "Record not found", "Invalid domain_index or path_index", "unknown FAKE-SECRET")) {
            try { AnnaPremium.parseTicket(new JSONObject().put("error", error).put("download_url", JSONObject.NULL), 400); fail(error); }
            catch (FolioPlugin.UserError expected) { assertFalse(expected.getMessage().contains("FAKE-SECRET")); assertFalse(expected.getMessage().isEmpty()); }
        }
    }

    @Test public void officialLoginStaysNativeCachesSessionAndNeverFollowsSecretRedirect() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        OkHttpClient client = new OkHttpClient.Builder().addInterceptor(chain -> {
            Request request = chain.request(); calls.incrementAndGet();
            assertEquals("annas-archive.gl", request.url().host()); assertEquals("/account/", request.url().encodedPath()); assertEquals("POST", request.method());
            assertEquals("FAKE-MEMBER-KEY", ((FormBody) request.body()).value(0));
            return response(request, 302, "").newBuilder().header("Location", "https://evil.example/collect")
                .addHeader("Set-Cookie", "aa_account_id2=FAKE-session; Domain=annas-archive.gl; Path=/; Secure; HttpOnly").build();
        }).build();
        AnnaPremium premium = new AnnaPremium();
        assertEquals("aa_account_id2=FAKE-session", premium.session(client, base(), "FAKE-MEMBER-KEY", null, false));
        assertEquals("aa_account_id2=FAKE-session", premium.session(client, base(), "FAKE-MEMBER-KEY", null, false));
        assertEquals(1, calls.get()); premium.clear();
        premium.session(client, base(), "FAKE-MEMBER-KEY", null, false); assertEquals(2, calls.get());
        premium.session(client, base(), "FAKE-MEMBER-KEY", null, true); assertEquals(3, calls.get());
    }

    @Test public void rejectsForeignExpiredOrNonAccountCookiesAndKeepsOrdinaryVerificationCookie() throws Exception {
        assertTrue(AnnaPremium.accountCookies(base(), Arrays.asList("aa_account_id2=bad; Domain=evil.example; Path=/; Secure", "other=value; Path=/", "aa_account_id2=old; Path=/; Max-Age=0")).isEmpty());
        assertEquals("ddg=verification; other=ordinary; aa_account_id2=NEW", AnnaPremium.searchCookies("ddg=verification; aa_account_id2=OLD; other=ordinary", "aa_account_id2=NEW"));
    }

    @Test public void downloadApiRequestUsesBoundedNativeTransportAndDoesNotFollowRedirect() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        OkHttpClient client = new OkHttpClient.Builder().addInterceptor(chain -> {
            calls.incrementAndGet(); Request request = chain.request();
            assertEquals("/dyn/api/fast_download.json", request.url().encodedPath()); assertEquals(hash, request.url().queryParameter("md5"));
            assertEquals("FAKE-MEMBER-KEY", request.url().queryParameter("key"));
            return response(request, 302, "").newBuilder().header("Location", "https://evil.example/?key=FAKE-MEMBER-KEY").build();
        }).build();
        try { AnnaPremium.ticket(client, base(), "FAKE-MEMBER-KEY", hash); fail(); }
        catch (FolioPlugin.UserError expected) { assertFalse(expected.getMessage().contains("FAKE-MEMBER-KEY")); }
        assertEquals(1, calls.get());
    }

    @Test public void actualChallengeIsSeparateFromInvalidCredentials() throws Exception {
        OkHttpClient client = new OkHttpClient.Builder().addInterceptor(chain -> response(chain.request(), 403, "<html><title>DDoS-Guard</title></html>")
            .newBuilder().header("Content-Type", "text/html").build()).build();
        try { new AnnaPremium().session(client, base(), "FAKE-MEMBER-KEY", null, false); fail(); } catch (AnnaPremium.VerificationRequired expected) {}
        try { AnnaPremium.ticket(client, base(), "FAKE-MEMBER-KEY", hash); fail(); } catch (AnnaPremium.VerificationRequired expected) {}
    }

    @Test public void neverForwardsTheAccountKeyInAServerReturnedDownloadUrl() throws Exception {
        OkHttpClient client = new OkHttpClient.Builder().addInterceptor(chain -> response(chain.request(), 200,
            "{\"download_url\":\"https://books.example/book.epub?key=FAKE-MEMBER-KEY\"}")).build();
        try { AnnaPremium.ticket(client, base(), "FAKE-MEMBER-KEY", hash); fail(); }
        catch (FolioPlugin.UserError expected) { assertFalse(expected.getMessage().contains("FAKE-MEMBER-KEY")); }
    }
}
