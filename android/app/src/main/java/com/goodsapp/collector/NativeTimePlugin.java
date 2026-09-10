package com.goodsapp.collector;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 本地 UDP SNTP 授时（对齐 biliTickerBuy 的 NTP 策略）。
 * 默认阿里云/腾讯云 NTP，RTT 通常 10–50ms，远优于经 Supabase Edge 的 HTTP 往返。
 * 返回 offsetMs = serverTime − localMidpoint，与 JS 侧 edge 约定一致。
 */
@CapacitorPlugin(name = "NativeTime")
public class NativeTimePlugin extends Plugin {
    private static final String TAG = "NativeTime";
    private static final int NTP_PORT = 123;
    private static final long NTP_EPOCH_OFFSET_MS = 2208988800000L;
    private static final String[] DEFAULT_SERVERS = {
            "ntp.aliyun.com",
            "ntp.tencent.com",
            "cn.ntp.org.cn",
            "time.cloudflare.com",
    };

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void query(PluginCall call) {
        List<String> servers = parseServers(call.getArray("servers"));
        int attemptsPerServer = Math.max(1, Math.min(5, call.getInt("attemptsPerServer", 1)));
        long timeoutMs = Math.max(400L, Math.min(8000L, call.getLong("timeoutMs", 2000L)));
        long primaryDelayThresholdMs = Math.max(0L, call.getLong("primaryDelayThresholdMs", 120L));

        executor.execute(() -> {
            try {
                Sample best = queryNtp(servers, attemptsPerServer, timeoutMs, primaryDelayThresholdMs);
                if (best == null) {
                    call.reject("NTP query failed");
                    return;
                }
                JSObject result = new JSObject();
                result.put("offsetMs", best.offsetMs);
                result.put("delayMs", best.delayMs);
                result.put("serverTime", best.serverTimeMs);
                result.put("localMidpointMs", best.localMidpointMs);
                result.put("source", best.source);
                call.resolve(result);
            } catch (Exception error) {
                Log.w(TAG, "NTP query error", error);
                call.reject("NTP query error: " + error.getMessage(), error);
            }
        });
    }

    private static List<String> parseServers(JSArray arr) {
        List<String> servers = new ArrayList<>();
        try {
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    String s = arr.getString(i);
                    if (s != null && !s.trim().isEmpty()) {
                        servers.add(s.trim());
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through to defaults
        }
        if (servers.isEmpty()) {
            for (String s : DEFAULT_SERVERS) {
                servers.add(s);
            }
        }
        return servers;
    }

    private Sample queryNtp(List<String> servers, int attemptsPerServer, long timeoutMs, long primaryDelayThresholdMs) {
        List<Sample> samples = new ArrayList<>();
        long deadline = System.currentTimeMillis() + timeoutMs;

        for (int serverIndex = 0; serverIndex < servers.size(); serverIndex++) {
            String server = servers.get(serverIndex);
            for (int attempt = 0; attempt < attemptsPerServer; attempt++) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0 && !samples.isEmpty()) {
                    break;
                }
                long perQueryTimeout = Math.max(250L, Math.min(1200L, remaining > 0 ? remaining : 1200L));
                Sample sample = queryOnce(server, perQueryTimeout);
                if (sample != null) {
                    samples.add(sample);
                    // 首源已足够快：对齐 biliTickerBuy，不再打扰备份
                    if (serverIndex == 0 && sample.delayMs <= primaryDelayThresholdMs) {
                        return sample;
                    }
                }
            }
            if (System.currentTimeMillis() >= deadline && !samples.isEmpty()) {
                break;
            }
        }

        if (samples.isEmpty()) {
            return null;
        }

        samples.sort(Comparator.comparingDouble(s -> s.delayMs));
        int keep = Math.max(1, Math.min(3, samples.size()));
        List<Sample> lowDelay = samples.subList(0, keep);
        double[] offsets = new double[lowDelay.size()];
        for (int i = 0; i < lowDelay.size(); i++) {
            offsets[i] = lowDelay.get(i).offsetMs;
        }
        java.util.Arrays.sort(offsets);
        double median;
        int mid = offsets.length / 2;
        if (offsets.length % 2 == 1) {
            median = offsets[mid];
        } else {
            median = (offsets[mid - 1] + offsets[mid]) / 2.0;
        }

