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
     * 根因（DevTools 确认）：平板上 B 站播放器拿到的是 platform=pc 的流地址，
     * 其 CDN 按 Referer/防盗链返回 403，导致 <video> 拉流失败、一直黑屏/loading；
     * 而手机能放是因为手机 UA 含 "Mobile"，播放器改请求 platform=android 移动流（校验更宽松）。
     * 平板 WebView 的 UA 默认不含 "Mobile" 标记，被播放器当成桌面浏览器 → 拿到 PC 流 → 403。
     * 对策：给 UA 补上 "Mobile"，让播放器像手机一样请求 android 流。
     * 附带几项稳妥的兜底（对本来正常的设备无副作用）：
     * - 强制硬件图层：部分 ROM 软件层渲染视频 surface 会黑屏。
     * - 开启 DOM/数据库存储：B 站播放器把清晰度/音量等存进 localStorage。
     * - 允许混合内容 + 第三方 Cookie：Capacitor 已默认，这里双保险。
     */
    private void configureWebViewForMedia(WebView webView) {
        if (webView == null) return;
        try {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // 平板 UA 缺 "Mobile" → B 站播放器误判为桌面 → 请求 PC 流被 CDN 403。
            // 补上 "Mobile" 标记，使其像手机一样请求 android 流。
            String ua = settings.getUserAgentString();
            if (ua != null && !ua.contains("Mobile")) {
                String patched = ua + " Mobile";
                settings.setUserAgentString(patched);
                Log.d("MainActivity", "WebView UA patched (added Mobile): " + patched);
            } else {
                Log.d("MainActivity", "WebView UA already has Mobile: " + ua);
            }

            // MIUI/部分 ROM 默认软件层渲染视频 surface 会黑屏，强制硬件图层
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            CookieManager cm = CookieManager.getInstance();
            boolean acceptThirdPartyBefore = cm.acceptThirdPartyCookies(webView);
            cm.setAcceptThirdPartyCookies(webView, true);
            boolean acceptThirdPartyAfter = cm.acceptThirdPartyCookies(webView);
            Log.d("MainActivity",
                    "WebView media cfg: uaHasMobile=" + (ua != null && ua.contains("Mobile"))
                            + " layerType=HARDWARE domStorage=true"
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
