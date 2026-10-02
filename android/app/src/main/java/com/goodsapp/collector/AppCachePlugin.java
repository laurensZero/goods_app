package com.goodsapp.collector;

import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 应用缓存目录（Context.getCacheDir()）的真实占用统计与浏览器缓存清理。
 *
 * 存在的理由：
 * - 设置页的「图片缓存上限」只约束 cacheDir/img-cache，而安卓设置里显示的「缓存」
 *   统计的是整个 cacheDir。
 * - 自 Chromium r304670 起 Android WebView 把 HTTP 缓存也放进了 cacheDir
 *   （见 aw_browser_context.cc），那一份 App 侧既看不到也无法用 JS 清理，
 *   正是「设了 512MB 却显示 818MB」的主因。
 * - WebView 资源缓存只能走 Java（WebView.clearCache(true)）。
 *
 * 边界：只读统计 + 清 WebView 资源缓存；不碰 Cookie（米游铺登录态）、
 * 不碰 IndexedDB/localStorage，也不碰任何业务数据目录。
 */
@CapacitorPlugin(name = "AppCache")
public class AppCachePlugin extends Plugin {

    /** cacheDir 及每个一级子目录的占用，供 About 页对账安卓设置的数字 */
    @PluginMethod
    public void stats(PluginCall call) {
        try {
            File cacheDir = getContext().getCacheDir();
            JSObject dirs = new JSObject();
            long total = 0;
            long webViewCache = 0;

            File[] children = cacheDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (child == null) {
                        continue;
                    }
                    long size = child.isDirectory() ? directorySize(child) : child.length();
                    String name = child.getName();
                    dirs.put(name, size);
                    total += size;
                    if (isWebViewCacheDir(name)) {
                        webViewCache += size;
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("total", total);
            result.put("webView", webViewCache);
            result.put("dirs", dirs);
            result.put("path", cacheDir.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("read app cache stats failed", error);
        }
    }

    /**
     * 清 WebView 的资源缓存（内存 + 磁盘）。includeDiskFiles=true 才会真正删掉
     * cacheDir 里那几百 MB；Cookie/登录态不受影响。
     */
    @PluginMethod
    public void clearWebViewCache(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.clearCache(true);
                }
                // r304670 之前的老版本 WebView 把 HTTP 缓存在这里，现代版本已不再写入，
                // 残留目录顺手一起清掉。
                deleteRecursively(new File(getContext().getCacheDir(), "WebView"));
                call.resolve();
            } catch (Exception error) {
                call.reject("clear webview cache failed", error);
            }
        });
    }

    private static boolean isWebViewCacheDir(String name) {
        if (name == null) {
            return false;
        }
        return name.toLowerCase().contains("chromium") || "webview".equalsIgnoreCase(name);
    }

    private static long directorySize(File dir) {
        File[] files = dir.listFiles();
        if (files == null) {
            return 0;
        }
        long size = 0;
        for (File file : files) {
            if (file == null) {
                continue;
            }
            size += file.isDirectory() ? directorySize(file) : file.length();
        }
        return size;
    }

    private static void deleteRecursively(File target) {
        if (target == null || !target.exists()) {
            return;
        }
        File[] files = target.listFiles();
        if (files != null) {
            for (File file : files) {
                deleteRecursively(file);
            }
        }
        // 删除失败（被占用等）不影响主流程，缓存目录本来就会被系统随时回收
        //noinspection ResultOfMethodCallIgnored
        target.delete();
    }
}
