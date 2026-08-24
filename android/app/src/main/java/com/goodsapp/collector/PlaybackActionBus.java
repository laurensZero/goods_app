package com.goodsapp.collector;

/**
 * 服务内媒体按钮事件 → 插件 → JS 的单向分发总线（同进程内）。
 */
public final class PlaybackActionBus {

    public interface Listener {
        void onPlaybackAction(String action, long value);
    }

    private static volatile Listener listener;

    private PlaybackActionBus() {
    }

    public static void setListener(Listener newListener) {
        listener = newListener;
    }

    public static boolean isListener(Listener candidate) {
        return listener == candidate;
    }

    public static void dispatch(String action) {
        dispatch(action, -1L);
    }

    public static void dispatch(String action, long value) {
        Listener current = listener;
        if (current != null) {
            current.onPlaybackAction(action, value);
        }
    }
}
