package com.goodsapp.collector;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeMusicBridge")
public class NativeMusicBridgePlugin extends Plugin {
    private static final String[] NETEASE_PACKAGES = new String[] {
        "com.hihonor.cloudmusic",
        "com.netease.cloudmusic"
    };

    @PluginMethod
    public void openNeteaseSong(PluginCall call) {
        String songId = call.getString("songId", "");
        if (TextUtils.isEmpty(songId)) {
            call.reject("缺少网易云歌曲 ID");
            return;
        }

        String[] uris = new String[] {
            "orpheus://song/" + songId,
            "orpheus://song?id=" + songId,
            "orpheus://play?songid=" + songId,
            "https://music.163.com/song?id=" + songId,
            "https://music.163.com/#/song?id=" + songId,
            "https://y.music.163.com/m/song?id=" + songId
        };

        PackageManager packageManager = getContext().getPackageManager();
        for (String packageName : NETEASE_PACKAGES) {
            for (String uri : uris) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
                intent.setPackage(packageName);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(packageManager) != null) {
                    getContext().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("opened", true);
                    result.put("packageName", packageName);
                    result.put("uri", uri);
                    call.resolve(result);
                    return;
                }
            }
        }

        JSObject result = new JSObject();
        result.put("opened", false);
        call.resolve(result);
    }
}
