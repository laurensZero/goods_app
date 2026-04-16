package com.goodsapp.collector;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

final class LocalSyncDiscoveryController {
    private static final String SERVICE_TYPE = "_goodsapp-sync._tcp.";
    private static final long DEFAULT_DISCOVERY_TIMEOUT_MS = 4500L;

    private final Context context;
    private final NsdManager nsdManager;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();

    private NsdManager.RegistrationListener registrationListener;
    private NsdManager.DiscoveryListener discoveryListener;
    private final Map<String, ResolvedPeer> resolvedPeers = Collections.synchronizedMap(new HashMap<String, ResolvedPeer>());
    private String advertisedServiceName = "";
    private int advertisedPort = 0;
    private String advertisedDeviceName = "Goods Sync";

    LocalSyncDiscoveryController(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.nsdManager = (NsdManager) this.context.getSystemService(Context.NSD_SERVICE);
    }

    boolean isAdvertising() {
        synchronized (lock) {
            return registrationListener != null;
        }
    }

    boolean isDiscovering() {
        synchronized (lock) {
            return discoveryListener != null;
        }
    }

    String getAdvertisedDeviceName() {
        synchronized (lock) {
            return advertisedDeviceName;
        }
    }

    int getAdvertisedPort() {
        synchronized (lock) {
            return advertisedPort;
        }
    }

    void startAdvertising(int port, String deviceName) {
        if (nsdManager == null) {
            return;
        }

        stopAdvertising();

        final String safeName = sanitizeServiceName(deviceName);
        final NsdServiceInfo serviceInfo = new NsdServiceInfo();
        serviceInfo.setServiceName(safeName);
        serviceInfo.setServiceType(SERVICE_TYPE);
        serviceInfo.setPort(port);

        final NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo registeredServiceInfo) {
                synchronized (lock) {
                    advertisedServiceName = registeredServiceInfo.getServiceName();
                    advertisedPort = port;
                    advertisedDeviceName = safeName;
                }
            }

            @Override
            public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                synchronized (lock) {
                    registrationListener = null;
                }
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo serviceInfo) {
                synchronized (lock) {
                    registrationListener = null;
                }
            }

            @Override
            public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                synchronized (lock) {
                    registrationListener = null;
                }
            }
        };

        synchronized (lock) {
            registrationListener = listener;
            advertisedPort = port;
            advertisedDeviceName = safeName;
        }

        try {
            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (Exception error) {
            synchronized (lock) {
                registrationListener = null;
            }
        }
    }

    void stopAdvertising() {
        if (nsdManager == null) {
            return;
        }

        final NsdManager.RegistrationListener listener;
        synchronized (lock) {
            listener = registrationListener;
            registrationListener = null;
        }

        if (listener == null) {
            return;
        }

        try {
            nsdManager.unregisterService(listener);
        } catch (Exception ignored) {
            // ignore
        }
    }

    List<Map<String, Object>> discoverPeers(long timeoutMs) {
        if (nsdManager == null) {
            return Collections.emptyList();
        }

        final long deadlineMs = Math.max(1500L, timeoutMs > 0 ? timeoutMs : DEFAULT_DISCOVERY_TIMEOUT_MS);
        final CountDownLatch latch = new CountDownLatch(1);
        final List<Map<String, Object>> results = Collections.synchronizedList(new ArrayList<Map<String, Object>>());
        final NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String serviceType) {
                // no-op
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (serviceInfo == null) {
                    return;
                }
                final String serviceName = String.valueOf(serviceInfo.getServiceName() == null ? "" : serviceInfo.getServiceName());
                if (!serviceName.isEmpty() && serviceName.equals(advertisedServiceName)) {
                    return;
                }

                nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        // ignore
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo resolvedInfo) {
                        InetAddress host = resolvedInfo.getHost();
                        if (host == null) {
                            return;
                        }
                        String hostAddress = host.getHostAddress();
                        if (hostAddress == null || hostAddress.trim().isEmpty()) {
                            return;
                        }

                        int port = resolvedInfo.getPort();
                        ResolvedPeer peer = new ResolvedPeer(
                            hostAddress.trim(),
                            port,
                            buildBaseUrl(hostAddress.trim(), port),
                            String.valueOf(resolvedInfo.getServiceName() == null ? "" : resolvedInfo.getServiceName())
                        );
                        synchronized (resolvedPeers) {
                            resolvedPeers.put(peer.baseUrl, peer);
                            results.clear();
                            results.addAll(snapshotPeers());
                        }
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                // ignore
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                latch.countDown();
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                latch.countDown();
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                latch.countDown();
            }
        };

        synchronized (lock) {
            discoveryListener = listener;
        }

        try {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (Exception error) {
            synchronized (lock) {
                discoveryListener = null;
            }
            return Collections.emptyList();
        }

        try {
            latch.await(deadlineMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        } finally {
            stopDiscovery();
        }

        return snapshotPeers();
    }

    void stopDiscovery() {
        if (nsdManager == null) {
            return;
        }

        final NsdManager.DiscoveryListener listener;
        synchronized (lock) {
            listener = discoveryListener;
            discoveryListener = null;
        }

        if (listener == null) {
            return;
        }

        try {
            nsdManager.stopServiceDiscovery(listener);
        } catch (Exception ignored) {
            // ignore
        }
    }

    List<Map<String, Object>> snapshotPeers() {
        synchronized (resolvedPeers) {
            List<Map<String, Object>> peers = new ArrayList<>();
            for (ResolvedPeer peer : resolvedPeers.values()) {
                Map<String, Object> item = new HashMap<>();
                item.put("host", peer.host);
                item.put("port", peer.port);
                item.put("baseUrl", peer.baseUrl);
                item.put("deviceName", peer.deviceName);
                peers.add(item);
            }
            return peers;
        }
    }

    private String sanitizeServiceName(String value) {
        String fallback = String.valueOf(value == null ? "Goods Sync" : value).trim();
        if (fallback.isEmpty()) {
            fallback = "Goods Sync";
        }
        String normalized = fallback.replaceAll("[^\\p{L}\\p{N}._-]", "");
        if (normalized.length() > 40) {
            normalized = normalized.substring(0, 40);
        }
        if (normalized.isEmpty()) {
            normalized = "Goods Sync";
        }
        return normalized;
    }

    private String buildBaseUrl(String host, int port) {
        return String.format(Locale.US, "http://%s:%d", host, port);
    }

    private static final class ResolvedPeer {
        final String host;
        final int port;
        final String baseUrl;
        final String deviceName;

        ResolvedPeer(String host, int port, String baseUrl, String deviceName) {
            this.host = host;
            this.port = port;
            this.baseUrl = baseUrl;
            this.deviceName = deviceName;
        }
    }
}
