package com.goodsapp.collector;

import org.json.JSONObject;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class MihoyoSessionImportResultStore {
    private static final Map<String, JSONObject> RESULTS = new ConcurrentHashMap<>();

    private MihoyoSessionImportResultStore() {}

    public static String put(JSONObject payload) {
        String key = UUID.randomUUID().toString();
        RESULTS.put(key, payload);
        return key;
    }

    public static JSONObject take(String key) {
        if (key == null || key.trim().isEmpty()) {
            return null;
        }
        return RESULTS.remove(key);
    }
}
