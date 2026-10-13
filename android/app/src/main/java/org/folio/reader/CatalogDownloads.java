package org.folio.reader;

import java.util.HashSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import okhttp3.HttpUrl;
import org.json.JSONArray;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

final class CatalogDownloads {
    static JSONObject parse(String html, HttpUrl page, int status) throws Exception {
        JSONObject result = new JSONObject().put("options", new JSONArray()).put("sourceUrl", page.toString());
        if (AnnaPremium.challenge(html, status)) return result.put("challenge", true).put("error", "O site pediu uma verificação para mostrar os links.");
        if (status != 200) return result.put("error", "Os links não carregaram. Você pode abrir a página do livro dentro do app.");
        Document doc = Jsoup.parse(html, page.toString());
        if (doc.selectFirst("#md5-panel-downloads") == null) return result.put("error", "A página ainda não mostrou os links de download.");
        JSONArray options = new JSONArray(); HashSet<String> seen = new HashSet<>();
        for (Element link : doc.select("#md5-panel-downloads a.js-download-link[href]")) {
            HttpUrl url;
            try { HttpUrl resolved = page.resolve(link.attr("href")); if (resolved == null) continue; url = FolioPlugin.httpsURL(resolved.toString()); } catch (FolioPlugin.UserError invalid) { continue; }
            if (!seen.add(url.toString())) continue;
            String label = link.text().trim(); if (label.isEmpty()) label = url.host(); if (label.length() > 180) label = label.substring(0, 180);
            JSONObject option = new JSONObject().put("id", "link-" + options.length()).put("label", label).put("url", url.toString()).put("kind", "page");
            Matcher fast = Pattern.compile("/fast_download/([a-fA-F0-9]{32})/([0-9]+)/([0-9]+)/?").matcher(url.encodedPath());
            if (FolioPlugin.sameOrigin(page, url) && fast.matches() && page.encodedPath().replaceAll("/$", "").equalsIgnoreCase("/md5/" + fast.group(1))) {
                try {
                    int path = Integer.parseInt(fast.group(2)), domain = Integer.parseInt(fast.group(3));
                    if (path > 1000 || domain > 1000) continue;
                    option.put("kind", "premium").put("pathIndex", path).put("domainIndex", domain);
                } catch (NumberFormatException invalid) { continue; }
            } else if (url.encodedPath().toLowerCase(java.util.Locale.ROOT).endsWith(".epub")) option.put("kind", "direct");
            options.put(option); if (options.length() >= 30) break;
        }
        return result.put("options", options);
    }
}
