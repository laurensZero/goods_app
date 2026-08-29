package com.goodsapp.collector;

import android.content.Intent;
import android.nfc.NfcAdapter;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
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
            logWebViewDiagnostics(webView);
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
     * 排查 B 站播放器在部分 WebView（平板/VSCode 预览）里卡在基础信息的问题：
     * 打印第三方 Cookie 是否被拦截、以及 UA，用于判断是否为跨站鉴权被拦。
     */
    private void logWebViewDiagnostics(WebView webView) {
        if (webView == null) return;
        try {
            CookieManager cm = CookieManager.getInstance();
            boolean acceptCookie = cm.acceptCookie();
            boolean acceptThirdPartyBefore = cm.acceptThirdPartyCookies(webView);
            // B 站播放器 iframe 是相对 App 的第三方，流鉴权依赖跨站 Cookie。
            // 部分设备/系统的 WebView 默认拦截，导致视频流请求失败、卡在基础信息。
            // 强制开启（对本来允许的设备无副作用）。
            cm.setAcceptThirdPartyCookies(webView, true);
            boolean acceptThirdPartyAfter = cm.acceptThirdPartyCookies(webView);
            String ua = webView.getSettings().getUserAgentString();
            Log.d("MainActivity",
                    "WebView diag: acceptCookie=" + acceptCookie
                            + " acceptThirdPartyBefore=" + acceptThirdPartyBefore
                            + " acceptThirdPartyAfter=" + acceptThirdPartyAfter
                            + " ua=" + ua);
        } catch (Exception error) {
            Log.w("MainActivity", "WebView diag failed", error);
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
