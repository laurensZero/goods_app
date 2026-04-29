package com.goodsapp.collector;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
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

import org.json.JSONObject;
import org.json.JSONTokener;

public class MihoyoSessionImportActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_RESULT_JSON = "resultJson";
    public static final String EXTRA_ERROR_MESSAGE = "errorMessage";

    public static final String MODE_ORDERS = "orders";
    public static final String MODE_CART = "cart";

    private static final String HOME_URL = "https://www.mihoyogift.com/m/";

    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleView;
    private TextView hintView;
    private Button actionButton;
    private String mode = MODE_ORDERS;
    private boolean importRunning = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_mihoyo_session_import);

        mode = normalizeMode(getIntent() != null ? getIntent().getStringExtra(EXTRA_MODE) : null);

        titleView = findViewById(R.id.mihoyo_title);
        hintView = findViewById(R.id.mihoyo_hint);
        progressBar = findViewById(R.id.mihoyo_progress);
        actionButton = findViewById(R.id.mihoyo_action_button);
        webView = findViewById(R.id.mihoyo_webview);

        titleView.setText(MODE_CART.equals(mode) ? "登录米游铺并读取购物车" : "登录米游铺并读取订单");
        hintView.setText("登录完成后点击右上角“继续导入”。登录态会保留在 App 内，下次可继续复用。");

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
        settings.setUserAgentString(settings.getUserAgentString() + " GoodsAppMihoyoImport/1.0");

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
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
    }

    private void runImport() {
        if (importRunning) {
            return;
        }

        importRunning = true;
        actionButton.setEnabled(false);
        actionButton.setText("正在导入...");
        hintView.setText("正在读取米游铺数据，请稍候…");

        webView.evaluateJavascript(buildImportScript(mode), new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                importRunning = false;
                actionButton.setEnabled(true);
                actionButton.setText("继续导入");
                hintView.setText("登录完成后点击右上角“继续导入”。登录态会保留在 App 内，下次可继续复用。");
                handleScriptResult(value);
            }
        });
    }

    private void handleScriptResult(String rawValue) {
        try {
            Object decoded = new JSONTokener(rawValue == null ? "null" : rawValue).nextValue();
            String jsonText = decoded instanceof String ? (String) decoded : String.valueOf(decoded);
            JSONObject result = new JSONObject(jsonText);
            boolean ok = result.optBoolean("ok", false);
            if (!ok) {
                cancelWithMessage(result.optString("error", "读取米游铺数据失败"));
                return;
            }

            JSONObject payload = result.optJSONObject("payload");
            if (payload == null) {
                cancelWithMessage("米游铺返回的数据为空");
                return;
            }

            Intent data = new Intent();
            data.putExtra(EXTRA_RESULT_JSON, payload.toString());
            setResult(Activity.RESULT_OK, data);
            finish();
        } catch (Exception error) {
            cancelWithMessage("处理米游铺返回结果失败: " + error.getMessage());
        }
    }

    private void cancelWithMessage(String message) {
        Intent data = new Intent();
        data.putExtra(EXTRA_ERROR_MESSAGE, message);
        setResult(Activity.RESULT_CANCELED, data);
        finish();
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

    private String buildImportScript(String importMode) {
        String apiScript = MODE_CART.equals(importMode) ? buildCartScript() : buildOrdersScript();
        return "(async function() {"
            + "try {"
            + "const result = await (async function() {" + apiScript + "})();"
            + "return JSON.stringify({ ok: true, payload: result });"
            + "} catch (error) {"
            + "const message = (error && (error.message || error.toString())) || '读取米游铺数据失败';"
            + "return JSON.stringify({ ok: false, error: String(message) });"
            + "}"
            + "})()";
    }

    private String buildOrdersScript() {
        return ""
            + "const API = 'https://api-mall.mihoyogift.com/common/homeishop/v1/order/order_list';"
            + "const headers = { 'x-rpc-language': 'zh-cn', 'x-rpc-client_type': '5' };"
            + "const limit = 20;"
            + "const fetchPage = async (page) => {"
            + "  const response = await fetch(API + '?limit=' + limit + '&page=' + page, { credentials: 'include', headers });"
            + "  const json = await response.json();"
            + "  if (!response.ok) throw new Error('请求失败（' + response.status + '）');"
            + "  if (json.retcode !== 0) throw new Error(json.message || ('接口错误 ' + json.retcode));"
            + "  return json.data || {};"
            + "};"
            + "const first = await fetchPage(1);"
            + "const total = Number(first.count || 0);"
            + "const totalPages = Math.min(Math.ceil(total / limit) || 1, 10);"
            + "let list = Array.isArray(first.list) ? first.list.slice() : [];"
            + "for (let page = 2; page <= totalPages; page += 1) {"
            + "  const data = await fetchPage(page);"
            + "  if (Array.isArray(data.list)) list = list.concat(data.list);"
            + "}"
            + "return { mode: 'orders', list, total, capped: total > list.length };";
    }

    private String buildCartScript() {
        return ""
            + "const API = 'https://api-mall.mihoyogift.com/common/homeishop/v2/shop_car/get_shop_car_list';"
            + "const headers = { 'x-rpc-language': 'zh-cn', 'x-rpc-client_type': '5' };"
            + "const response = await fetch(API, { credentials: 'include', headers });"
            + "const json = await response.json();"
            + "if (!response.ok) throw new Error('请求失败（' + response.status + '）');"
            + "if (json.retcode !== 0) throw new Error(json.message || ('接口错误 ' + json.retcode));"
            + "return { mode: 'cart', list: ((json.data || {}).list || []), total: (((json.data || {}).list || []).length), capped: false };";
    }
}
