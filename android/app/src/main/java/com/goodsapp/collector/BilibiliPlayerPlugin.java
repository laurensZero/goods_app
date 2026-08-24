package com.goodsapp.collector;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "BilibiliPlayer")
public class BilibiliPlayerPlugin extends Plugin {

    private static final String TAG = "BilibiliPlayer";

    private static final String REFERER =
            "https://www.bilibili.com/";

    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Safari/537.36";

    private ExoPlayer player;
    private String lastUrl = "";
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final List<String> fallbackUrls = new ArrayList<>();
    private int fallbackIndex = 0;
    private final Runnable progressTicker = new Runnable() {
        @Override public void run() {
            if (player != null && player.isPlaying()) {
                emitState("progress");
                progressHandler.postDelayed(this, 250L);
            }
        }
    };

    // =========================
    // Play
    // =========================

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url", "");

        if (url == null || url.trim().isEmpty()) {
            call.reject("Bilibili audio URL is empty");
            return;
        }

        final String finalUrl = url.trim();

        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        JSArray requestedFallbacks = call.getArray("fallbackUrls");

        getActivity().runOnUiThread(() -> {
            try {
                ensurePlayer();

                lastUrl = finalUrl;
                fallbackUrls.clear();
                fallbackIndex = 0;
                if (requestedFallbacks != null) {
                    for (int index = 0; index < requestedFallbacks.length(); index += 1) {
                        String fallback = requestedFallbacks.optString(index, "");
                        if (!fallback.isEmpty() && !fallback.equals(finalUrl)) fallbackUrls.add(fallback);
                    }
                }

                MediaMetadata metadata = new MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .build();

                MediaItem item = new MediaItem.Builder()
                        .setUri(Uri.parse(finalUrl))
                        .setMediaMetadata(metadata)
                        .build();

                player.setMediaItem(item);
                player.prepare();
                player.play();

                call.resolve();

                Log.d(
                        TAG,
                        "play url=" + finalUrl
                                + " host=" + hostOf(finalUrl)
                );

            } catch (Exception error) {
                logError("play-setup", error, finalUrl);
                call.reject(
                        "Unable to prepare Bilibili audio",
                        error
                );
            }
        });
    }

    // =========================
    // Controls
    // =========================

    @PluginMethod
    public void pause(PluginCall call) {
        runPlayerCommand(call, () -> player.pause());
    }

    @PluginMethod
    public void resume(PluginCall call) {
        runPlayerCommand(call, () -> player.play());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runPlayerCommand(call, () -> player.stop());
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double rawPositionMs = call.getDouble("positionMs", 0.0);
        long positionMs = Math.round(rawPositionMs);
        
        runPlayerCommand(
                call,
                () -> {
                    long targetMs = Math.max(0L, positionMs);
                    long durationMs = player.getDuration();
                    if (durationMs > 0) targetMs = Math.min(targetMs, durationMs);
                    boolean seekable = player.isCurrentMediaItemSeekable();
                    Log.d(TAG, "seekTo positionMs=" + targetMs + " durationMs=" + durationMs + " seekable=" + seekable);
                    if (seekable) {
                        player.seekTo(targetMs);
                    } else if (!lastUrl.isEmpty()) {
                        // 某些 Bilibili .m4s 资源没有向 ExoPlayer 暴露 seek map。
                        // 重新从目标位置装载同一 URL，交给 HTTP Range/Extractor 处理。
                        MediaItem currentItem = player.getCurrentMediaItem();
                        MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(Uri.parse(lastUrl));
                        if (currentItem != null && currentItem.mediaMetadata != null) {
                            itemBuilder.setMediaMetadata(currentItem.mediaMetadata);
                        }
                        player.setMediaItem(itemBuilder.build(), targetMs);
                        player.prepare();
                        player.play();
                    } else {
                        player.seekTo(targetMs);
                    }
                }
        );
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = call.getDouble("volume", 1.0);

        runPlayerCommand(
                call,
                () -> player.setVolume(
                        (float) Math.max(
                                0.0,
                                Math.min(1.0, volume)
                        )
                )
        );
    }

    @PluginMethod
    public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            releasePlayer();
            call.resolve();
        });
    }

    private void runPlayerCommand(
            PluginCall call,
            Runnable command
    ) {
        getActivity().runOnUiThread(() -> {
            if (player == null) {
                call.resolve();
                return;
            }

            try {
                command.run();
                call.resolve();
            } catch (Exception error) {
                Log.e(TAG, "player-command failed", error);
                call.reject(
                        "Player command failed",
                        error
                );
            }
        });
    }

    // =========================
    // ExoPlayer
    // =========================

    private void ensurePlayer() {
        if (player != null) {
            return;
        }

        Map<String, String> headers = new HashMap<>();

        // Bilibili CDN 防盗链关键请求头
        headers.put("Referer", REFERER);
        headers.put("Accept", "*/*");

        DefaultHttpDataSource.Factory httpFactory =
                new DefaultHttpDataSource.Factory()
                        .setUserAgent(USER_AGENT)
                        .setConnectTimeoutMs(15000)
                        .setReadTimeoutMs(30000)
                        .setDefaultRequestProperties(headers);

        player = new ExoPlayer.Builder(getContext())
                .setMediaSourceFactory(
                        new DefaultMediaSourceFactory(httpFactory)
                )
                .build();

        // 息屏/后台播放时保持 CPU 与网络可用，避免缓冲中断流
        player.setWakeMode(C.WAKE_MODE_NETWORK);

        player.addListener(new Player.Listener() {

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    progressHandler.removeCallbacks(progressTicker);
                    progressHandler.post(progressTicker);
                } else {
                    progressHandler.removeCallbacks(progressTicker);
                }
                emitState(
                        isPlaying
                                ? "playing"
                                : "paused"
                );
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) {
                    emitState("buffering");
                } else if (state == Player.STATE_READY) {
                    emitState("ready");
                } else if (state == Player.STATE_ENDED) {
                    progressHandler.removeCallbacks(progressTicker);
                    emitState("ended");
                }
            }

            @Override
            public void onPositionDiscontinuity(
                    @NonNull Player.PositionInfo oldPosition,
                    @NonNull Player.PositionInfo newPosition,
                    int reason
            ) {
                emitState("progress");
            }

            @Override
            public void onPlayerError(
                    @NonNull PlaybackException error
            ) {
                handlePlaybackError(error);
            }
        });

        Log.d(TAG, "ExoPlayer initialized");
        Log.d(TAG, "HTTP headers Referer=" + REFERER + " Accept=*/* User-Agent=" + USER_AGENT);
    }

    // =========================
    // Error handling
    // =========================

    private void handlePlaybackError(
            @NonNull PlaybackException error
    ) {
        String url = currentUrl();

        HttpDataSource.InvalidResponseCodeException httpError = findHttpError(error);
        if (httpError != null && httpError.responseCode == 403 && fallbackIndex < fallbackUrls.size()) {
            String retryUrl = fallbackUrls.get(fallbackIndex++);
            Log.w(TAG, "CDN 403, retrying fallback " + fallbackIndex + "/" + fallbackUrls.size() + " host=" + hostOf(retryUrl));
            lastUrl = retryUrl;
            getActivity().runOnUiThread(() -> {
                player.setMediaItem(MediaItem.fromUri(retryUrl));
                player.prepare();
                player.play();
            });
            return;
        }

        Log.e(
                TAG,
                "========== BILIBILI PLAYBACK ERROR =========="
        );

        Log.e(TAG, "url=" + url);
        Log.e(TAG, "host=" + hostOf(url));
        Log.e(TAG, "errorCode=" + error.errorCode);
        Log.e(TAG, "errorCodeName=" + error.getErrorCodeName());
        Log.e(TAG, "message=" + error.getMessage());

        Throwable cause = error;
        int depth = 0;

        while (cause != null && depth < 10) {
            Log.e(
                    TAG,
                    "cause[" + depth + "] "
                            + cause.getClass().getName()
                            + ": "
                            + cause.getMessage()
            );

            if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
                HttpDataSource.InvalidResponseCodeException http =
                        (HttpDataSource.InvalidResponseCodeException) cause;

                Log.e(
                        TAG,
                        "HTTP STATUS = "
                                + http.responseCode
                );

                Log.e(
                        TAG,
                        "HTTP HEADERS = "
                                + http.headerFields
                );
            }

            cause = cause.getCause();
            depth++;
        }

        Log.e(
                TAG,
                "==============================================",
                error
        );

        JSObject payload = new JSObject();

        payload.put(
                "type",
                classifyError(error)
        );

        payload.put(
                "message",
                error.getMessage() == null
                        ? ""
                        : error.getMessage()
        );

        payload.put("url", url);
        payload.put("urlHost", hostOf(url));
        payload.put("errorCode", error.errorCode);
        payload.put(
                "errorCodeName",
                error.getErrorCodeName()
        );

        HttpDataSource.InvalidResponseCodeException http =
                findHttpError(error);

        if (http != null) {
            payload.put(
                    "status",
                    http.responseCode
            );

            payload.put(
                    "responseHeaders",
                    String.valueOf(http.headerFields)
            );

            Log.e(
                    TAG,
                    "HTTP ERROR"
                            + " status="
                            + http.responseCode
                            + " host="
                            + hostOf(url)
                            + " headers="
                            + http.headerFields
            );
        }

        notifyListeners(
                "error",
                payload
        );
    }

    private HttpDataSource.InvalidResponseCodeException findHttpError(
            Throwable error
    ) {
        Throwable current = error;

        while (current != null) {
            if (current instanceof HttpDataSource.InvalidResponseCodeException) {
                return (HttpDataSource.InvalidResponseCodeException) current;
            }

            current = current.getCause();
        }

        return null;
    }

    private String classifyError(
            PlaybackException error
    ) {
        if (findHttpError(error) != null) {
            return "cdn_http";
        }

        if (error.errorCode
                == PlaybackException.ERROR_CODE_DECODING_FAILED) {
            return "decoder";
        }

        Throwable cause = error.getCause();

        while (cause != null) {
            if (cause.getClass().getName().contains("HttpDataSource")) {
                return "network";
            }

        cause = cause.getCause();
}

        return "playback";
    }

    // =========================
    // State
    // =========================

    private void emitState(String state) {
        if (player == null) {
            return;
        }

        JSObject payload = new JSObject();

        payload.put("state", state);
        payload.put(
                "positionMs",
                player.getCurrentPosition()
        );

        long duration = player.getDuration();

        payload.put(
                "durationMs",
                duration < 0 ? 0 : duration
        );

        notifyListeners(
                "state",
                payload
        );
    }

    // =========================
    // Helpers
    // =========================

    private String currentUrl() {
        if (player != null
                && player.getCurrentMediaItem() != null
                && player.getCurrentMediaItem().localConfiguration != null) {

            return player
                    .getCurrentMediaItem()
                    .localConfiguration
                    .uri
                    .toString();
        }

        return lastUrl;
    }

    private String hostOf(String url) {
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();

            return host == null ? "" : host;
        } catch (Exception ignored) {
            return "";
        }
    }

    private void logError(
            String type,
            Exception error,
            String url
    ) {
        Log.e(
                TAG,
                type
                        + " host="
                        + hostOf(url)
                        + " url="
                        + url
                        + " message="
                        + (
                        error.getMessage() == null
                                ? ""
                                : error.getMessage()
                ),
                error
        );
    }

    private void releasePlayer() {
        progressHandler.removeCallbacks(progressTicker);
        fallbackUrls.clear();
        if (player != null) {
            Log.d(TAG, "Releasing ExoPlayer");
            player.release();
            player = null;
        }

        lastUrl = "";
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
        super.handleOnDestroy();
    }
}
