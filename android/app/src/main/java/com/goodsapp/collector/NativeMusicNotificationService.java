package com.goodsapp.collector;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.text.TextUtils;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

public class NativeMusicNotificationService extends Service {
    public static final String CHANNEL_ID = "music_playback";
    public static final int NOTIFICATION_ID = 163001;
    public static final String ACTION_UPDATE = "com.goodsapp.collector.media.UPDATE_NOTIFICATION";
    public static final String ACTION_STOP = "com.goodsapp.collector.media.STOP_NOTIFICATION";
    public static final String ACTION_PREVIOUS = "com.goodsapp.collector.media.PREVIOUS";
    public static final String ACTION_TOGGLE = "com.goodsapp.collector.media.TOGGLE";
    public static final String ACTION_NEXT = "com.goodsapp.collector.media.NEXT";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ALBUM = "album";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_HAS_PREVIOUS = "hasPrevious";
    public static final String EXTRA_HAS_NEXT = "hasNext";
    public static final String EXTRA_DURATION_MS = "durationMs";
    public static final String EXTRA_POSITION_MS = "positionMs";

    private MediaSessionCompat mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSessionCompat(this, "GoodsAppMediaNotification");
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : "";
        if (ACTION_STOP.equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : "未命名曲目";
        String artist = intent != null ? intent.getStringExtra(EXTRA_ARTIST) : "";
        String album = intent != null ? intent.getStringExtra(EXTRA_ALBUM) : "";
        boolean isPlaying = intent != null && intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
        boolean hasPrevious = intent != null && intent.getBooleanExtra(EXTRA_HAS_PREVIOUS, false);
        boolean hasNext = intent != null && intent.getBooleanExtra(EXTRA_HAS_NEXT, false);
        long durationMs = intent != null ? Math.max(0L, intent.getLongExtra(EXTRA_DURATION_MS, 0L)) : 0L;
        long positionMs = intent != null ? Math.max(0L, intent.getLongExtra(EXTRA_POSITION_MS, 0L)) : 0L;

        updateMediaSession(title, artist, album, durationMs, positionMs, isPlaying);
        Notification notification = buildNotification(title, artist, album, isPlaying, hasPrevious, hasNext);

        int foregroundType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, foregroundType);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID);
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification(
        String title,
        String artist,
        String album,
        boolean isPlaying,
        boolean hasPrevious,
        boolean hasNext
    ) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(TextUtils.isEmpty(title) ? "未命名曲目" : title)
            .setContentText(buildContentText(artist, album))
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .setSilent(true)
            .setShowWhen(false)
            .setContentIntent(buildLaunchAppPendingIntent())
            .setDeleteIntent(buildServicePendingIntent(ACTION_STOP, 10))
            .setStyle(new MediaStyle().setMediaSession(mediaSession.getSessionToken()));

        if (hasPrevious) {
            builder.addAction(android.R.drawable.ic_media_previous, "上一首", buildBroadcastPendingIntent(ACTION_PREVIOUS, 1));
        }
        builder.addAction(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            isPlaying ? "暂停" : "播放",
            buildBroadcastPendingIntent(ACTION_TOGGLE, 2)
        );
        if (hasNext) {
            builder.addAction(android.R.drawable.ic_media_next, "下一首", buildBroadcastPendingIntent(ACTION_NEXT, 3));
        }

        return builder.build();
    }

    private void updateMediaSession(
        String title,
        String artist,
        String album,
        long durationMs,
        long positionMs,
        boolean isPlaying
    ) {
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

    private PendingIntent buildBroadcastPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(this, requestCode, intent, flags);
    }

    private PendingIntent buildServicePendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, NativeMusicNotificationService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private PendingIntent buildLaunchAppPendingIntent() {
        PackageManager packageManager = getPackageManager();
        Intent launchIntent = packageManager.getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(this, 20, launchIntent, flags);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "音乐播放",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("显示当前播放曲目的系统媒体通知");

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

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
