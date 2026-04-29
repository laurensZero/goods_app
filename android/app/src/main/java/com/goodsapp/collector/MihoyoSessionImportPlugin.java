package com.goodsapp.collector;

import android.app.Activity;
import android.content.Intent;

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

@CapacitorPlugin(name = "MihoyoSessionImport")
public class MihoyoSessionImportPlugin extends Plugin {
    @PluginMethod
    public void importOrders(PluginCall call) {
        launchImport(call, MihoyoSessionImportActivity.MODE_ORDERS);
    }

    @PluginMethod
    public void importCart(PluginCall call) {
        launchImport(call, MihoyoSessionImportActivity.MODE_CART);
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
            JSObject response = new JSObject();
            response.put("mode", payload.optString("mode", ""));
            response.put("capped", payload.optBoolean("capped", false));
            response.put("total", payload.optInt("total", 0));
            response.put("list", convertArray(payload.optJSONArray("list")));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("解析导入结果失败: " + error.getMessage());
        }
    }

    private JSArray convertArray(JSONArray array) {
        JSArray items = new JSArray();
        if (array == null || array.length() == 0) {
            return items;
        }

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
