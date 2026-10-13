package org.folio.reader;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import okhttp3.Cookie;
import okhttp3.FormBody;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONObject;

/** Official member protocol. Credentials and signed download URLs stay native. */
final class AnnaPremium {
    // Domains declared by the official config/settings.py at commit 8d4c23e.
    private static final List<String> HOSTS = Arrays.asList("annas-archive.gl", "annas-archive.gd", "annas-archive.pk");
    private String sessionFingerprint = "";
    private List<Cookie> sessionCookies = new ArrayList<>();
    private long sessionUntil;
    private String userAgent = "Folio/0.3 Android";

    synchronized void userAgent(String value) { if (value != null && !value.isEmpty()) userAgent = value; }

    static HttpUrl origin(HttpUrl url) throws FolioPlugin.UserError {
        url = FolioPlugin.httpsURL(url.toString());
        if (!HOSTS.contains(url.host())) throw new FolioPlugin.UserError("Para usar a chave premium, configure um domínio reconhecido: annas-archive.gl, annas-archive.gd ou annas-archive.pk.");
        return url.newBuilder().encodedPath("/").query(null).fragment(null).build();
    }

    static String md5(String value) throws FolioPlugin.UserError {
        if (value == null || !value.matches("(?i)[a-f0-9]{32}")) throw new FolioPlugin.UserError("Identificador de arquivo inválido para o download premium.");
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    static Request downloadRequest(HttpUrl base, String key, String hash) throws Exception {
        return downloadRequest(base, key, hash, 0, 0);
    }

    static Request downloadRequest(HttpUrl base, String key, String hash, int pathIndex, int domainIndex) throws Exception {
        if (pathIndex < 0 || pathIndex > 1000 || domainIndex < 0 || domainIndex > 1000) throw new FolioPlugin.UserError("Servidor de download inválido.");
        if (key == null || key.trim().isEmpty() || key.length() > 4096) throw new FolioPlugin.UserError("Configure sua chave premium nas Preferências.");
        HttpUrl url = origin(base).newBuilder().encodedPath("/dyn/api/fast_download.json")
            .addQueryParameter("md5", md5(hash)).addQueryParameter("key", key)
            .addQueryParameter("path_index", String.valueOf(pathIndex)).addQueryParameter("domain_index", String.valueOf(domainIndex)).build();
        return new Request.Builder().url(url).header("Accept", "application/json").header("User-Agent", "Folio/0.3 Android").build();
    }

    static final class Ticket {
        final HttpUrl url;
        final JSONObject quota;
        Ticket(HttpUrl url, JSONObject quota) { this.url = url; this.quota = quota; }
    }

    static Ticket parseTicket(JSONObject data, int status) throws Exception {
        String error = data.optString("error", "").toLowerCase(java.util.Locale.ROOT).replace('_', ' ');
        if (!error.isEmpty() || (status != 200 && status != 204)) {
            if (error.contains("secret key") || error.contains("invalid key") || status == 401) throw new FolioPlugin.UserError("A chave premium foi recusada. Confira a chave da sua conta nas Preferências.");
            if (error.contains("not a member") || error.contains("no membership")) throw new FolioPlugin.UserError("Esta conta não tem uma assinatura premium ativa.");
            if (error.contains("no downloads left") || error.contains("quota") || status == 429) throw new FolioPlugin.UserError("A franquia de downloads rápidos da sua conta foi esgotada.");
            if (error.contains("record not found") || error.contains("not available") || status == 404) throw new FolioPlugin.UserError("Este arquivo não está disponível na API de downloads rápidos.");
            if (error.contains("path index") || error.contains("domain index")) throw new FolioPlugin.UserError("Este arquivo não está disponível no servidor premium selecionado. Use os downloads da página do livro.");
            throw new FolioPlugin.UserError("A API premium não concluiu a solicitação. Tente novamente ou abra a página do livro.");
        }
        Object value = data.opt("download_url");
        if (!(value instanceof String) || ((String) value).isEmpty()) throw new FolioPlugin.UserError("A API premium não retornou um link de download.");
        HttpUrl url = FolioPlugin.httpsURL((String) value);
        // Literal local addresses are rejected by httpsURL; hostnames are checked
        // by the downloader's protected DNS hook on every connection/redirect.
        JSONObject rawQuota = data.optJSONObject("account_fast_download_info"), quota = null;
        if (rawQuota != null) {
            Object remaining = rawQuota.opt("downloads_left"), perDay = rawQuota.opt("downloads_per_day");
            if (remaining instanceof Number && perDay instanceof Number && ((Number) remaining).doubleValue() == ((Number) remaining).intValue() && ((Number) perDay).doubleValue() == ((Number) perDay).intValue()
                && ((Number) remaining).intValue() >= 0 && ((Number) perDay).intValue() > 0) {
                quota = new JSONObject().put("remaining", ((Number) remaining).intValue()).put("perDay", ((Number) perDay).intValue());
            }
        }
        return new Ticket(url, quota);
    }

    static boolean challenge(String body, int status) {
        String lower = body.toLowerCase(java.util.Locale.ROOT);
        return status == 403 || status == 429 || lower.contains("ddos-guard") || lower.contains("cf-chl-") || lower.contains("checking your browser") || lower.contains("<title>just a moment");
    }

    static final class VerificationRequired extends Exception {}

    static Ticket ticket(OkHttpClient client, HttpUrl base, String key, String hash) throws Exception {
        return ticket(client, base, key, hash, null, "Folio/0.3 Android");
    }

    static Ticket ticket(OkHttpClient client, HttpUrl base, String key, String hash, String browserCookie, String userAgent) throws Exception {
        return ticket(client, base, key, hash, browserCookie, userAgent, 0, 0);
    }

    static Ticket ticket(OkHttpClient client, HttpUrl base, String key, String hash, String browserCookie, String userAgent, int pathIndex, int domainIndex) throws Exception {
        Request.Builder builder = downloadRequest(base, key, hash, pathIndex, domainIndex).newBuilder().header("User-Agent", userAgent);
        if (browserCookie != null && !browserCookie.isEmpty()) builder.header("Cookie", browserCookie);
        okhttp3.Call call = client.newBuilder().followRedirects(false).followSslRedirects(false).build().newCall(builder.build());
        call.timeout().timeout(30, TimeUnit.SECONDS);
        try (Response response = call.execute()) {
            String body = response.body() == null ? "" : new String(FolioPlugin.readLimited(response.body().byteStream(), 1024 * 1024), StandardCharsets.UTF_8);
            String type = response.header("Content-Type", "").toLowerCase(java.util.Locale.ROOT);
            if (!type.contains("json") && challenge(body, response.code())) throw new VerificationRequired();
            if (response.code() >= 300 && response.code() < 400) throw new FolioPlugin.UserError("A API premium mudou de endereço. Atualize o domínio nas Preferências; a chave não foi enviada ao redirecionamento.");
            JSONObject data;
            try { data = new JSONObject(body); } catch (Exception invalid) { throw new FolioPlugin.UserError("A API premium não respondeu em JSON. Abra o site dentro do app para verificar o acesso."); }
            Ticket ticket = parseTicket(data, response.code());
            if (ticket.url.toString().contains(key) || java.net.URLDecoder.decode(ticket.url.toString(), "UTF-8").contains(key)) throw new FolioPlugin.UserError("A API premium retornou um link inválido. O download não foi iniciado.");
            return ticket;
        }
    }

    synchronized void clear() {
        sessionFingerprint = ""; sessionCookies.clear(); sessionUntil = 0;
    }

    private static String fingerprint(HttpUrl base, String key) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest((base.host() + "\n" + key).getBytes(StandardCharsets.UTF_8));
        StringBuilder hash = new StringBuilder(); for (byte b : bytes) hash.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return hash.toString();
    }

