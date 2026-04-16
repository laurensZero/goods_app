package com.goodsapp.collector;

import android.content.Context;

import androidx.annotation.NonNull;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class LocalSyncReceiverServer {
    private static final String API_PREFIX = "/api/local-sync";
    private static final int DEFAULT_PORT = 51823;
    private static final String APP_VERSION = "1.0.0";

    private final Context context;
    private final File rootDir;
    private final File currentDir;
    private final File blobsDir;
    private final File chunksDir;
    private final Map<String, SessionRecord> sessions = new ConcurrentHashMap<>();
    private final ExecutorService requestPool = Executors.newCachedThreadPool();
    private final AtomicBoolean running = new AtomicBoolean(false);

    private volatile ServerSocket serverSocket;
    private volatile Thread acceptThread;
    private volatile int port = DEFAULT_PORT;

    LocalSyncReceiverServer(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.rootDir = new File(this.context.getFilesDir(), "local-sync-runtime");
        this.currentDir = new File(rootDir, "current");
        this.blobsDir = new File(rootDir, "blobs");
        this.chunksDir = new File(rootDir, "chunks");
        ensureDirectory(rootDir);
        ensureDirectory(currentDir);
        ensureDirectory(blobsDir);
        ensureDirectory(chunksDir);
    }

    synchronized boolean start(int requestedPort) throws IOException {
        if (running.get()) {
            return true;
        }

        port = requestedPort > 0 ? requestedPort : DEFAULT_PORT;
        serverSocket = new ServerSocket(port, 50, InetAddress.getByName("0.0.0.0"));
        serverSocket.setReuseAddress(true);
        running.set(true);

        acceptThread = new Thread(this::acceptLoop, "local-sync-receiver");
        acceptThread.start();
        return true;
    }

    synchronized void stop() {
        running.set(false);
        try {
            if (serverSocket != null) {
                serverSocket.close();
            }
        } catch (IOException ignored) {
            // ignore
        } finally {
            serverSocket = null;
        }

        if (acceptThread != null) {
            acceptThread.interrupt();
            acceptThread = null;
        }
    }

    boolean isRunning() {
        return running.get();
    }

    int getPort() {
        return port;
    }

    String getBaseUrl() {
        return String.format(Locale.US, "http://127.0.0.1:%d", getPort());
    }

    JSONObject getStatusJson() {
        JSONObject result = new JSONObject();
        try {
            result.put("running", running.get());
            result.put("port", getPort());
            result.put("baseUrl", getBaseUrl());
            result.put("sessionCount", sessions.size());
        } catch (JSONException ignored) {
            // ignore
        }
        return result;
    }

    private void acceptLoop() {
        while (running.get()) {
            try {
                final Socket socket = serverSocket.accept();
                requestPool.execute(() -> handleClient(socket));
            } catch (SocketException socketClosed) {
                break;
            } catch (IOException ignored) {
                if (!running.get()) {
                    break;
                }
            }
        }
    }

    private void handleClient(Socket socket) {
        try (Socket closeableSocket = socket;
             InputStream inputStream = new BufferedInputStream(closeableSocket.getInputStream());
             OutputStream outputStream = new BufferedOutputStream(closeableSocket.getOutputStream())) {

            HttpRequest request = readRequest(inputStream);
            if (request == null) {
                writeResponse(outputStream, 400, jsonMessage("请求格式错误"));
                return;
            }

            HttpResponse response = route(request);
            writeResponse(outputStream, response.statusCode, response.body);
        } catch (Exception error) {
            try {
                OutputStream outputStream = socket.getOutputStream();
                writeResponse(outputStream, 500, jsonError(error.getMessage()));
            } catch (IOException ignored) {
                // ignore
            }
        }
    }

    private HttpResponse route(HttpRequest request) {
        String method = request.method;
        String path = request.path;

        if ("GET".equals(method) && "/api/local-sync/discover".equals(path)) {
            return jsonResponse(200, buildDiscoverResponse());
        }

        if ("GET".equals(method) && "/api/local-sync/current-content".equals(path)) {
            return jsonResponse(200, buildCurrentContentResponse());
        }

        if ("GET".equals(method) && "/api/local-sync/current".equals(path)) {
            return jsonResponse(200, buildCurrentListingResponse());
        }

        if ("POST".equals(method) && "/api/local-sync/session".equals(path)) {
            return handleSession(request);
        }

        if ("POST".equals(method) && "/api/local-sync/manifest".equals(path)) {
            return handleManifest(request);
        }

        if ("POST".equals(method) && "/api/local-sync/required-files".equals(path)) {
            return handleRequiredFiles(request);
        }

        if ("POST".equals(method) && "/api/local-sync/chunk".equals(path)) {
            return handleChunk(request);
        }

        if ("GET".equals(method) && path.startsWith("/api/local-sync/pending/")) {
            return handlePendingStatus(path);
        }

        if ("GET".equals(method) && "/api/local-sync/pending".equals(path)) {
            return handlePendingList();
        }

        if ("POST".equals(method) && "/api/local-sync/approve".equals(path)) {
            return handleApprove(request);
        }

        if ("POST".equals(method) && "/api/local-sync/reject".equals(path)) {
            return handleReject(request);
        }

        if ("POST".equals(method) && "/api/local-sync/commit".equals(path)) {
            return handleCommit(request);
        }

        return jsonResponse(404, jsonMessage("未找到接口"));
    }

    private HttpResponse handleSession(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String incomingId = body.optString("sessionId", "").trim();
        String senderDeviceId = body.optString("senderDeviceId", "").trim();
        String senderDeviceName = body.optString("senderDeviceName", "").trim();
        String sessionId = incomingId.isEmpty() ? createSessionId() : incomingId;
        SessionRecord session = sessions.get(sessionId);
        if (session == null) {
            session = new SessionRecord(sessionId, senderDeviceId, senderDeviceName);
            sessions.put(sessionId, session);
        }

        JSONObject response = new JSONObject();
        try {
            response.put("sessionId", sessionId);
            response.put("receiver", buildReceiverInfo());
            response.put("resumeToken", session.resumeToken);
            response.put("checkpoint", session.checkpointJson());
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleManifest(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        JSONObject manifest = body.optJSONObject("manifest");
        SessionRecord session = requireSession(sessionId);
        if (session == null || manifest == null) {
            return jsonResponse(400, jsonMessage("缺少 sessionId 或 manifest"));
        }

        session.manifest = manifest;
        session.status = SessionStatus.MANIFESTED;
        session.updatedAt = nowIso();

        JSONObject response = new JSONObject();
        try {
            response.put("ok", true);
            response.put("sessionId", sessionId);
            response.put("files", manifest.optJSONArray("files") != null ? manifest.optJSONArray("files").length() : 0);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleRequiredFiles(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        JSONArray files = body.optJSONArray("files");
        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        JSONArray required = new JSONArray();
        if (files != null) {
            for (int index = 0; index < files.length(); index += 1) {
                JSONObject file = files.optJSONObject(index);
                if (file == null) continue;

                String path = file.optString("path", "").trim();
                String hash = file.optString("hash", "").trim();
                if (path.isEmpty() || hash.isEmpty()) continue;

                SessionFileState state = session.fileState.get(fileKey(path, hash));
                File blobFile = blobPathByHash(hash);
                if (blobFile.exists()) {
                    continue;
                }

                JSONObject requiredItem = new JSONObject();
                try {
                    requiredItem.put("path", path);
                    requiredItem.put("hash", hash);
                    JSONArray missingChunks = new JSONArray();
                    if (state != null && state.totalChunks > 0) {
                        for (int chunkIndex = 0; chunkIndex < state.totalChunks; chunkIndex += 1) {
                            if (!state.uploadedChunks.contains(chunkIndex)) {
                                missingChunks.put(chunkIndex);
                            }
                        }
                    }
                    requiredItem.put("missingChunks", missingChunks);
                    required.put(requiredItem);
                } catch (JSONException ignored) {
                    // ignore
                }
            }
        }

        JSONObject response = new JSONObject();
        try {
            response.put("required", required);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleChunk(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        String filePath = body.optString("path", "").trim();
        String hash = body.optString("hash", "").trim();
        int index = body.optInt("index", -1);
        int totalChunks = body.optInt("totalChunks", -1);
        String data = body.optString("data", "");

        if (sessionId.isEmpty() || filePath.isEmpty() || hash.isEmpty() || index < 0 || totalChunks < 0) {
            return jsonResponse(400, jsonMessage("chunk 参数不完整"));
        }

        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        String key = fileKey(filePath, hash);
        SessionFileState state = session.fileState.get(key);
        if (state == null) {
            state = new SessionFileState(filePath, hash, totalChunks);
            session.fileState.put(key, state);
        }

        File chunkDirectory = chunkDir(sessionId, hash);
        ensureDirectory(chunkDirectory);
        File chunkFile = new File(chunkDirectory, index + ".part");
        if (!chunkFile.exists()) {
            writeBytes(chunkFile, decodeBase64(data));
        }

        state.totalChunks = totalChunks;
        state.uploadedChunks.add(index);
        session.updatedAt = nowIso();
        session.checkpoint.uploadedChunks.put(key, new ArrayList<>(state.uploadedChunks));
        writeSessionDebug(session);

        JSONObject response = new JSONObject();
        try {
            response.put("ok", true);
            response.put("uploadedChunks", state.uploadedChunks.size());
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handlePendingStatus(String path) {
        String sessionId = path.substring("/api/local-sync/pending/".length()).trim();
        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        JSONObject response = new JSONObject();
        try {
            response.put("sessionId", sessionId);
            response.put("status", session.status.apiValue);
            response.put("committedAt", session.committedAt == null ? "" : session.committedAt);
            response.put("message", session.statusMessage == null ? "" : session.statusMessage);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handlePendingList() {
        JSONArray sessionsArray = new JSONArray();
        for (SessionRecord session : sessions.values()) {
            try {
                JSONObject item = new JSONObject();
                item.put("sessionId", session.sessionId);
                item.put("senderDeviceId", session.senderDeviceId);
                item.put("senderDeviceName", session.senderDeviceName);
                item.put("createdAt", session.createdAt);
                item.put("updatedAt", session.updatedAt == null ? "" : session.updatedAt);
                item.put("committedAt", session.committedAt == null ? "" : session.committedAt);
                item.put("status", session.status.apiValue);
                item.put("message", session.statusMessage == null ? "" : session.statusMessage);
                item.put("summary", session.summaryJson());
                sessionsArray.put(item);
            } catch (JSONException ignored) {
                // ignore
            }
        }

        JSONObject response = new JSONObject();
        try {
            response.put("sessions", sessionsArray);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleApprove(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        CommitResult result = commitSession(session);
        JSONObject response = new JSONObject();
        try {
            response.put("sessionId", sessionId);
            response.put("action", "committed");
            response.put("status", "approved");
            response.put("acceptedFiles", result.acceptedFiles);
            response.put("skippedFiles", result.skippedFiles);
            response.put("committedAt", result.committedAt);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleReject(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        String message = body.optString("message", "接收端已拒绝此次写入").trim();
        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        session.status = SessionStatus.REJECTED;
        session.statusMessage = message;
        session.updatedAt = nowIso();

        JSONObject response = new JSONObject();
        try {
            response.put("sessionId", sessionId);
            response.put("action", "rejected");
            response.put("status", "rejected");
            response.put("message", message);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private HttpResponse handleCommit(HttpRequest request) {
        JSONObject body = request.jsonBody;
        String sessionId = body.optString("sessionId", "").trim();
        boolean confirm = body.optBoolean("confirm", false);
        SessionRecord session = requireSession(sessionId);
        if (session == null) {
            return jsonResponse(404, jsonMessage("会话不存在，请重新建立连接"));
        }

        if (!confirm) {
            session.status = SessionStatus.PENDING;
            session.updatedAt = nowIso();
            session.statusMessage = "已推送完成，等待接收端确认写入";
            JSONObject response = new JSONObject();
            try {
                response.put("sessionId", sessionId);
                response.put("acceptedFiles", 0);
                response.put("skippedFiles", 0);
                response.put("committedAt", "");
                response.put("action", "pending");
                response.put("status", "waiting_receiver_approval");
                response.put("message", session.statusMessage);
            } catch (JSONException ignored) {
                // ignore
            }
            return jsonResponse(200, response);
        }

        CommitResult result = commitSession(session);
        JSONObject response = new JSONObject();
        try {
            response.put("sessionId", sessionId);
            response.put("action", "committed");
            response.put("status", "approved");
            response.put("acceptedFiles", result.acceptedFiles);
            response.put("skippedFiles", result.skippedFiles);
            response.put("committedAt", result.committedAt);
        } catch (JSONException ignored) {
            // ignore
        }
        return jsonResponse(200, response);
    }

    private CommitResult commitSession(SessionRecord session) {
        List<JSONObject> files = session.manifestFiles();
        int acceptedFiles = 0;
        int skippedFiles = 0;

        for (JSONObject file : files) {
            String path = file.optString("path", "").trim();
            String hash = file.optString("hash", "").trim();
            if (path.isEmpty() || hash.isEmpty()) {
                skippedFiles += 1;
                continue;
            }

            SessionFileState state = session.fileState.get(fileKey(path, hash));
            if (state == null || state.uploadedChunks.isEmpty()) {
                skippedFiles += 1;
                continue;
            }

            byte[] merged = readMergedChunks(session.sessionId, hash, state.uploadedChunks);
            if (merged.length == 0) {
                skippedFiles += 1;
                continue;
            }

            writeBytes(blobPathByHash(hash), merged);
            writeBytes(currentPathFor(path), merged);
            state.committed = true;
            state.updatedAt = file.optString("updatedAt", "");
            acceptedFiles += 1;
        }

        session.status = SessionStatus.APPROVED;
        session.committedAt = nowIso();
        session.statusMessage = "接收端已确认并写入";
        session.updatedAt = nowIso();

        return new CommitResult(acceptedFiles, skippedFiles, session.committedAt);
    }

    private JSONObject buildDiscoverResponse() {
        JSONObject response = new JSONObject();
        try {
            response.put("deviceName", buildDeviceName());
            response.put("appVersion", APP_VERSION);
            response.put("now", nowIso());
        } catch (JSONException ignored) {
            // ignore
        }
        return response;
    }

    private JSONObject buildCurrentListingResponse() {
        JSONObject response = new JSONObject();
        JSONArray files = new JSONArray();
        File[] children = currentDir.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child == null || !child.isFile()) continue;
                JSONObject item = new JSONObject();
                try {
                    item.put("name", child.getName());
                    item.put("size", child.length());
                    item.put("updatedAt", isoFromMillis(child.lastModified()));
                } catch (JSONException ignored) {
                    // ignore
                }
                files.put(item);
            }
        }

        try {
            response.put("dir", currentDir.getAbsolutePath());
            response.put("files", files);
            response.put("payload", buildCurrentPayload());
        } catch (JSONException ignored) {
            // ignore
        }
        return response;
    }

    private JSONObject buildCurrentContentResponse() {
        JSONObject response = new JSONObject();
        try {
            response.put("updatedAt", nowIso());
            response.put("payload", buildCurrentPayload());
        } catch (JSONException ignored) {
            // ignore
        }
        return response;
    }

    private JSONObject buildCurrentPayload() {
        JSONObject payload = new JSONObject();
        try {
            payload.put("goods", readJsonFile("goods.json"));
            payload.put("recharge", readJsonFile("recharge.json"));
            payload.put("events", readJsonFile("events.json"));
            payload.put("images", readJsonFile("lan-images.json"));
        } catch (JSONException ignored) {
            // ignore
        }
        return payload;
    }

    private JSONObject readJsonFile(String fileName) {
        File target = new File(currentDir, fileName);
        if (!target.exists()) {
            return new JSONObject();
        }

        try {
            String raw = readString(target);
            if (raw == null || raw.trim().isEmpty()) {
                return new JSONObject();
            }
            return new JSONObject(raw);
        } catch (Exception error) {
            return new JSONObject();
        }
    }

    private byte[] readMergedChunks(String sessionId, String hash, Collection<Integer> chunkIndexes) {
        List<Integer> ordered = new ArrayList<>(new HashSet<>(chunkIndexes));
        ordered.sort(Integer::compareTo);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (Integer chunkIndex : ordered) {
            File chunkFile = new File(chunkDir(sessionId, hash), chunkIndex + ".part");
            if (!chunkFile.exists()) continue;
            try (FileInputStream input = new FileInputStream(chunkFile)) {
                copy(input, output);
            } catch (IOException ignored) {
                // ignore
            }
        }
        return output.toByteArray();
    }

    private SessionRecord requireSession(String sessionId) {
        if (sessionId == null || sessionId.trim().isEmpty()) {
            return null;
        }
        return sessions.get(sessionId.trim());
    }

    private HttpRequest readRequest(InputStream inputStream) throws IOException, JSONException {
        String requestLine = readLine(inputStream);
        if (requestLine == null || requestLine.trim().isEmpty()) {
            return null;
        }

        String[] requestParts = requestLine.split(" ", 3);
        if (requestParts.length < 2) {
            return null;
        }

        String method = requestParts[0].trim().toUpperCase(Locale.US);
        String path = requestParts[1].trim();
        Map<String, String> headers = new LinkedHashMap<>();
        String line;
        while ((line = readLine(inputStream)) != null) {
            if (line.isEmpty()) {
                break;
            }
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            String name = line.substring(0, colon).trim().toLowerCase(Locale.US);
            String value = line.substring(colon + 1).trim();
            headers.put(name, value);
        }

        int contentLength = 0;
        try {
            contentLength = Integer.parseInt(headers.getOrDefault("content-length", "0"));
        } catch (NumberFormatException ignored) {
            contentLength = 0;
        }

        byte[] bodyBytes = readBody(inputStream, contentLength);
        String body = new String(bodyBytes, StandardCharsets.UTF_8);
        JSONObject jsonBody;
        if (body.trim().isEmpty()) {
            jsonBody = new JSONObject();
        } else {
            jsonBody = new JSONObject(body);
        }
        return new HttpRequest(method, path, headers, body, jsonBody);
    }

    private byte[] readBody(InputStream inputStream, int contentLength) throws IOException {
        if (contentLength <= 0) {
            return new byte[0];
        }
        byte[] buffer = new byte[contentLength];
        int offset = 0;
        while (offset < contentLength) {
            int read = inputStream.read(buffer, offset, contentLength - offset);
            if (read < 0) {
                break;
            }
            offset += read;
        }
        if (offset == contentLength) {
            return buffer;
        }
        return Arrays.copyOf(buffer, offset);
    }

    private String readLine(InputStream inputStream) throws IOException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        int previous = -1;
        int current;
        while ((current = inputStream.read()) != -1) {
            if (previous == '\r' && current == '\n') {
                break;
            }
            if (current != '\r') {
                outputStream.write(current);
            }
            previous = current;
        }
        if (current == -1 && outputStream.size() == 0) {
            return null;
        }
        return outputStream.toString(StandardCharsets.UTF_8.name());
    }

    private void writeResponse(OutputStream outputStream, int statusCode, JSONObject body) throws IOException {
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        String statusText = statusText(statusCode);
        String headers = "HTTP/1.1 " + statusCode + " " + statusText + "\r\n"
            + "Content-Type: application/json; charset=utf-8\r\n"
            + "Content-Length: " + data.length + "\r\n"
            + "Connection: close\r\n\r\n";
        outputStream.write(headers.getBytes(StandardCharsets.UTF_8));
        outputStream.write(data);
        outputStream.flush();
    }

    private HttpResponse jsonResponse(int statusCode, JSONObject body) {
        return new HttpResponse(statusCode, body);
    }

    private JSONObject jsonMessage(String message) {
        JSONObject result = new JSONObject();
        try {
            result.put("message", message);
        } catch (JSONException ignored) {
            // ignore
        }
        return result;
    }

    private JSONObject jsonError(String message) {
        JSONObject result = new JSONObject();
        try {
            result.put("message", message == null ? "服务器错误" : message);
        } catch (JSONException ignored) {
            // ignore
        }
        return result;
    }

    private String statusText(int statusCode) {
        switch (statusCode) {
            case 200:
                return "OK";
            case 400:
                return "Bad Request";
            case 404:
                return "Not Found";
            case 500:
            default:
                return "Internal Server Error";
        }
    }

    private JSONObject buildReceiverInfo() {
        JSONObject receiver = new JSONObject();
        try {
            receiver.put("host", "0.0.0.0");
            receiver.put("port", getPort());
            receiver.put("baseUrl", getBaseUrl());
            receiver.put("deviceName", buildDeviceName());
        } catch (JSONException ignored) {
            // ignore
        }
        return receiver;
    }

    private String buildDeviceName() {
        String label = String.valueOf(context.getApplicationInfo().loadLabel(context.getPackageManager()));
        if (label == null || label.trim().isEmpty()) {
            label = "Goods Sync";
        }
        return label.trim() + " · Android";
    }

    private String createSessionId() {
        return "lan_" + Long.toString(System.currentTimeMillis(), 36) + "_" + Integer.toHexString((int) (Math.random() * Integer.MAX_VALUE));
    }

    private static String nowIso() {
        return isoFromMillis(System.currentTimeMillis());
    }

    private static String isoFromMillis(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private String fileKey(String path, String hash) {
        return path + "#" + hash;
    }

    private File chunkDir(String sessionId, String hash) {
        File dir = new File(chunksDir, sanitizeName(sessionId) + "_" + sha256(hash));
        ensureDirectory(dir);
        return dir;
    }

    private String sanitizeName(String value) {
        String fallback = String.valueOf(value == null ? "unknown" : value).trim();
        if (fallback.isEmpty()) {
            fallback = "unknown";
        }
        String normalized = fallback.replaceAll("[^A-Za-z0-9._-]", "_");
        if (normalized.length() > 60) {
            normalized = normalized.substring(0, 60);
        }
        return normalized.isEmpty() ? "unknown" : normalized;
    }

    private File blobPathByHash(String hash) {
        return new File(blobsDir, sha256(hash) + ".json");
    }

    private File currentPathFor(String filePath) {
        String normalized = filePath == null ? "" : filePath.replace('\\', '/');
        String safeName = normalized.replace("/", "_").replaceAll("[^A-Za-z0-9._-]", "_");
        if (safeName.isEmpty()) {
            safeName = "unknown.json";
        }
        return new File(currentDir, safeName);
    }

    private void ensureDirectory(File dir) {
        if (dir != null && !dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
    }

    private byte[] decodeBase64(String raw) {
        try {
            return android.util.Base64.decode(raw == null ? "" : raw, android.util.Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            return new byte[0];
        }
    }

    private String readString(File file) throws IOException {
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            copy(input, output);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void writeBytes(File file, byte[] bytes) {
        ensureDirectory(file.getParentFile());
        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(bytes);
            outputStream.flush();
        } catch (IOException ignored) {
            // ignore
        }
    }

    private void writeSessionDebug(SessionRecord session) {
        // Intentionally kept minimal; session data is in-memory for MVP.
    }

    private String sha256(String raw) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(String.valueOf(raw == null ? "" : raw).getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte item : hash) {
                builder.append(String.format(Locale.US, "%02x", item));
            }
            return builder.toString();
        } catch (Exception error) {
            return Integer.toHexString(String.valueOf(raw).hashCode());
        }
    }

    private void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
    }

    private static final class HttpRequest {
        final String method;
        final String path;
        final Map<String, String> headers;
        final String body;
        final JSONObject jsonBody;

        HttpRequest(String method, String path, Map<String, String> headers, String body, JSONObject jsonBody) {
            this.method = method;
            this.path = path;
            this.headers = headers;
            this.body = body;
            this.jsonBody = jsonBody;
        }
    }

    private static final class HttpResponse {
        final int statusCode;
        final JSONObject body;

        HttpResponse(int statusCode, JSONObject body) {
            this.statusCode = statusCode;
            this.body = body;
        }
    }

    private static final class CommitResult {
        final int acceptedFiles;
        final int skippedFiles;
        final String committedAt;

        CommitResult(int acceptedFiles, int skippedFiles, String committedAt) {
            this.acceptedFiles = acceptedFiles;
            this.skippedFiles = skippedFiles;
            this.committedAt = committedAt;
        }
    }

    private enum SessionStatus {
        CREATED("created"),
        MANIFESTED("manifested"),
        PENDING("waiting_receiver_approval"),
        APPROVED("approved"),
        REJECTED("rejected");

        final String apiValue;

        SessionStatus(String apiValue) {
            this.apiValue = apiValue;
        }
    }

    private static final class SessionFileState {
        final String path;
        final String hash;
        int totalChunks;
        boolean committed;
        String updatedAt = "";
        final HashSet<Integer> uploadedChunks = new HashSet<>();

        SessionFileState(String path, String hash, int totalChunks) {
            this.path = path;
            this.hash = hash;
            this.totalChunks = totalChunks;
        }
    }

    private static final class SessionCheckpoint {
        final List<String> uploadedFiles = new ArrayList<>();
        final Map<String, List<Integer>> uploadedChunks = new HashMap<>();
    }

    private static final class SessionRecord {
        final String sessionId;
        final String senderDeviceId;
        final String senderDeviceName;
        final String createdAt;
        final String resumeToken;
        final SessionCheckpoint checkpoint = new SessionCheckpoint();
        final Map<String, SessionFileState> fileState = new ConcurrentHashMap<>();
        JSONObject manifest;
        SessionStatus status = SessionStatus.CREATED;
        String updatedAt = "";
        String committedAt = "";
        String statusMessage = "";

        SessionRecord(String sessionId, String senderDeviceId, String senderDeviceName) {
            this.sessionId = sessionId;
            this.senderDeviceId = senderDeviceId == null ? "" : senderDeviceId;
            this.senderDeviceName = senderDeviceName == null || senderDeviceName.trim().isEmpty() ? "未知设备" : senderDeviceName.trim();
            this.createdAt = isoFromMillis(System.currentTimeMillis());
            this.resumeToken = Long.toHexString(Double.doubleToLongBits(Math.random())) + Long.toHexString(System.nanoTime());
        }

        List<JSONObject> manifestFiles() {
            List<JSONObject> files = new ArrayList<>();
            if (manifest == null) {
                return files;
            }
            JSONArray array = manifest.optJSONArray("files");
            if (array == null) {
                return files;
            }
            for (int index = 0; index < array.length(); index += 1) {
                JSONObject item = array.optJSONObject(index);
                if (item != null) {
                    files.add(item);
                }
            }
            return files;
        }

        JSONObject checkpointJson() {
            JSONObject result = new JSONObject();
            try {
                JSONArray uploadedFiles = new JSONArray();
                for (String item : checkpoint.uploadedFiles) {
                    uploadedFiles.put(item);
                }
                JSONObject uploadedChunks = new JSONObject();
                for (Map.Entry<String, List<Integer>> entry : checkpoint.uploadedChunks.entrySet()) {
                    JSONArray chunks = new JSONArray();
                    for (Integer value : entry.getValue()) {
                        chunks.put(value);
                    }
                    uploadedChunks.put(entry.getKey(), chunks);
                }
                result.put("uploadedFiles", uploadedFiles);
                result.put("uploadedChunks", uploadedChunks);
            } catch (JSONException ignored) {
                // ignore
            }
            return result;
        }

        JSONObject summaryJson() {
            JSONObject result = new JSONObject();
            try {
                int goodsCount = 0;
                int trashCount = 0;
                int rechargeCount = 0;
                int eventCount = 0;
                if (manifest != null) {
                    JSONObject summary = manifest.optJSONObject("summary");
                    if (summary != null) {
                        goodsCount = summary.optInt("goodsCount", 0);
                        trashCount = summary.optInt("trashCount", 0);
                        rechargeCount = summary.optInt("rechargeCount", 0);
                        eventCount = summary.optInt("eventCount", 0);
                    }
                }
                result.put("goodsCount", goodsCount);
                result.put("trashCount", trashCount);
                result.put("rechargeCount", rechargeCount);
                result.put("eventCount", eventCount);
            } catch (JSONException ignored) {
                // ignore
            }
            return result;
        }
    }
}
