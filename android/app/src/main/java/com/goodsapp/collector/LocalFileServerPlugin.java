package com.goodsapp.collector;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

import fi.iki.elonen.NanoHTTPD;

/**
 * 一次性本地文件 HTTP 服务。
 *
 * CapGo download() 走 HttpURLConnection，只接受 http/https，
 * file:// 或绝对路径会报 "Failed to download from"。云端安装能成功是因为
 * 有 HTTPS 直链；本地 zip 用同一链路：起一个只读回环 HTTP，把 zip 喂给 CapGo。
 *
 * startFileServer({ path }) -> { url }  仅服务注册的那一个文件
 * stopFileServer()                     安装结束后关闭
 */
@CapacitorPlugin(name = "LocalFileServer")
public class LocalFileServerPlugin extends Plugin {

    private static final String TAG = "LocalFileServer";
    private static final String SERVE_PATH = "/bundle.zip";

    private OneFileServer server;
    private String servedPath = "";

    private static final class OneFileServer extends NanoHTTPD {

        private final String filePath;

        private OneFileServer(int listenPort, String filePath) {
            // 只听回环：CapGo 在本机下载即可，不对局域网暴露资源包
            super("127.0.0.1", listenPort);
            this.filePath = filePath;
        }

        @Override
        public Response serve(IHTTPSession session) {
            if (!SERVE_PATH.equals(session.getUri())) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, NanoHTTPD.MIME_PLAINTEXT, "not found");
            }

            File file = new File(filePath);
            if (!file.isFile()) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, NanoHTTPD.MIME_PLAINTEXT, "missing file");
            }

            try {
                InputStream input = new FileInputStream(file);
                Response response = newFixedLengthResponse(
                    Response.Status.OK,
                    "application/zip",
                    input,
                    file.length()
                );
                response.addHeader("Content-Disposition", "attachment; filename=\"bundle.zip\"");
                return response;
            } catch (IOException error) {
                Log.e(TAG, "read file failed: " + filePath, error);
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, NanoHTTPD.MIME_PLAINTEXT, "read failed");
            }
        }
    }

    private void stopServerInternal() {
        if (server != null) {
            try {
                server.stop();
            } catch (Exception error) {
                Log.w(TAG, "stop server failed", error);
            }
            server = null;
        }
        servedPath = "";
    }

    @PluginMethod
    public void startFileServer(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("path required");
            return;
        }

        File file = new File(path);
        if (!file.isFile()) {
            call.reject("file not found: " + path);
            return;
        }

        // 换文件时先关旧端口，避免串包
        stopServerInternal();

        try {
            Integer requestedPort = call.getInt("port");
            int listenPort = requestedPort != null ? requestedPort : 0;
            servedPath = file.getAbsolutePath();
            OneFileServer next = new OneFileServer(listenPort, servedPath);
            // daemon=true：安装结束调用 stop 即可，不占前台线程
            next.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true);
            server = next;

            int boundPort = next.getListeningPort();
            String url = "http://127.0.0.1:" + boundPort + SERVE_PATH;
            Log.i(TAG, "serving " + servedPath + " at " + url);

            JSObject data = new JSObject();
            data.put("url", url);
            data.put("port", boundPort);
            call.resolve(data);
        } catch (Exception error) {
            stopServerInternal();
            Log.e(TAG, "start server failed", error);
            call.reject("start file server failed: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void stopFileServer(PluginCall call) {
        stopServerInternal();
        JSObject data = new JSObject();
        data.put("stopped", true);
        call.resolve(data);
    }

    @Override
    protected void handleOnDestroy() {
        stopServerInternal();
        super.handleOnDestroy();
    }
}
