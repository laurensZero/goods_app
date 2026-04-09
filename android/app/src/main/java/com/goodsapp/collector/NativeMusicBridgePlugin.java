package com.goodsapp.collector;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "NativeMusicBridge",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeMusicBridgePlugin extends Plugin {
    private static final String[] NETEASE_PACKAGES = new String[] {
        "com.hihonor.cloudmusic",
        "com.netease.cloudmusic"
    };

    private BroadcastReceiver actionReceiver;

    @Override
    public void load() {
        super.load();
        registerActionReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterActionReceiver();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PluginMethod
    public void updatePlaybackNotification(PluginCall call) {
        if (!canPostNotifications()) {
            JSObject result = new JSObject();
            result.put("shown", false);
            result.put("reason", "permission_denied");
            call.resolve(result);
            return;
        }

        Intent intent = new Intent(getContext(), NativeMusicNotificationService.class);
        intent.setAction(NativeMusicNotificationService.ACTION_UPDATE);
        intent.putExtra(NativeMusicNotificationService.EXTRA_TITLE, call.getString("title", "未命名曲目"));
        intent.putExtra(NativeMusicNotificationService.EXTRA_ARTIST, call.getString("artist", ""));
        intent.putExtra(NativeMusicNotificationService.EXTRA_ALBUM, call.getString("album", ""));
        intent.putExtra(NativeMusicNotificationService.EXTRA_IS_PLAYING, call.getBoolean("isPlaying", false));
        intent.putExtra(NativeMusicNotificationService.EXTRA_HAS_PREVIOUS, call.getBoolean("hasPrevious", false));
        intent.putExtra(NativeMusicNotificationService.EXTRA_HAS_NEXT, call.getBoolean("hasNext", false));
        intent.putExtra(NativeMusicNotificationService.EXTRA_DURATION_MS, Math.max(0L, call.getLong("durationMs", 0L)));
        intent.putExtra(NativeMusicNotificationService.EXTRA_POSITION_MS, Math.max(0L, call.getLong("positionMs", 0L)));

        ContextCompat.startForegroundService(getContext(), intent);

        JSObject result = new JSObject();
        result.put("shown", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearPlaybackNotification(PluginCall call) {
        Intent intent = new Intent(getContext(), NativeMusicNotificationService.class);
        intent.setAction(NativeMusicNotificationService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

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

    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    private void registerActionReceiver() {
        if (actionReceiver != null) return;

        actionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent != null ? intent.getAction() : "";
                JSObject payload = new JSObject();
                if (NativeMusicNotificationService.ACTION_PREVIOUS.equals(action)) {
                    payload.put("action", "previous");
                } else if (NativeMusicNotificationService.ACTION_TOGGLE.equals(action)) {
                    payload.put("action", "toggle");
                } else if (NativeMusicNotificationService.ACTION_NEXT.equals(action)) {
                    payload.put("action", "next");
                } else {
                    return;
                }
                notifyListeners("mediaAction", payload, true);
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(NativeMusicNotificationService.ACTION_PREVIOUS);
        filter.addAction(NativeMusicNotificationService.ACTION_TOGGLE);
        filter.addAction(NativeMusicNotificationService.ACTION_NEXT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(actionReceiver, filter);
        }
    }

    private void unregisterActionReceiver() {
        if (actionReceiver == null) return;
        try {
            getContext().unregisterReceiver(actionReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        actionReceiver = null;
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }
}
