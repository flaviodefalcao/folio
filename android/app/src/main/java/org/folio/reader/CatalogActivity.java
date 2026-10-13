package org.folio.reader;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Rect;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.ByteArrayInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import org.json.JSONArray;
import org.json.JSONObject;

/** Ordinary HTTPS catalog browser with no Capacitor bridge, keys, or book-library access. */
public class CatalogActivity extends AppCompatActivity {
    private WebView browser;
    private TextView status;
    private Button useResults;
    private HttpUrl origin;
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private final AtomicBoolean collecting = new AtomicBoolean(false);
    private OkHttpClient client;
    private String collectMode = "";
    private int collectAttempts;
    private WindowInsetsCompat layoutInsets;

    private void layoutPadding(android.view.View root, WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime()); int bottom = bars.bottom;
        if (insets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0) {
            int[] position = new int[2]; root.getLocationOnScreen(position); Rect visible = new Rect();
            int visibleBottom = root.getLocalVisibleRect(visible) ? visible.bottom : root.getHeight();
            int keyboardTop;
            if (Build.VERSION.SDK_INT >= 30) keyboardTop = getWindowManager().getCurrentWindowMetrics().getBounds().bottom - ime.bottom;
            else { root.getWindowVisibleDisplayFrame(visible); keyboardTop = visible.bottom; }
            bottom = Math.min(ime.bottom, Math.max(0, position[1] + visibleBottom - keyboardTop));
        }
        if (root.getPaddingLeft() != bars.left || root.getPaddingTop() != bars.top || root.getPaddingRight() != bars.right || root.getPaddingBottom() != bottom) root.setPadding(bars.left, bars.top, bars.right, bottom);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        collectMode = getIntent().getStringExtra("collect"); if (collectMode == null) collectMode = "";
        try {
            origin = FolioPlugin.httpsURL(getIntent().getStringExtra("origin"));
            HttpUrl target = FolioPlugin.httpsURL(getIntent().getStringExtra("url"));
            if (!collectMode.isEmpty()) FolioPlugin.catalogLink(origin, target.toString());
        } catch (Exception error) { finish(); return; }
        client = FolioPlugin.publicClient();
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(245, 244, 239));
        LinearLayout toolbar = new LinearLayout(this); toolbar.setOrientation(LinearLayout.HORIZONTAL);
        Button back = new Button(this); back.setText("‹"); back.setContentDescription("Página anterior"); back.setOnClickListener(v -> navigateBack());
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView title = new TextView(this); title.setText("Catálogo no Folio"); title.setTextColor(Color.rgb(26, 53, 51)); title.setTextSize(16); title.setGravity(android.view.Gravity.CENTER_VERTICAL);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button close = new Button(this); close.setText("Fechar"); close.setOnClickListener(v -> finish()); toolbar.addView(close);
        root.addView(toolbar);
        status = new TextView(this); status.setText(origin.host()); status.setTextSize(12); status.setPadding(dp(12), dp(4), dp(12), dp(4)); root.addView(status);
        useResults = new Button(this); useResults.setText(collectMode.equals("links") ? "Mostrar links no Folio" : "Usar resultados no Folio"); useResults.setEnabled(false); useResults.setOnClickListener(v -> collectResults()); root.addView(useResults);
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setMax(100); root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        browser = new WebView(this); root.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            layoutInsets = insets; layoutPadding(view, insets);
            return new WindowInsetsCompat.Builder(insets).setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
        });
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> { if (layoutInsets != null) layoutPadding(root, layoutInsets); });
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), root); controller.setAppearanceLightStatusBars(true); controller.setAppearanceLightNavigationBars(true); ViewCompat.requestApplyInsets(root);
        WebSettings settings = browser.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        // No addJavascriptInterface, Capacitor scripts, or native message handler in this WebView.
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); progress.setVisibility(value == 100 ? android.view.View.GONE : android.view.View.VISIBLE); }
        });
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                try {
                    HttpUrl url = FolioPlugin.httpsURL(request.getUrl().toString());
                    if (request.isForMainFrame() && url.encodedPath().toLowerCase(java.util.Locale.ROOT).endsWith(".epub")) { startDownload(url.toString()); return true; }
                    return false;
                } catch (Exception error) { status.setText("Este catálogo aceita somente links HTTPS públicos."); return true; }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    HttpUrl url = FolioPlugin.httpsURL(request.getUrl().toString());
                    for (java.net.InetAddress address : java.net.InetAddress.getAllByName(url.host())) if (!FolioPlugin.publicAddress(address)) return blocked();
                    return null;
                } catch (Exception error) { return blocked(); }
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { useResults.setEnabled(false); }
            @Override public void onPageFinished(WebView view, String url) {
                try {
                    HttpUrl parsed = FolioPlugin.httpsURL(url); status.setText(parsed.host());
                    boolean eligible = FolioPlugin.sameOrigin(origin, parsed) && (parsed.encodedPath().equals("/search") || (collectMode.equals("links") && parsed.encodedPath().matches("/md5/[a-fA-F0-9]{32}/?")));
                    useResults.setEnabled(eligible);
                    if (eligible && !collectMode.isEmpty()) { collectAttempts = 0; autoCollect(); }
                } catch (Exception ignored) { useResults.setEnabled(false); }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && (response.getStatusCode() == 403 || response.getStatusCode() == 429)) status.setText("O site exige uma verificação. Conclua a etapa exibida na página.");
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); status.setText("O certificado HTTPS do site não foi aceito."); }
        });
        browser.setDownloadListener((url, userAgent, disposition, mime, length) -> startDownload(url));
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { navigateBack(); } });
        browser.loadUrl(getIntent().getStringExtra("url"));
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void navigateBack() { if (browser != null && browser.canGoBack()) browser.goBack(); else finish(); }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }

    private void autoCollect() {
        if (isFinishing() || isDestroyed() || browser == null || collectAttempts++ >= 30) return;
        final String page = browser.getUrl();
        if (page == null) return;
        String selector = collectMode.equals("links") ? "#md5-panel-downloads" : ".js-aarecord-list-outer";
        browser.evaluateJavascript("Boolean(document.querySelector('" + selector + "'))", ready -> {
            if (isFinishing() || isDestroyed() || !page.equals(browser.getUrl())) return;
            if ("true".equals(ready)) collectResults();
            else browser.postDelayed(() -> autoCollect(), 1000);
        });
    }

    private void collectResults() {
        if (browser == null || downloading.get() || !collecting.compareAndSet(false, true)) return;
        final HttpUrl page;
        try {
            page = FolioPlugin.catalogLink(origin, browser.getUrl());
            if (!page.encodedPath().equals("/search") && !(collectMode.equals("links") && page.encodedPath().matches("/md5/[a-fA-F0-9]{32}/?"))) throw new FolioPlugin.UserError("Abra uma página de busca ou os links de um livro.");
        } catch (Exception error) { collecting.set(false); status.setText("Abra uma página de busca do catálogo configurado."); return; }
        useResults.setEnabled(false); status.setText("Organizando os resultados desta página…");
        // Read only the configured page following the user's search/link action.
        browser.evaluateJavascript("document.documentElement.outerHTML", encoded -> {
          if (isFinishing() || isDestroyed() || !page.toString().equals(browser.getUrl())) { collecting.set(false); status.setText("A página mudou. Toque novamente após carregar a busca."); return; }
          work.execute(() -> {
            try {
                String html = new JSONArray("[" + encoded + "]").getString(0);
                if (html.length() > 8 * 1024 * 1024) throw new FolioPlugin.UserError("A página é grande demais para organizar.");
                int number = 1; try { number = Integer.parseInt(page.queryParameter("page")); } catch (Exception ignored) {}
                boolean links = collectMode.equals("links");
                JSONObject results = links ? CatalogDownloads.parse(html, page, 200) : FolioPlugin.parseCatalogHTML(html, page, number, 200);
                if (results.optBoolean("challenge", false) || results.has("error")) throw new FolioPlugin.UserError(results.optString("error", "O site ainda exige a verificação."));
                results.put("query", page.queryParameter("q") == null ? "" : page.queryParameter("q"));
                results.put("language", page.queryParameter("lang") == null ? "" : page.queryParameter("lang"));
                results.put("format", "epub");
                runOnUiThread(() -> { setResult(Activity.RESULT_OK, new Intent().putExtra(links ? "catalogLinks" : "catalogResults", results.toString())); finish(); });
            } catch (Exception error) {
                collecting.set(false);
                runOnUiThread(() -> { status.setText(error instanceof FolioPlugin.UserError ? error.getMessage() : "Não foi possível ler os resultados. Aguarde o site terminar de carregar."); useResults.setEnabled(true); });
            }
          });
        });
    }

    private void startDownload(String url) {
        if (!downloading.compareAndSet(false, true)) return;
        status.setText("Baixando e validando o EPUB…"); useResults.setEnabled(false);
        String userAgent = browser.getSettings().getUserAgentString();
        String cookie = CookieManager.getInstance().getCookie(url);
        work.execute(() -> {
            try {
                FolioPlugin.NativeDownload book = FolioPlugin.fetchEPUB(this, client, url, userAgent, cookie);
                if (isFinishing() || isDestroyed()) { book.file.delete(); return; }
                runOnUiThread(() -> { setResult(Activity.RESULT_OK, new Intent().putExtra("cacheFile", book.file.getName()).putExtra("bookName", book.name)); finish(); });
            } catch (Exception error) {
                runOnUiThread(() -> { String message = error instanceof FolioPlugin.UserError ? error.getMessage() : "Download não concluído. Confira a conexão e escolha um link HTTPS de EPUB."; status.setText(message); Toast.makeText(this, message, Toast.LENGTH_LONG).show(); });
            } finally { downloading.set(false); }
        });
    }

    @Override protected void onDestroy() {
        if (browser != null) { browser.stopLoading(); browser.destroy(); }
        if (client != null) client.dispatcher().cancelAll(); work.shutdownNow(); super.onDestroy();
    }
}