    static List<Cookie> accountCookies(HttpUrl origin, List<String> headers) {
        List<Cookie> cookies = new ArrayList<>();
        for (String header : headers) {
            Cookie cookie = Cookie.parse(origin, header);
            if (cookie != null && cookie.name().equals("aa_account_id2") && cookie.matches(origin) && cookie.expiresAt() > System.currentTimeMillis()) cookies.add(cookie);
        }
        return cookies;
    }

    static String searchCookies(String browser, String member) {
        StringBuilder result = new StringBuilder();
        if (browser != null && browser.length() <= 32768) for (String cookie : browser.split(";")) {
            cookie = cookie.trim();
            if (!cookie.isEmpty() && !cookie.startsWith("aa_account_id2=")) result.append(cookie).append("; ");
        }
        return result.append(member).toString();
    }

    synchronized String session(OkHttpClient client, HttpUrl base, String key, String browserCookie, boolean force) throws Exception {
        base = origin(base); String id = fingerprint(base, key);
        if (force || !id.equals(sessionFingerprint) || System.currentTimeMillis() >= sessionUntil) {
            clear();
            Request.Builder builder = new Request.Builder().url(base.resolve("/account/"))
                .post(new FormBody.Builder().add("key", key).build()).header("User-Agent", userAgent);
            if (browserCookie != null && !browserCookie.isEmpty()) builder.header("Cookie", browserCookie);
            okhttp3.Call call = client.newBuilder().followRedirects(false).followSslRedirects(false).build().newCall(builder.build()); call.timeout().timeout(30, TimeUnit.SECONDS);
            try (Response response = call.execute()) {
                List<Cookie> cookies = accountCookies(base, response.headers("Set-Cookie"));
                if (!cookies.isEmpty() && (response.code() == 200 || response.code() == 302 || response.code() == 303)) {
                    sessionCookies = cookies; sessionFingerprint = id;
                    sessionUntil = System.currentTimeMillis() + TimeUnit.HOURS.toMillis(6);
                    for (Cookie cookie : cookies) sessionUntil = Math.min(sessionUntil, cookie.expiresAt());
                } else {
                    String body = response.body() == null ? "" : new String(FolioPlugin.readLimited(response.body().byteStream(), 1024 * 1024), StandardCharsets.UTF_8);
                    if (challenge(body, response.code())) throw new VerificationRequired();
                    if (response.code() >= 500) throw new FolioPlugin.UserError("O login do Anna’s Archive está indisponível. Tente novamente.");
                    throw new FolioPlugin.UserError("O Anna’s Archive não aceitou a chave da conta. Confira sua chave premium nas Preferências.");
                }
            }
        }
        StringBuilder result = new StringBuilder();
        for (Cookie cookie : sessionCookies) {
            if (result.length() > 0) result.append("; ");
            result.append(cookie.name()).append('=').append(cookie.value());
        }
        return result.toString();
    }
}
