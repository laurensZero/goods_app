package com.goodsapp.collector;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS 侧把当前主题的顶部背景色与深浅外观同步给系统栏：
 * - 窗口（decor）背景色：WebView 容器加 padding 的回退模式下，状态栏/手势条后面露出此颜色
 * - 图标深浅：深色页面用浅色图标，反之亦然
 */
@CapacitorPlugin(name = "SystemUiTheme")
public class SystemUiThemePlugin extends Plugin {

    @PluginMethod
    public void apply(PluginCall call) {
        String style = call.getString("style", "LIGHT");
        String backgroundColor = call.getString("backgroundColor", "");
        boolean darkIcons = !"DARK".equalsIgnoreCase(style);

        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(darkIcons);
                controller.setAppearanceLightNavigationBars(darkIcons);

                if (backgroundColor != null && !backgroundColor.isEmpty()) {
                    int parsed = Color.parseColor(backgroundColor);
                    ColorDrawable drawable = new ColorDrawable(parsed);
                    window.getDecorView().setBackground(drawable);
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                        // Android 15+ 强制 edge-to-edge 会忽略这两个属性，老系统保持一致观感
                        window.setStatusBarColor(parsed);
                        window.setNavigationBarColor(parsed);
                    }
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("apply system ui theme failed", error);
            }
        });
    }
}
