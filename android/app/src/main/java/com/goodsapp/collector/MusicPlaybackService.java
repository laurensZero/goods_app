package com.goodsapp.collector;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicPlaybackService extends Service {

    private static final String TAG = "MusicPlaybackService";
    private static final String CHANNEL_ID = "music_playback";
    private static final int NOTIFICATION_ID = 20260824;

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_COVER_URL = "coverUrl";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_DURATION_MS = "durationMs";
    public static final String EXTRA_POSITION_MS = "positionMs";

    public static final String ACTION_TOGGLE_PLAY =
            "com.goodsapp.collector.action.MEDIA_TOGGLE_PLAY";
    public static final String ACTION_NEXT =
            "com.goodsapp.collector.action.MEDIA_NEXT";
    public static final String ACTION_PREVIOUS =
            "com.goodsapp.collector.action.MEDIA_PREVIOUS";
    public static final String ACTION_STOP =
            "com.goodsapp.collector.action.STOP_PLAYBACK_SERVICE";

    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private String trackTitle = "";
    private String trackArtist = "";
    private String coverUrl = "";
    private boolean isPlaying = false;
    private long durationMs = 0L;
    private long positionMs = 0L;
    private Bitmap artwork;
    private String loadedArtworkUrl = "";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        createMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_TOGGLE_PLAY.equals(action)) {
            PlaybackActionBus.dispatch("toggle");
            return START_NOT_STICKY;
        }
        if (ACTION_NEXT.equals(action)) {
            PlaybackActionBus.dispatch("next");
            return START_NOT_STICKY;
        }
        if (ACTION_PREVIOUS.equals(action)) {
            PlaybackActionBus.dispatch("previous");
            return START_NOT_STICKY;
        }

        applyExtras(intent);
        acquireLocks();

        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception error) {
            Log.w(TAG, "startForeground failed", error);
        }

        if (mediaSession != null) {
            mediaSession.setActive(true);
            mediaSession.setMetadata(buildMetadata());
            mediaSession.setPlaybackState(buildPlaybackState());
        }

        loadArtworkAsync();
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // WebView/播放器随任务一起销毁，清理残留通知
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseLocks();
        artworkExecutor.shutdownNow();
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
            }
            mediaSession = null;
        }
        if (artwork != null && !artwork.isRecycled()) {
            artwork.recycle();
        }
        artwork = null;
        loadedArtworkUrl = "";
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void applyExtras(Intent intent) {
        if (intent == null) return;
        String title = intent.getStringExtra(EXTRA_TITLE);
        String artist = intent.getStringExtra(EXTRA_ARTIST);
        String cover = intent.getStringExtra(EXTRA_COVER_URL);
        if (title != null) trackTitle = title;
        if (artist != null) trackArtist = artist;
        if (cover != null && !cover.equals(coverUrl)) {
            coverUrl = cover;
        } else if (cover == null || cover.isEmpty()) {
            coverUrl = "";
        }
        isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, isPlaying);
        durationMs = intent.getLongExtra(EXTRA_DURATION_MS, durationMs);
        positionMs = intent.getLongExtra(EXTRA_POSITION_MS, positionMs);
    }

    private void createChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "音乐播放",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("息屏后保持音乐继续播放");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private void createMediaSession() {
        try {
            mediaSession = new MediaSessionCompat(this, "GoodsAppMusic");
            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    PlaybackActionBus.dispatch("play");
                }

                @Override
                public void onPause() {
                    PlaybackActionBus.dispatch("pause");
                }

                @Override
                public void onSkipToNext() {
                    PlaybackActionBus.dispatch("next");
                }

                @Override
                public void onSkipToPrevious() {
                    PlaybackActionBus.dispatch("previous");
                }

                @Override
                public void onSeekTo(long pos) {
                    PlaybackActionBus.dispatch("seek", pos);
                }
            });
        } catch (Exception error) {
            Log.w(TAG, "create MediaSession failed", error);
            mediaSession = null;
        }
    }

    private MediaMetadataCompat buildMetadata() {
        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,
                        trackTitle == null || trackTitle.isEmpty() ? "正在播放" : trackTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST,
                        trackArtist == null ? "" : trackArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Math.max(0L, durationMs));
        if (artwork != null && !artwork.isRecycled()) {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
        }
        return builder.build();
    }

    private PlaybackStateCompat buildPlaybackState() {
        long actions = PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO;
        return new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                        isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        Math.max(0L, positionMs),
                        isPlaying ? 1f : 0f
                )
                .build();
    }

    private Notification buildNotification() {
        PendingIntent contentIntent = buildContentIntent();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(trackTitle == null || trackTitle.isEmpty() ? "正在播放" : trackTitle)
                .setContentText(trackArtist == null ? "" : trackArtist)
                .setOngoing(isPlaying)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(new NotificationCompat.Action(
                        android.R.drawable.ic_media_previous, "上一首", actionPendingIntent(ACTION_PREVIOUS, 11)))
                .addAction(new NotificationCompat.Action(
                        isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        isPlaying ? "暂停" : "播放",
                        actionPendingIntent(ACTION_TOGGLE_PLAY, 12)))
                .addAction(new NotificationCompat.Action(
                        android.R.drawable.ic_media_next, "下一首", actionPendingIntent(ACTION_NEXT, 13)))
                .setContentIntent(contentIntent);

        if (artwork != null && !artwork.isRecycled()) {
            builder.setLargeIcon(artwork);
        }

        if (mediaSession != null) {
            builder.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }

        return builder.build();
    }

    private PendingIntent actionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MusicPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private PendingIntent buildContentIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) {
            launch = new Intent(this, MainActivity.class);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(this, 10, launch, flags);
    }

    @SuppressWarnings({"WakelockTimeout", "deprecation"})
    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "goodsapp:music");
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire();
            } catch (Exception error) {
                Log.w(TAG, "wake lock acquire failed", error);
            }
        }

        if (wifiLock == null) {
            WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wifiManager.createWifiLock(mode, "goodsapp:music");
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) {
            try {
                wifiLock.acquire();
            } catch (Exception error) {
                Log.w(TAG, "wifi lock acquire failed", error);
            }
        }
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {
            }
        }
        wakeLock = null;

        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Exception ignored) {
            }
        }
        wifiLock = null;
    }

    private void loadArtworkAsync() {
        final String targetUrl = coverUrl;
        if (targetUrl == null || targetUrl.isEmpty()) {
            // 新曲目无封面时清掉旧封面引用（不立即 recycle，通知可能仍在渲染）
            if (artwork != null) {
                artwork = null;
                loadedArtworkUrl = "";
                refreshNotification();
            }
            return;
        }
        if (targetUrl.equals(loadedArtworkUrl) && artwork != null && !artwork.isRecycled()) return;

        artworkExecutor.execute(() -> {
            Bitmap downloaded = downloadBitmap(targetUrl);
            if (downloaded == null) return;
            mainHandler.post(() -> {
                if (!targetUrl.equals(coverUrl)) {
                    // 曲目已切换，丢弃过期封面
                    downloaded.recycle();
                    return;
                }
                loadedArtworkUrl = targetUrl;
                artwork = downloaded;
                refreshNotification();
            });
        });
    }

    private void refreshNotification() {
        if (mediaSession != null) {
            mediaSession.setMetadata(buildMetadata());
        }
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private Bitmap downloadBitmap(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(true);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return null;
            InputStream stream = connection.getInputStream();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = computeSampleSize(connection.getContentLength());
            Bitmap bitmap = BitmapFactory.decodeStream(stream, null, options);
            stream.close();
            return bitmap;
        } catch (Exception error) {
            Log.w(TAG, "download cover failed: " + url, error);
            return null;
        } finally {
            if (connection != null) {
                try {
                    connection.disconnect();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private int computeSampleSize(int contentLength) {
        // 封面压缩到约 ≤512KB 解码体积，避免大图占内存
        if (contentLength <= 0) return 1;
        int sample = 1;
        while (contentLength / (sample * sample) > 512 * 1024) {
            sample *= 2;
        }
        return sample;
    }

    public static void start(Context context, String title, String artist, String cover,
                             boolean playing, long durMs, long posMs) {
        Intent intent = new Intent(context, MusicPlaybackService.class);
        intent.putExtra(EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(EXTRA_ARTIST, artist == null ? "" : artist);
        intent.putExtra(EXTRA_COVER_URL, cover == null ? "" : cover);
        intent.putExtra(EXTRA_IS_PLAYING, playing);
        intent.putExtra(EXTRA_DURATION_MS, durMs);
        intent.putExtra(EXTRA_POSITION_MS, posMs);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void sendAction(Context context, String action) {
        try {
            Intent intent = new Intent(context, MusicPlaybackService.class);
            intent.setAction(action);
            context.startService(intent);
        } catch (Exception error) {
            Log.w(TAG, "send service action failed", error);
        }
    }

    public static void stop(Context context) {
        try {
            context.stopService(new Intent(context, MusicPlaybackService.class));
        } catch (Exception error) {
            Log.w(TAG, "stop service failed", error);
        }
    }
}
