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
     * 典型现象：播放器 UI 正常、但视频画面黑屏/一直 loading，同一设备的 Chrome 浏览器却正常。
     * 这是 Android WebView 的经典坑，常见根因与对策（均来自小米/MIUI 实测案例）：
     * - 强制硬件图层：很多 ROM 默认把 WebView 当作软件层渲染，视频 surface 直接黑。
     *   小米设备上 setLayerType(LAYER_TYPE_HARDWARE) + hardwareAccelerated=true 可修黑屏。
     * - 开启 DOM/数据库存储：B 站播放器把清晰度/音量等存进 localStorage，被关会导致
     *   播放器初始化卡死 → 一直 loading。
     * - 允许混合内容：Capacitor 因 allowMixedContent=true 已默认设 ALWAYS_ALLOW，此处为双保险。
     * - 允许第三方 Cookie：播放器 iframe 相对 App 是第三方，流鉴权依赖跨站 Cookie。
     */
    private void configureWebViewForMedia(WebView webView) {
        if (webView == null) return;
        try {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // MIUI/部分 ROM 默认软件层渲染视频 surface 会黑屏，强制硬件图层
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            CookieManager cm = CookieManager.getInstance();
            boolean acceptThirdPartyBefore = cm.acceptThirdPartyCookies(webView);
            cm.setAcceptThirdPartyCookies(webView, true);
            boolean acceptThirdPartyAfter = cm.acceptThirdPartyCookies(webView);
            Log.d("MainActivity",
                    "WebView media cfg: layerType=HARDWARE domStorage=true"
                            + " mixedContent=ALWAYS_ALLOW"
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
