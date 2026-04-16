package com.goodsapp.collector;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "LocalSyncBridge")
public class LocalSyncBridgePlugin extends Plugin {
    private static final int DEFAULT_PORT = 51823;

    private LocalSyncReceiverServer receiverServer;
    private LocalSyncDiscoveryController discoveryController;

    @Override
    public void load() {
        Context context = getContext();
        receiverServer = new LocalSyncReceiverServer(context);
        discoveryController = new LocalSyncDiscoveryController(context);
    }

    @PluginMethod
    public void startReceiver(PluginCall call) {
        final int requestedPort = call.getInt("port", DEFAULT_PORT);
        new Thread(() -> {
            try {
                receiverServer.start(requestedPort);
                String serviceName = receiverServer.getStatusJson().optString("deviceName", "Goods Sync");
                discoveryController.startAdvertising(receiverServer.getPort(), serviceName);

                JSObject result = new JSObject();
                result.put("running", true);
                result.put("port", receiverServer.getPort());
                result.put("baseUrl", receiverServer.getBaseUrl());
                result.put("deviceName", discoveryController.getAdvertisedDeviceName());
                call.resolve(result);
            } catch (IOException error) {
                call.reject(error.getMessage() == null ? "启动局域网接收服务失败" : error.getMessage());
            }
        }, "local-sync-start").start();
    }

    @PluginMethod
    public void stopReceiver(PluginCall call) {
        new Thread(() -> {
            discoveryController.stopAdvertising();
            receiverServer.stop();

            JSObject result = new JSObject();
            result.put("running", false);
            call.resolve(result);
        }, "local-sync-stop").start();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receiver", receiverServer.getStatusJson());
        result.put("advertising", discoveryController.isAdvertising());
        result.put("discovering", discoveryController.isDiscovering());
        call.resolve(result);
    }

    @PluginMethod
    public void discoverPeers(PluginCall call) {
        final int timeoutMs = call.getInt("timeoutMs", 4500);
        new Thread(() -> {
            List<Map<String, Object>> peers = discoveryController.discoverPeers(timeoutMs);
            JSObject result = new JSObject();
            result.put("peers", new JSONArray(peers));
            call.resolve(result);
        }, "local-sync-discover").start();
    }

    @Override
    protected void handleOnDestroy() {
        discoveryController.stopAdvertising();
        discoveryController.stopDiscovery();
        receiverServer.stop();
        super.handleOnDestroy();
    }
}
