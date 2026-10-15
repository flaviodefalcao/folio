package org.folio.reader;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** Fixed, public, read-only curation source. No user cookies or credentials are sent. */
final class RecommendationsSource {
    static final String SITE = "https://curadoria-flavio.glossy-bead-2771.chatgpt.site/";
    static final String FEED = "https://docs.google.com/spreadsheets/d/1pVi-r2cOlY_fdVOrGeQg8XB0QJqXT0lUpaZljlDH9Jk/export?format=xlsx";
    static boolean allowedFeed(HttpUrl url) {
        String host = url.host();
        return url.isHttps() && url.port() == 443 && url.username().isEmpty() && url.password().isEmpty()
            && (host.equals("docs.google.com") || host.endsWith(".googleusercontent.com"));
    }
    static byte[] fetch(OkHttpClient client) throws Exception {
        HttpUrl url = HttpUrl.get(FEED);
        for (int hop = 0; hop < 5; hop++) {
            if (!allowedFeed(url)) throw new Exception("Origem da planilha não permitida");
            try (Response response = client.newCall(new Request.Builder().url(url).header("User-Agent", "Folio/0.10 Entrelinhas").build()).execute()) {
                if (response.isRedirect()) {
                    String location = response.header("Location");
                    url = location == null ? null : url.resolve(location);
                    if (url == null) throw new Exception("Redirecionamento inválido");
                    continue;
                }
                if (!response.isSuccessful() || response.body() == null) throw new Exception("Planilha indisponível");
                int limit = 8 * 1024 * 1024;
                if (response.body().contentLength() > limit) throw new Exception("Planilha muito grande");
                try (InputStream input = response.body().byteStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] bytes = new byte[16384]; int count, size = 0;
                    while ((count = input.read(bytes)) != -1) { size += count; if (size > limit) throw new Exception("Planilha muito grande"); output.write(bytes, 0, count); }
                    return output.toByteArray();
                }
            }
        }
        throw new Exception("Redirecionamentos demais");
    }
}
