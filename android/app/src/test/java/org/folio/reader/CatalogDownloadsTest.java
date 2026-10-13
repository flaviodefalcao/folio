package org.folio.reader;
import org.junit.Test;
import static org.junit.Assert.*;
import okhttp3.HttpUrl;
import org.json.JSONObject;
import org.json.JSONArray;

public class CatalogDownloadsTest {
    String hash = "0123456789abcdef0123456789abcdef";
    HttpUrl page() { return HttpUrl.get("https://annas-archive.gl/md5/" + hash); }
    @Test public void extractsActualLinksAndPremiumServerSelectionFromOfficialSelectors() throws Exception {
        String html = "<div id='md5-panel-downloads'><a class='js-download-link' href='/fast_download/"+hash+"/1/2'>Fast server 2</a>"
            + "<a class='js-download-link' href='https://books.example/book.epub'>EPUB source</a>"
            + "<a class='js-download-link' href='/slow_download/"+hash+"/0/0'>Slow source</a></div>";
        JSONArray links = CatalogDownloads.parse(html,page(),200).getJSONArray("options");
        assertEquals(3,links.length());assertEquals("premium",links.getJSONObject(0).getString("kind"));
        assertEquals(1,links.getJSONObject(0).getInt("pathIndex"));assertEquals(2,links.getJSONObject(0).getInt("domainIndex"));
        assertEquals("direct",links.getJSONObject(1).getString("kind"));assertEquals("page",links.getJSONObject(2).getString("kind"));
    }
    @Test public void doesNotTreatAnotherFileOrAnotherOriginAsPremiumAndDropsUnsafeLinks() throws Exception {
        String html="<div id='md5-panel-downloads'><a class='js-download-link' href='https://evil.example/fast_download/"+hash+"/1/2'>Other domain</a>"
            +"<a class='js-download-link' href='/fast_download/abcdefabcdefabcdefabcdefabcdefab/1/2'>Other file</a>"
            +"<a class='js-download-link' href='javascript:alert(1)'>Script</a><a class='js-download-link' href='https://127.0.0.1/book.epub'>Local</a></div>";
        JSONArray links=CatalogDownloads.parse(html,page(),200).getJSONArray("options");assertEquals(2,links.length());
        assertEquals("page",links.getJSONObject(0).getString("kind"));assertEquals("page",links.getJSONObject(1).getString("kind"));
    }
    @Test public void reportsChallengeOrChangedMarkupInsteadOfInventingLinks() throws Exception {
        assertTrue(CatalogDownloads.parse("<title>DDoS-Guard</title>",page(),403).getBoolean("challenge"));
        assertTrue(CatalogDownloads.parse("<html>Unknown page</html>",page(),200).has("error"));
        assertEquals(0,CatalogDownloads.parse("<div id='md5-panel-downloads'></div>",page(),200).getJSONArray("options").length());
    }
    @Test public void encodesSelectedIndicesAndRejectsFractionalOrNegativeChoices() throws Exception {
        okhttp3.Request request=AnnaPremium.downloadRequest(HttpUrl.get("https://annas-archive.gl"),"FAKE-KEY",hash,1,2);
        assertEquals("1",request.url().queryParameter("path_index"));assertEquals("2",request.url().queryParameter("domain_index"));
        assertEquals(2,FolioPlugin.optionIndex(new JSONObject().put("domainIndex",2),"domainIndex"));
        for(Object bad:new Object[]{-1,2.5,"2",1001})try{FolioPlugin.optionIndex(new JSONObject().put("domainIndex",bad),"domainIndex");fail();}catch(FolioPlugin.UserError expected){}
    }
}
