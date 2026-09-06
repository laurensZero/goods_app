package com.goodsapp.collector;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import fi.iki.elonen.NanoHTTPD;

/**
 * 应用内 MCP HTTP 服务（Android 原生端）。
 *
 * WebView 里的 JS 无法监听 TCP 端口，因此 MCP 的 Streamable HTTP 入口由本插件
 * 的 NanoHTTPD 提供；协议处理与数据访问仍在 JS 层（protocol.js / tools.js）：
 *
 *   AI 客户端 ──HTTP POST /mcp──▶ NanoHTTPD（本插件）
 *                                  │  鉴权（Bearer token）
 *                                  │  notifyListeners("mcpRequest", {id, body})
 *                                  ▼
 *                             JS 层执行（真实 SQLite）
 *                                  │  respond({id, status, body})
 *                                  ▼
 *                             HTTP 响应回客户端
 *
 * 仅应用进程存活期间可用（前台），无前台 Service；插件销毁时自动关闭端口。
 */
@CapacitorPlugin(name = "McpServer")
public class McpServerPlugin extends Plugin {

    private static final String TAG = "McpServerPlugin";
    /** 等待 JS 层执行工具并回执的超时：本地 SQLite 查询应在秒级完成 */
    private static final long JS_ROUNDTRIP_TIMEOUT_MS = 30000;

    private McpHttpServer server;
    private String token = "";
    private int port = -1;
    private final ConcurrentHashMap<String, PendingJsResponse> pending = new ConcurrentHashMap<>();

    /** 一次 HTTP 请求对应的 JS 回执槽位 */
    private static final class PendingJsResponse {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> body = new AtomicReference<>("");
        final AtomicInteger status = new AtomicInteger(200);
    }

    private final class McpHttpServer extends NanoHTTPD {

        private McpHttpServer(int listenPort) {
            super(listenPort);
        }

        @Override
        public Response serve(IHTTPSession session) {
            Method method = session.getMethod();

            if (method == Method.OPTIONS) {
                Response preflight = newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "");
                addCorsHeaders(preflight);
                preflight.addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
                preflight.addHeader("Access-Control-Allow-Headers",
                        "authorization, content-type, mcp-protocol-version, mcp-session-id");
                preflight.addHeader("Access-Control-Max-Age", "86400");
                return preflight;
            }

            // Streamable HTTP：不提供 SSE 流时对 GET/DELETE 等回 405
            if (method != Method.POST) {
                Response notAllowed = jsonResponse(Response.Status.METHOD_NOT_ALLOWED,
                        "{\"error\":\"method not allowed\"}");
                notAllowed.addHeader("Allow", "POST, OPTIONS");
                return notAllowed;
            }

            String authorization = session.getHeaders().get("authorization");
            if (!isBearerValid(authorization)) {
                Response unauthorized = jsonResponse(Response.Status.UNAUTHORIZED, "{\"error\":\"unauthorized\"}");
                unauthorized.addHeader("WWW-Authenticate", "Bearer");
                return unauthorized;
            }

            String body;
            try {
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                body = files.get("postData");
            } catch (Exception error) {
                Log.w(TAG, "read request body failed", error);
                return jsonResponse(Response.Status.BAD_REQUEST, "{\"error\":\"bad request body\"}");
            }
            if (body == null) {
                body = "";
            }

            // 转发给 JS 层执行，阻塞等待回执
            String requestId = UUID.randomUUID().toString();
            PendingJsResponse slot = new PendingJsResponse();
            pending.put(requestId, slot);

            JSObject payload = new JSObject();
            payload.put("id", requestId);
            payload.put("body", body);
            notifyListeners("mcpRequest", payload);

            boolean completed;
            try {
                completed = slot.latch.await(JS_ROUNDTRIP_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                completed = false;
            }
            pending.remove(requestId);
            if (!completed) {
                return jsonResponse(Response.Status.INTERNAL_ERROR,
                        "{\"error\":\"app did not respond in time\"}");
            }

            int status = slot.status.get();
            Response response = status == 202
                    ? newFixedLengthResponse(Response.Status.ACCEPTED, "application/json", "")
                    : newFixedLengthResponse(Response.Status.lookup(status), "application/json", slot.body.get());
            addCorsHeaders(response);
            return response;
        }
    }

    private boolean isBearerValid(String authorization) {
        if (token.isEmpty() || authorization == null) return false;
        String expected = "Bearer " + token;
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                authorization.trim().getBytes(StandardCharsets.UTF_8));
    }

    private void addCorsHeaders(NanoHTTPD.Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
    }

    private NanoHTTPD.Response jsonResponse(NanoHTTPD.Response.Status status, String json) {
        NanoHTTPD.Response response = NanoHTTPD.newFixedLengthResponse(status, "application/json", json);
        addCorsHeaders(response);
        return response;
    }

    private synchronized void stopInternal() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        Integer requestedPort = call.getInt("port");
        String requestedToken = call.getString("token");
        int listenPort = requestedPort != null ? requestedPort : 8726;
        if (requestedToken == null || requestedToken.isEmpty()) {
            call.reject("token is required");
            return;
        }

        synchronized (this) {
            if (server != null && server.wasStarted() && this.port == listenPort && this.token.equals(requestedToken)) {
                JSObject running = new JSObject();
                running.put("port", this.port);
                call.resolve(running);
                return;
            }
            stopInternal();
            try {
                token = requestedToken;
                port = listenPort;
                McpHttpServer next = new McpHttpServer(port);
                next.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
                server = next;
            } catch (IOException error) {
                server = null;
                Log.e(TAG, "start mcp server failed on port " + listenPort, error);
                call.reject("start mcp server failed", error);
                return;
            }
        }

        Log.i(TAG, "mcp server started on port " + port);
        JSObject data = new JSObject();
        data.put("port", port);
        call.resolve(data);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject data = new JSObject();
        data.put("running", server != null && server.wasStarted());
        data.put("port", port);
        call.resolve(data);
    }

    /** JS 层完成一次请求的处理后回执；id 对应 mcpRequest 事件里的 id */
    @PluginMethod
    public void respond(PluginCall call) {
        String requestId = call.getString("id");
        String body = call.getString("body", "");
        Integer status = call.getInt("status", 200);
        if (requestId == null) {
            call.reject("id is required");
            return;
        }
        PendingJsResponse slot = pending.get(requestId);
        if (slot != null) {
            slot.body.set(body != null ? body : "");
            slot.status.set(status != null ? status : 200);
            slot.latch.countDown();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }
}
