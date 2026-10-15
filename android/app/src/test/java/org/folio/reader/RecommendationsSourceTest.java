package org.folio.reader;
import static org.junit.Assert.*;
import org.junit.Test;
import okhttp3.HttpUrl;
public class RecommendationsSourceTest {
 @Test public void fixedFeedAllowsGoogleExportsOnly() {
  assertTrue(RecommendationsSource.allowedFeed(HttpUrl.get(RecommendationsSource.FEED)));
  assertTrue(RecommendationsSource.allowedFeed(HttpUrl.get("https://doc-1.googleusercontent.com/export")));
  for(String url:new String[]{"http://docs.google.com/test", "https://docs.google.com.attacker.test/test", "https://googleusercontent.com.attacker.test/test", "https://localhost/test", "https://user:pass@docs.google.com/test", "https://docs.google.com:8443/test"}) assertFalse(url,RecommendationsSource.allowedFeed(HttpUrl.get(url)));
 }
}
