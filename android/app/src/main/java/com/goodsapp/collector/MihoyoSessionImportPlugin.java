package com.goodsapp.collector;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "MihoyoSessionImport")
public class MihoyoSessionImportPlugin extends Plugin {
    private static final String PREFS_NAME = "mihoyo_native_session";
    private static final String KEY_COOKIE = "cookie";

    private static final String API_BASE = "https://api-mall.mihoyogift.com";
    private static final String API_ORDER_LIST = API_BASE + "/common/homeishop/v1/order/order_list";
    private static final String API_CART_LIST = API_BASE + "/common/homeishop/v2/shop_car/get_shop_car_list";
    private static final String WEB_REFERER = "https://mihoyogift.com/";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void importOrders(PluginCall call) {
        tryWithSavedCookie(call, MihoyoSessionImportActivity.MODE_ORDERS);
    }

    @PluginMethod
    public void importCart(PluginCall call) {
        tryWithSavedCookie(call, MihoyoSessionImportActivity.MODE_CART);
    }

    private void tryWithSavedCookie(PluginCall call, String mode) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedCookie = prefs.getString(KEY_COOKIE, "").trim();

        if (savedCookie.isEmpty()) {
            launchImport(call, mode);
            return;
        }

        boolean isCart = MihoyoSessionImportActivity.MODE_CART.equals(mode);

