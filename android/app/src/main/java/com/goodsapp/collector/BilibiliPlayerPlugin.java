package com.goodsapp.collector;

import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.HttpDataSourceException;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "BilibiliPlayer")
public class BilibiliPlayerPlugin extends Plugin {

    private static final String TAG = "BilibiliPlayer";

    private static final String REFERER =
            "https://www.bilibili.com/";

    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 10; K) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Mobile Safari/537.36";

    private ExoPlayer player;
    private String lastUrl = "";

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

        getActivity().runOnUiThread(() -> {
            try {
                ensurePlayer();

                lastUrl = finalUrl;

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
        long positionMs = call.getLong("positionMs", 0L);

        runPlayerCommand(
                call,
                () -> player.seekTo(Math.max(0L, positionMs))
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

        player.addListener(new Player.Listener() {

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
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
                    emitState("ended");
                }
            }

            @Override
            public void onPlayerError(
                    @NonNull PlaybackException error
            ) {
                handlePlaybackError(error);
            }
        });

        Log.d(TAG, "ExoPlayer initialized");
    }

    // =========================
    // Error handling
    // =========================

    private void handlePlaybackError(
            @NonNull PlaybackException error
    ) {
        String url = currentUrl();

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
            if (cause instanceof HttpDataSourceException) {
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