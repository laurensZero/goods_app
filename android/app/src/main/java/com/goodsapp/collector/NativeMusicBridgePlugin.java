package com.goodsapp.collector;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.core.content.ContextCompat;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

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
    private static final String CHANNEL_ID = "music_playback";
    private static final int NOTIFICATION_ID = 163001;
    private static final String ACTION_PREVIOUS = "com.goodsapp.collector.media.PREVIOUS";
    private static final String ACTION_TOGGLE = "com.goodsapp.collector.media.TOGGLE";
    private static final String ACTION_NEXT = "com.goodsapp.collector.media.NEXT";

    private static final String[] NETEASE_PACKAGES = new String[] {
        "com.hihonor.cloudmusic",
        "com.netease.cloudmusic"
    };

    private MediaSessionCompat mediaSession;
    private BroadcastReceiver actionReceiver;

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
        setupMediaSession();
        registerActionReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterActionReceiver();
        cancelNotification();
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
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

        String title = call.getString("title", "未命名曲目");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artworkUrl = call.getString("artworkUrl", "");
        boolean isPlaying = call.getBoolean("isPlaying", false);
        boolean hasPrevious = call.getBoolean("hasPrevious", false);
        boolean hasNext = call.getBoolean("hasNext", false);
        long durationMs = Math.max(0L, call.getLong("durationMs", 0L));
        long positionMs = Math.max(0L, call.getLong("positionMs", 0L));

        updateMediaSessionState(title, artist, album, durationMs, positionMs, isPlaying);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(buildContentText(artist, album))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .setSilent(true)
            .setShowWhen(false)
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken()));

        if (hasPrevious) {
            builder.addAction(android.R.drawable.ic_media_previous, "上一首", buildActionPendingIntent(ACTION_PREVIOUS, 1));
        }
        builder.addAction(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            isPlaying ? "暂停" : "播放",
            buildActionPendingIntent(ACTION_TOGGLE, 2)
        );
        if (hasNext) {
            builder.addAction(android.R.drawable.ic_media_next, "下一首", buildActionPendingIntent(ACTION_NEXT, 3));
        }

        if (!TextUtils.isEmpty(artworkUrl)) {
            builder.setSubText(album);
        }

        NotificationManagerCompat.from(getContext()).notify(NOTIFICATION_ID, builder.build());

        JSObject result = new JSObject();
        result.put("shown", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearPlaybackNotification(PluginCall call) {
        cancelNotification();
        clearMediaSessionState();
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
            "orpheus://song?id=" + songId
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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "音乐播放",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("显示当前播放曲目的系统媒体通知");
        NotificationManager manager = ContextCompat.getSystemService(getContext(), NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void setupMediaSession() {
        if (mediaSession != null) return;
        mediaSession = new MediaSessionCompat(getContext(), "GoodsAppMediaSession");
        mediaSession.setActive(true);
    }

    private void updateMediaSessionState(
        String title,
        String artist,
        String album,
        long durationMs,
        long positionMs,
        boolean isPlaying
    ) {
        setupMediaSession();

        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build();
        mediaSession.setMetadata(metadata);

        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SEEK_TO;

        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(
                isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                positionMs,
                isPlaying ? 1.0f : 0.0f
            )
            .build();
        mediaSession.setPlaybackState(state);
    }

    private void clearMediaSessionState() {
        if (mediaSession == null) return;
        mediaSession.setMetadata(null);
        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE)
            .setState(PlaybackStateCompat.STATE_NONE, 0L, 0f)
            .build();
        mediaSession.setPlaybackState(state);
    }

    private PendingIntent buildActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(getContext().getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(getContext(), requestCode, intent, flags);
    }

    private void registerActionReceiver() {
        if (actionReceiver != null) return;

        actionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent != null ? intent.getAction() : "";
                JSObject payload = new JSObject();
                if (ACTION_PREVIOUS.equals(action)) {
                    payload.put("action", "previous");
                } else if (ACTION_TOGGLE.equals(action)) {
                    payload.put("action", "toggle");
                } else if (ACTION_NEXT.equals(action)) {
                    payload.put("action", "next");
                } else {
                    return;
                }
                notifyListeners("mediaAction", payload, true);
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PREVIOUS);
        filter.addAction(ACTION_TOGGLE);
        filter.addAction(ACTION_NEXT);

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

    private void cancelNotification() {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    @NonNull
    private String buildContentText(String artist, String album) {
        if (!TextUtils.isEmpty(artist) && !TextUtils.isEmpty(album)) {
            return artist + " · " + album;
        }
        if (!TextUtils.isEmpty(artist)) {
            return artist;
        }
        if (!TextUtils.isEmpty(album)) {
            return album;
        }
        return "网易云音乐";
    }
}
