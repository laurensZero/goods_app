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
    private static final String REFERER = "https://www.bilibili.com/";
    private static final String ORIGIN = "https://www.bilibili.com";
    private static final String USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
    private ExoPlayer player;

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Bilibili audio URL is empty");
            return;
        }
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        getActivity().runOnUiThread(() -> {
            try {
                ensurePlayer();
                MediaMetadata metadata = new MediaMetadata.Builder().setTitle(title).setArtist(artist).build();
                MediaItem item = new MediaItem.Builder().setUri(Uri.parse(url)).setMediaMetadata(metadata).build();
                player.setMediaItem(item);
                player.prepare();
                player.play();
                call.resolve();
            } catch (Exception error) {
                logError("play-setup", error, url);
                call.reject("Unable to prepare Bilibili audio", error);
            }
        });
    }

    @PluginMethod public void pause(PluginCall call) { runPlayerCommand(call, () -> player.pause()); }
    @PluginMethod public void resume(PluginCall call) { runPlayerCommand(call, () -> player.play()); }
    @PluginMethod public void stop(PluginCall call) { runPlayerCommand(call, () -> player.stop()); }
    @PluginMethod public void seekTo(PluginCall call) {
        long positionMs = call.getLong("positionMs", 0L);
        runPlayerCommand(call, () -> player.seekTo(Math.max(0L, positionMs)));
    }
    @PluginMethod public void setVolume(PluginCall call) {
        double volume = call.getDouble("volume", 1.0);
        runPlayerCommand(call, () -> player.setVolume((float) Math.max(0.0, Math.min(1.0, volume))));
    }
    @PluginMethod public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> { releasePlayer(); call.resolve(); });
    }

    private void runPlayerCommand(PluginCall call, Runnable command) {
        getActivity().runOnUiThread(() -> {
            if (player == null) { call.resolve(); return; }
            command.run();
            call.resolve();
        });
    }

    private void ensurePlayer() {
        if (player != null) return;
        Map<String, String> headers = new HashMap<>();
        headers.put("Referer", REFERER);
        headers.put("Origin", ORIGIN);
        headers.put("Accept", "*/*");
        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(USER_AGENT)
                .setDefaultRequestProperties(headers);
        player = new ExoPlayer.Builder(getContext())
                .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory))
                .build();
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean isPlaying) { emitState(isPlaying ? "playing" : "paused"); }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) emitState("buffering");
                if (state == Player.STATE_ENDED) emitState("ended");
            }
            @Override public void onPlayerError(@NonNull PlaybackException error) {
                logError("playback", error, currentUrl());
                JSObject payload = new JSObject();
                payload.put("type", classifyError(error));
                payload.put("message", error.getMessage() == null ? "" : error.getMessage());
                payload.put("urlHost", hostOf(currentUrl()));
                if (error.getCause() instanceof HttpDataSource.InvalidResponseCodeException) {
                    HttpDataSource.InvalidResponseCodeException http = (HttpDataSource.InvalidResponseCodeException) error.getCause();
                    payload.put("status", http.responseCode);
                    payload.put("responseHeaders", String.valueOf(http.headerFields));
                }
                notifyListeners("error", payload);
            }
        });
    }

    private void emitState(String state) {
        if (player == null) return;
        JSObject payload = new JSObject();
        payload.put("state", state);
        payload.put("positionMs", player.getCurrentPosition());
        payload.put("durationMs", Math.max(0L, player.getDuration()));
        notifyListeners("state", payload);
    }

    private String currentUrl() { return player == null || player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().localConfiguration.uri.toString(); }
    private String hostOf(String url) { try { return Uri.parse(url).getHost() == null ? "" : Uri.parse(url).getHost(); } catch (Exception ignored) { return ""; } }
    private String classifyError(PlaybackException error) {
        if (error.getCause() instanceof HttpDataSource.InvalidResponseCodeException) return "cdn_http";
        if (error.errorCode == PlaybackException.ERROR_CODE_DECODING_FAILED) return "decoder";
        if (error.getCause() instanceof HttpDataSourceException) return "network";
        return "playback";
    }
    private void logError(String type, Exception error, String url) {
        String details = error.getMessage() == null ? "" : error.getMessage();
        if (error instanceof PlaybackException && error.getCause() instanceof HttpDataSource.InvalidResponseCodeException) {
            HttpDataSource.InvalidResponseCodeException http = (HttpDataSource.InvalidResponseCodeException) error.getCause();
            Log.e(TAG, type + " httpStatus=" + http.responseCode + " host=" + hostOf(url) + " headers=" + http.headerFields + " message=" + details, error);
        } else {
            Log.e(TAG, type + " host=" + hostOf(url) + " message=" + details, error);
        }
    }
    private void releasePlayer() { if (player != null) { player.release(); player = null; } }
    @Override protected void handleOnDestroy() { releasePlayer(); super.handleOnDestroy(); }
}
