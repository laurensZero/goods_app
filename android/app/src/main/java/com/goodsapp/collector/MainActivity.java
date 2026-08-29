package com.goodsapp.collector;

import android.content.Intent;
import android.nfc.NfcAdapter;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMusicBridgePlugin.class);
        registerPlugin(BilibiliPlayerPlugin.class);
        registerPlugin(MihoyoSessionImportPlugin.class);
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(SystemUiThemePlugin.class);

        Intent normalizedIntent = normalizeNfcIntent(getIntent());
        if (normalizedIntent != null) {
            setIntent(normalizedIntent);
        }

        super.onCreate(savedInstanceState);

        setupStableEdgeToEdge();
    }

    /**
     * 固定为沉浸直通模式，覆盖 Capacitor SystemBars 插件的监听：
     * 插件默认先按"容器加 padding"处理、等异步检测到 viewport-fit=cover 才切直通，
     * 这个翻转会导致启动时底部闪白块、居中内容跳动。这里从第一帧起就保持一致。
     */
    private void setupStableEdgeToEdge() {
        try {
            WebView webView = bridge != null ? bridge.getWebView() : null;
            configureWebViewForMedia(webView);
            View parent = webView != null ? (View) webView.getParent() : null;
            if (parent == null) return;

            ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
                Insets systemBars = insets.getInsets(
                        WindowInsetsCompat.Type.systemBars()
                                | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

                // 系统栏区域不占用布局，真实 insets 透传给 WebView 的 env(safe-area-inset-*)
                v.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);

                return new WindowInsetsCompat.Builder(insets)
                        .setInsets(
                                WindowInsetsCompat.Type.systemBars()
                                        | WindowInsetsCompat.Type.displayCutout(),
                                systemBars
                        )
                        .build();
            });
        } catch (Exception error) {
            Log.w("MainActivity", "stable edge-to-edge setup failed", error);
        }
    }

    /**
     * 让 WebView 内嵌的 B 站播放器在部分设备（如 MIUI 平板）也能正常播放。
     * - 允许混合内容：Android WebView 默认 MIXED_CONTENT_NEVER_ALLOW，会直接拦截
     *   B 站播放器请求的 http:// 资源（封面/CDN），而 Chrome 浏览器会自动升级为 https。
     *   拦截后播放器拉不到资源、卡在基础信息，故强制允许。
     * - 允许第三方 Cookie：播放器 iframe 相对 App 是第三方，流鉴权依赖跨站 Cookie，
     *   部分系统 WebView 默认拦截，强制开启（对本来允许的设备无副作用）。
     */
    private void configureWebViewForMedia(WebView webView) {
        if (webView == null) return;
        try {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            CookieManager cm = CookieManager.getInstance();
            boolean acceptThirdPartyBefore = cm.acceptThirdPartyCookies(webView);
            cm.setAcceptThirdPartyCookies(webView, true);
            boolean acceptThirdPartyAfter = cm.acceptThirdPartyCookies(webView);
            Log.d("MainActivity",
                    "WebView media cfg: mixedContent=ALWAYS_ALLOW"
                            + " acceptThirdPartyBefore=" + acceptThirdPartyBefore
                            + " acceptThirdPartyAfter=" + acceptThirdPartyAfter);
        } catch (Exception error) {
            Log.w("MainActivity", "WebView media cfg failed", error);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        Intent normalizedIntent = normalizeNfcIntent(intent);
        super.onNewIntent(normalizedIntent);
        setIntent(normalizedIntent);
        dispatchNfcOpenEvent(normalizedIntent);
    }

    private Intent normalizeNfcIntent(Intent intent) {
        if (intent == null) {
            return null;
        }

        if (!NfcAdapter.ACTION_NDEF_DISCOVERED.equals(intent.getAction()) || intent.getData() == null) {
            return intent;
        }

        Intent normalizedIntent = new Intent(intent);
        normalizedIntent.setAction(Intent.ACTION_VIEW);
        normalizedIntent.setData(intent.getData());
        return normalizedIntent;
    }

    private void dispatchNfcOpenEvent(Intent intent) {
        if (intent == null || bridge == null) {
            return;
        }

        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("url", intent.getDataString());
        bridge.triggerWindowJSEvent("goodsappNfcOpen", payload.toString());
    }
}
