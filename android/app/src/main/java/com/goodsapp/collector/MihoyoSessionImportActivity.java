package com.goodsapp.collector;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MihoyoSessionImportActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_RESULT_KEY = "resultKey";
    public static final String EXTRA_ERROR_MESSAGE = "errorMessage";

    public static final String MODE_ORDERS = "orders";
    public static final String MODE_CART = "cart";

    static final String COOKIE_PREFS_NAME = "mihoyo_native_session";
    static final String COOKIE_PREFS_KEY_COOKIE = "cookie";
    static final String COOKIE_PREFS_KEY_UPDATED_AT = "updated_at";

    private static final String HOME_URL = "https://mihoyogift.com/m/";
    private static final String WEB_REFERER = "https://mihoyogift.com/";
    private static final String WEB_REFERER_WWW = "https://www.mihoyogift.com/";
    private static final String API_BASE = "https://api-mall.mihoyogift.com";
    private static final String API_ORDER_LIST = API_BASE + "/common/homeishop/v1/order/order_list";
    private static final String API_CART_LIST = API_BASE + "/common/homeishop/v2/shop_car/get_shop_car_list";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private View topBar;
    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleView;
    private TextView hintView;
    private Button actionButton;
    private String mode = MODE_ORDERS;
    private boolean importRunning = false;
    private String pendingErrorMessage = "";

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_mihoyo_session_import);

        mode = normalizeMode(getIntent() != null ? getIntent().getStringExtra(EXTRA_MODE) : null);

        topBar = findViewById(R.id.mihoyo_top_bar);
        titleView = findViewById(R.id.mihoyo_title);
        hintView = findViewById(R.id.mihoyo_hint);
        progressBar = findViewById(R.id.mihoyo_progress);
        actionButton = findViewById(R.id.mihoyo_action_button);
        webView = findViewById(R.id.mihoyo_webview);

        applyWindowInsets();

        titleView.setText(MODE_CART.equals(mode) ? "登录米游铺并读取购物车" : "登录米游铺并读取订单");
        setHintMessage("登录完成后点右上角继续导入。页面风格和登录态会保留在 App 内。", false);

        findViewById(R.id.mihoyo_close_button).setOnClickListener((view) -> cancelWithMessage("已取消导入"));
        actionButton.setOnClickListener((view) -> runImport());

        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onRestoreInstanceState(@NonNull Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        cancelWithMessage("已取消导入");
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " GoodsAppMihoyoImport/1.1");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progressBar.setProgress(newProgress);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                syncCookieStore();
                saveCurrentSessionCookie();
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
    }

    private void applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(topBar, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            view.setPadding(
                view.getPaddingLeft(),
                dp(10) + systemBars.top,
                view.getPaddingRight(),
                view.getPaddingBottom()
            );
            return insets;
        });
    }

    private void runImport() {
        if (importRunning) {
            return;
        }

        SessionSnapshot sessionSnapshot = captureSessionSnapshot();
        importRunning = true;
        pendingErrorMessage = "";
        actionButton.setEnabled(false);
        actionButton.setText("正在导入");
        setHintMessage("正在读取米游铺数据，请稍候…", false);

        executor.execute(() -> {
            try {
                JSONObject payload = MODE_CART.equals(mode)
                    ? fetchCartPayload(sessionSnapshot)
                    : fetchOrdersPayload(sessionSnapshot);
                runOnUiThread(() -> completeWithPayload(payload, sessionSnapshot));
            } catch (Exception error) {
                runOnUiThread(() -> renderImportError(error, sessionSnapshot));
            }
        });
    }

    private JSONObject fetchOrdersPayload(SessionSnapshot sessionSnapshot) throws Exception {
        int limit = 20;
        JSONObject first = requestJson(API_ORDER_LIST + "?limit=" + limit + "&page=1", sessionSnapshot);
        JSONObject firstData = ensureSuccess(first);
        int total = firstData.optInt("count", 0);
        int totalPages = Math.min(Math.max((int) Math.ceil(total / (double) limit), 1), 10);
        JSONArray list = copyJsonArray(firstData.optJSONArray("list"));

        for (int page = 2; page <= totalPages; page += 1) {
            JSONObject pageJson = requestJson(API_ORDER_LIST + "?limit=" + limit + "&page=" + page, sessionSnapshot);
            JSONObject pageData = ensureSuccess(pageJson);
            JSONArray pageList = pageData.optJSONArray("list");
            if (pageList == null) continue;
            for (int index = 0; index < pageList.length(); index += 1) {
                list.put(pageList.opt(index));
            }
        }

        JSONObject payload = new JSONObject();
        payload.put("mode", MODE_ORDERS);
        payload.put("list", list);
        payload.put("total", total);
        payload.put("capped", total > list.length());
        return payload;
    }

    private JSONObject fetchCartPayload(SessionSnapshot sessionSnapshot) throws Exception {
        JSONObject json = requestJson(API_CART_LIST, sessionSnapshot);
        JSONObject data = ensureSuccess(json);

        JSONObject payload = new JSONObject();
        JSONArray list = copyJsonArray(data.optJSONArray("list"));
        payload.put("mode", MODE_CART);
        payload.put("list", list);
        payload.put("total", list.length());
        payload.put("capped", false);
        return payload;
    }

    private JSONObject requestJson(String url, SessionSnapshot sessionSnapshot) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            connection.setRequestProperty("Referer", WEB_REFERER);
            connection.setRequestProperty("Origin", WEB_REFERER.substring(0, WEB_REFERER.length() - 1));
            connection.setRequestProperty("x-rpc-language", "zh-cn");
            connection.setRequestProperty("x-rpc-client_type", "5");

            String userAgent = sessionSnapshot.userAgent;
            if (userAgent != null && !userAgent.trim().isEmpty()) {
                connection.setRequestProperty("User-Agent", userAgent);
            }

            String cookies = sessionSnapshot.cookieHeader;
            if (!cookies.isEmpty()) {
                connection.setRequestProperty("Cookie", cookies);
            }

            int status = connection.getResponseCode();
            String body = readResponseBody(status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream());
            if (status < 200 || status >= 300) {
                throw new IllegalStateException(extractHttpError(status, body));
            }

            return new JSONObject(body);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private JSONObject ensureSuccess(JSONObject json) throws Exception {
        int retcode = json.optInt("retcode", -1);
        if (retcode != 0) {
            String message = json.optString("message", "").trim();
            throw new IllegalStateException(message.isEmpty() ? "接口错误 " + retcode : message);
        }
        JSONObject data = json.optJSONObject("data");
        return data != null ? data : new JSONObject();
    }

    private JSONArray copyJsonArray(JSONArray source) {
        JSONArray target = new JSONArray();
        if (source == null) {
            return target;
        }

        for (int index = 0; index < source.length(); index += 1) {
            target.put(source.opt(index));
        }
        return target;
    }

    private void completeWithPayload(JSONObject payload, SessionSnapshot session) {
        importRunning = false;
        pendingErrorMessage = "";
        actionButton.setEnabled(true);
        actionButton.setText("继续导入");
        setHintMessage("登录完成后点右上角继续导入。页面风格和登录态会保留在 App 内。", false);

        saveSessionCookie(session);

        Intent data = new Intent();
        data.putExtra(EXTRA_RESULT_KEY, MihoyoSessionImportResultStore.put(payload));
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    private void saveCurrentSessionCookie() {
        SessionSnapshot session = captureSessionSnapshot();
        saveSessionCookie(session);
    }

    private void saveSessionCookie(SessionSnapshot session) {
        String cookie = session != null ? session.cookieHeader : "";
        if (cookie.isEmpty()) return;

        SharedPreferences prefs = getSharedPreferences(COOKIE_PREFS_NAME, Context.MODE_PRIVATE);
        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        isoFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        prefs.edit()
            .putString(COOKIE_PREFS_KEY_COOKIE, cookie)
            .putString(COOKIE_PREFS_KEY_UPDATED_AT, isoFormat.format(new Date()))
            .apply();
    }

    static boolean isCookieExpiredError(String errorMessage) {
        if (errorMessage == null || errorMessage.trim().isEmpty()) return false;
        String lower = errorMessage.toLowerCase(Locale.US);
        return lower.contains("cookie") || lower.contains("token") || lower.contains("ltoken")
            || lower.contains("login") || lower.contains("account") || lower.contains("auth")
            || lower.contains("unauthorized") || lower.contains("forbidden")
            || lower.contains("401") || lower.contains("403");
    }

    private void renderImportError(Exception error, SessionSnapshot session) {
        importRunning = false;
        String message = buildErrorMessage(error);
        pendingErrorMessage = message;
        actionButton.setEnabled(true);
        actionButton.setText("重试导入");
        progressBar.setVisibility(View.GONE);

        // Save cookie even on error if it looks like a valid session (non-auth error)
        // so the Plugin can try it directly next time
        if (session != null && !session.cookieHeader.isEmpty() && !isCookieExpiredError(message)) {
            saveSessionCookie(session);
        }

        setHintMessage("导入失败：" + message + "。请确认当前账号已登录，再点一次重试。", true);
    }

    private String buildErrorMessage(Exception error) {
        String message = error != null ? String.valueOf(error.getMessage()) : "";
        if (message == null || message.trim().isEmpty()) {
            return "读取米游铺数据失败";
        }
        return message.trim();
    }

    private void cancelWithMessage(String message) {
        Intent data = new Intent();
        String resolvedMessage = (pendingErrorMessage == null || pendingErrorMessage.trim().isEmpty()) ? message : pendingErrorMessage;
        data.putExtra(EXTRA_ERROR_MESSAGE, resolvedMessage);
        setResult(Activity.RESULT_CANCELED, data);
        finish();
    }

    private void setHintMessage(String message, boolean isError) {
        hintView.setText(message);
        hintView.setTextColor(isError ? 0xFFB42318 : 0xFF5F6570);
    }

    private void syncCookieStore() {
        CookieManager cookieManager = CookieManager.getInstance();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.flush();
        }
    }

    private String normalizeMode(String rawMode) {
        return MODE_CART.equals(rawMode) ? MODE_CART : MODE_ORDERS;
    }

    private SessionSnapshot captureSessionSnapshot() {
        String userAgent = "";
        if (webView != null && webView.getSettings() != null) {
            userAgent = String.valueOf(webView.getSettings().getUserAgentString());
        }
        return new SessionSnapshot(userAgent, buildCookieHeader());
    }

    private String buildCookieHeader() {
        CookieManager cookieManager = CookieManager.getInstance();
        Map<String, String> cookieMap = new LinkedHashMap<>();
        appendCookies(cookieMap, cookieManager.getCookie(WEB_REFERER));
        appendCookies(cookieMap, cookieManager.getCookie(WEB_REFERER_WWW));
        appendCookies(cookieMap, cookieManager.getCookie(HOME_URL));
        appendCookies(cookieMap, cookieManager.getCookie(API_BASE));

        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, String> entry : cookieMap.entrySet()) {
            if (builder.length() > 0) {
                builder.append("; ");
            }
            builder.append(entry.getKey()).append("=").append(entry.getValue());
        }
        return builder.toString();
    }

    private void appendCookies(Map<String, String> target, String rawCookies) {
        if (rawCookies == null || rawCookies.trim().isEmpty()) {
            return;
        }

        String[] parts = rawCookies.split(";");
        for (String part : parts) {
            String trimmed = part.trim();
            int separator = trimmed.indexOf('=');
            if (separator <= 0) {
                continue;
            }

            String key = trimmed.substring(0, separator).trim();
            String value = trimmed.substring(separator + 1).trim();
            if (!key.isEmpty() && !value.isEmpty()) {
                target.put(key, value);
            }
        }
    }

    private String readResponseBody(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }

        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private String extractHttpError(int status, String body) {
        try {
            JSONObject json = new JSONObject(body);
            String message = json.optString("message", "").trim();
            if (!message.isEmpty()) {
                return message;
            }
        } catch (Exception ignored) {
            // ignore
        }

        return "请求失败（" + status + "）";
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private static final class SessionSnapshot {
        final String userAgent;
        final String cookieHeader;

        SessionSnapshot(String userAgent, String cookieHeader) {
            this.userAgent = userAgent == null ? "" : userAgent;
            this.cookieHeader = cookieHeader == null ? "" : cookieHeader;
        }
    }
}
