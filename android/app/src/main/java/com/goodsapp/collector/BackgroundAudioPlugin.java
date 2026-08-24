package com.goodsapp.collector;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "BackgroundAudio", permissions = {
        @Permission(
                strings = { Manifest.permission.POST_NOTIFICATIONS },
                alias = BackgroundAudioPlugin.NOTIFICATIONS_PERMISSION_ALIAS
        )
})
public class BackgroundAudioPlugin extends Plugin implements PlaybackActionBus.Listener {

    static final String NOTIFICATIONS_PERMISSION_ALIAS = "notifications";

    private static final String TAG = "BackgroundAudio";
    private static final String NOTIFICATIONS_PERMISSION_CALLBACK = "onNotificationsPermissionResult";

    @Override
    public void load() {
        super.load();
        PlaybackActionBus.setListener(this);
    }

    @Override
    protected void handleOnDestroy() {
        if (PlaybackActionBus.isListener(this)) {
            PlaybackActionBus.setListener(null);
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        ensureNotificationPermission(call, () -> launchService(call));
    }

    @PluginMethod
    public void update(PluginCall call) {
        // 权限在 start 时已处理，这里直接刷新状态
        launchService(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            MusicPlaybackService.stop(getContext());
            call.resolve();
        } catch (Exception error) {
            Log.w(TAG, "stop background audio failed", error);
            call.resolve();
        }
    }

    @Override
    public void onPlaybackAction(String action, long value) {
        JSObject payload = new JSObject();
        payload.put("action", action);
        payload.put("positionMs", value);
        notifyListeners("action", payload);
    }

    private void launchService(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String coverUrl = call.getString("coverUrl", "");
        boolean playing = call.getBoolean("isPlaying", false);
        double durationMs = call.getDouble("durationMs", 0.0);
        double positionMs = call.getDouble("positionMs", 0.0);

        try {
            MusicPlaybackService.start(
                    getContext(),
                    title,
                    artist,
                    coverUrl,
                    playing,
                    Math.round(durationMs),
                    Math.round(positionMs)
            );
            call.resolve();
        } catch (Exception error) {
            // 后台状态下（如锁屏媒体按钮恢复播放）可能触发 FGS 启动限制，静默降级
            Log.w(TAG, "start background audio failed", error);
            call.resolve();
        }
    }

    private void ensureNotificationPermission(PluginCall call, Runnable proceed) {
        boolean runtimePermissionNeeded =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
        if (!runtimePermissionNeeded) {
            proceed.run();
            return;
        }

        if (hasNotificationPermission()) {
            proceed.run();
            return;
        }

        try {
            requestPermissionForAlias(NOTIFICATIONS_PERMISSION_ALIAS, call,
                    NOTIFICATIONS_PERMISSION_CALLBACK);
        } catch (Exception error) {
            Log.w(TAG, "request notification permission failed", error);
            proceed.run();
        }
    }

    @PermissionCallback
    private void onNotificationsPermissionResult(PluginCall call) {
        if (!hasNotificationPermission()) {
            Log.i(TAG, "notification permission denied; FGS will run without visible notification");
        }
        // 无论授权与否都继续启动服务（无权限时仅隐藏通知，保活逻辑不受影响）
        launchService(call);
    }

    @SuppressWarnings("deprecation")
    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        int state = getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS);
        return state == PackageManager.PERMISSION_GRANTED;
    }
}