        Sample best = lowDelay.get(0);
        for (Sample s : lowDelay) {
            if (s.delayMs < best.delayMs) {
                best = s;
            }
        }
        return new Sample(best.source, median, best.delayMs, best.serverTimeMs, best.localMidpointMs);
    }

    private Sample queryOnce(String host, long timeoutMs) {
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setSoTimeout((int) timeoutMs);
            InetAddress address = InetAddress.getByName(host);

            byte[] request = buildRequest();
            long t0 = System.currentTimeMillis();
            socket.send(new DatagramPacket(request, request.length, address, NTP_PORT));

            byte[] buf = new byte[48];
            DatagramPacket response = new DatagramPacket(buf, buf.length);
            socket.receive(response);
            long t3 = System.currentTimeMillis();

            long t1 = readNtpTimestampMs(buf, 32);
            long t2 = readNtpTimestampMs(buf, 40);
            if (t1 <= 0 || t2 <= 0) {
                return null;
            }

            // SNTP 标准：offset = ((t1−t0)+(t2−t3))/2；delay = (t3−t0)−(t2−t1)
            long offset = ((t1 - t0) + (t2 - t3)) / 2;
            long delay = Math.max(0L, (t3 - t0) - (t2 - t1));
            long localMidpoint = (t0 + t3) / 2;
            long serverTimeMs = localMidpoint + offset;
            // offsetMs = server − localMidpoint（与 edge 约定一致）
            return new Sample(host, offset, delay, serverTimeMs, localMidpoint);
        } catch (Exception error) {
            Log.d(TAG, "NTP fail " + host + ": " + error.getMessage());
            return null;
        } finally {
            if (socket != null) {
                socket.close();
            }
        }
    }

    private static byte[] buildRequest() {
        byte[] packet = new byte[48];
        // LI=0, VN=4, Mode=3 (client)
        packet[0] = 0x23;
        // Stratum 0, poll 0, precision 0 — 由后续字段决定，无需预填
        // Transmit Timestamp @40：只填 Unix 时间即可，服务器会覆盖
        long nowMs = System.currentTimeMillis();
        long ntpSec = (nowMs / 1000L) + (NTP_EPOCH_OFFSET_MS / 1000L);
        long ntpFrac = ((nowMs % 1000L) * 0x100000000L) / 1000L;
        writeNtpTimestamp(packet, 40, ntpSec, ntpFrac);
        return packet;
    }

    private static long readNtpTimestampMs(byte[] buf, int offset) {
        long seconds = ((long) (buf[offset] & 0xFF) << 24)
                | ((long) (buf[offset + 1] & 0xFF) << 16)
                | ((long) (buf[offset + 2] & 0xFF) << 8)
                | (buf[offset + 3] & 0xFF);
        long fraction = ((long) (buf[offset + 4] & 0xFF) << 24)
                | ((long) (buf[offset + 5] & 0xFF) << 16)
                | ((long) (buf[offset + 6] & 0xFF) << 8)
                | (buf[offset + 7] & 0xFF);
        if (seconds == 0) {
            return 0;
        }
        long unixSec = seconds - (NTP_EPOCH_OFFSET_MS / 1000L);
        long ms = (unixSec * 1000L) + ((fraction * 1000L) >>> 32);
        return ms;
    }

    private static void writeNtpTimestamp(byte[] buf, int offset, long seconds, long fraction) {
        buf[offset] = (byte) ((seconds >>> 24) & 0xFF);
        buf[offset + 1] = (byte) ((seconds >>> 16) & 0xFF);
        buf[offset + 2] = (byte) ((seconds >>> 8) & 0xFF);
        buf[offset + 3] = (byte) (seconds & 0xFF);
        buf[offset + 4] = (byte) ((fraction >>> 24) & 0xFF);
        buf[offset + 5] = (byte) ((fraction >>> 16) & 0xFF);
        buf[offset + 6] = (byte) ((fraction >>> 8) & 0xFF);
        buf[offset + 7] = (byte) (fraction & 0xFF);
    }

    private static final class Sample {
        final String source;
        final double offsetMs;
        final double delayMs;
        final long serverTimeMs;
        final long localMidpointMs;

        Sample(String source, double offsetMs, double delayMs, long serverTimeMs, long localMidpointMs) {
            this.source = source;
            this.offsetMs = offsetMs;
            this.delayMs = delayMs;
            this.serverTimeMs = serverTimeMs;
            this.localMidpointMs = localMidpointMs;
        }
    }
}