        executor.execute(() -> {
            try {
                JSONObject payload = isCart
                    ? fetchCartWithCookie(savedCookie)
                    : fetchOrdersWithCookie(savedCookie);
                JSObject response = buildResponse(payload, mode);
                call.resolve(response);
            } catch (Exception error) {
                String message = error.getMessage() != null ? error.getMessage() : "";
                if (MihoyoSessionImportActivity.isCookieExpiredError(message)) {
                    // Cookie expired — clear it, then launch WebView for re-login
                    clearSavedCookie();
                    new Handler(Looper.getMainLooper()).post(() -> launchImport(call, mode));
                } else {
                    call.reject(message.isEmpty() ? "获取数据失败" : message);
                }
            }
        });
    }

    private void launchImport(PluginCall call, String mode) {
        Intent intent = new Intent(getContext(), MihoyoSessionImportActivity.class);
        intent.putExtra(MihoyoSessionImportActivity.EXTRA_MODE, mode);
        startActivityForResult(call, intent, "handleImportResult");
    }

    @ActivityCallback
    private void handleImportResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result == null) {
            call.reject("未收到登录导入结果");
            return;
        }

        Intent data = result.getData();
        String errorMessage = data != null ? data.getStringExtra(MihoyoSessionImportActivity.EXTRA_ERROR_MESSAGE) : "";
        String resultKey = data != null ? data.getStringExtra(MihoyoSessionImportActivity.EXTRA_RESULT_KEY) : "";

        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject((errorMessage == null || errorMessage.trim().isEmpty()) ? "已取消导入" : errorMessage.trim());
            return;
        }

        JSONObject payload = MihoyoSessionImportResultStore.take(resultKey);
        if (payload == null) {
            call.reject("导入结果为空");
            return;
        }

        try {
            JSObject response = buildResponse(payload, payload.optString("mode", ""));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("解析导入结果失败: " + error.getMessage());
        }
    }

    // ── Saved-cookie API helpers ──────────────────────────────────────

    private JSONObject fetchOrdersWithCookie(String cookie) throws Exception {
        int limit = 20;
        JSONObject first = requestJson(API_ORDER_LIST + "?limit=" + limit + "&page=1", cookie);
        JSONObject firstData = ensureSuccess(first);
        int total = firstData.optInt("count", 0);
        int totalPages = Math.min(Math.max((int) Math.ceil(total / (double) limit), 1), 10);
        JSONArray list = copyJsonArray(firstData.optJSONArray("list"));

        for (int page = 2; page <= totalPages; page += 1) {
            JSONObject pageJson = requestJson(API_ORDER_LIST + "?limit=" + limit + "&page=" + page, cookie);
            JSONObject pageData = ensureSuccess(pageJson);
            JSONArray pageList = pageData.optJSONArray("list");
            if (pageList == null) continue;
            for (int index = 0; index < pageList.length(); index += 1) {
                list.put(pageList.opt(index));
            }
        }

        JSONObject payload = new JSONObject();
        payload.put("mode", MihoyoSessionImportActivity.MODE_ORDERS);
        payload.put("list", list);
        payload.put("total", total);
        payload.put("capped", total > list.length());
        return payload;
    }

    private JSONObject fetchCartWithCookie(String cookie) throws Exception {
        JSONObject json = requestJson(API_CART_LIST, cookie);
        JSONObject data = ensureSuccess(json);

        JSONObject payload = new JSONObject();
        JSONArray list = copyJsonArray(data.optJSONArray("list"));
        payload.put("mode", MihoyoSessionImportActivity.MODE_CART);
        payload.put("list", list);
        payload.put("total", list.length());
        payload.put("capped", false);
        return payload;
    }

    private JSONObject requestJson(String url, String cookie) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            connection.setRequestProperty("Referer", WEB_REFERER);
            connection.setRequestProperty("Origin", WEB_REFERER.substring(0, WEB_REFERER.length() - 1));
            connection.setRequestProperty("x-rpc-language", "zh-cn");
            connection.setRequestProperty("x-rpc-client_type", "5");
            connection.setRequestProperty("User-Agent", "GoodsAppMihoyoImport/1.1");
            connection.setRequestProperty("Cookie", cookie);

            int status = connection.getResponseCode();
            String body = readResponseBody(status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream());
            if (status < 200 || status >= 300) {
                throw new IllegalStateException(extractHttpError(status, body));
            }

            return new JSONObject(body);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private JSONObject ensureSuccess(JSONObject json) throws Exception {
        int retcode = json.optInt("retcode", -1);
        if (retcode != 0) {
            String message = json.optString("message", "").trim();
            throw new IllegalStateException(message.isEmpty() ? "接口错误 " + retcode : message);
        }
        JSONObject data = json.optJSONObject("data");
        return data != null ? data : new JSONObject();
    }

    private String readResponseBody(InputStream stream) throws Exception {
        if (stream == null) return "";

        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private String extractHttpError(int status, String body) {
        try {
            JSONObject json = new JSONObject(body);
            String message = json.optString("message", "").trim();
            if (!message.isEmpty()) return message;
        } catch (Exception ignored) {}

        return "请求失败（" + status + "）";
    }

    private JSONArray copyJsonArray(JSONArray source) {
        JSONArray target = new JSONArray();
        if (source == null) return target;
        for (int index = 0; index < source.length(); index += 1) {
            target.put(source.opt(index));
        }
        return target;
    }

    private void clearSavedCookie() {
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_COOKIE)
            .apply();
    }

    private JSObject buildResponse(JSONObject payload, String mode) throws JSONException {
        JSObject response = new JSObject();
        response.put("mode", mode);
        response.put("capped", payload.optBoolean("capped", false));
        response.put("total", payload.optInt("total", 0));
        response.put("list", convertArray(payload.optJSONArray("list")));
        return response;
    }

    private JSArray convertArray(JSONArray array) {
        JSArray items = new JSArray();
        if (array == null || array.length() == 0) return items;

        for (int index = 0; index < array.length(); index += 1) {
            Object value = array.opt(index);
            if (value instanceof JSONObject) {
                try {
                    items.put(JSObject.fromJSONObject((JSONObject) value));
                } catch (JSONException error) {
                    JSObject wrapped = new JSObject();
                    wrapped.put("raw", value.toString());
                    items.put(wrapped);
                }
            } else {
                JSObject wrapped = new JSObject();
                wrapped.put("value", value);
                items.put(wrapped);
            }
        }
        return items;
    }
}
