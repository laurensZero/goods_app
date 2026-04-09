package com.goodsapp.collector;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Parcelable;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeMusicBridge")
public class NativeMusicBridgePlugin extends Plugin {
    private static final String TARGET_APP_HONOR = "honor";
    private static final String TARGET_APP_OFFICIAL = "official";
    private static final String TARGET_APP_ASK = "ask";
    private static final String[] NETEASE_PACKAGES = new String[] {
        "com.hihonor.cloudmusic",
        "com.netease.cloudmusic"
    };

    @PluginMethod
    public void openNeteaseSong(PluginCall call) {
        String songId = call.getString("songId", "");
        String targetApp = normalizeTargetApp(call.getString("targetApp", TARGET_APP_ASK));
        if (TextUtils.isEmpty(songId)) {
            call.reject("缺少网易云歌曲 ID");
            return;
        }

        PackageManager packageManager = getContext().getPackageManager();
        LaunchCandidate[] candidates = buildLaunchCandidates(packageManager, songId);
        if (candidates.length == 0) {
            JSObject result = new JSObject();
            result.put("opened", false);
            call.resolve(result);
            return;
        }

        if (TARGET_APP_ASK.equals(targetApp) && candidates.length > 1) {
            Intent chooser = Intent.createChooser(new Intent(candidates[0].intent), "选择网易云 App");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (candidates.length > 1) {
                Parcelable[] extraIntents = new Parcelable[candidates.length - 1];
                for (int index = 1; index < candidates.length; index += 1) {
                    extraIntents[index - 1] = new Intent(candidates[index].intent);
                }
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents);
            }

            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("mode", TARGET_APP_ASK);
            call.resolve(result);
            return;
        }

        LaunchCandidate candidate = pickLaunchCandidate(candidates, targetApp);
        if (candidate != null) {
            getContext().startActivity(new Intent(candidate.intent));
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("packageName", candidate.packageName);
            result.put("uri", candidate.uri);
            result.put("mode", targetApp);
            call.resolve(result);
            return;
        }

        JSObject result = new JSObject();
        result.put("opened", false);
        call.resolve(result);
    }

    private String normalizeTargetApp(String value) {
        if (TARGET_APP_HONOR.equals(value)) {
            return TARGET_APP_HONOR;
        }
        if (TARGET_APP_OFFICIAL.equals(value)) {
            return TARGET_APP_OFFICIAL;
        }
        return TARGET_APP_ASK;
    }

    private LaunchCandidate[] buildLaunchCandidates(PackageManager packageManager, String songId) {
        LaunchCandidate[] candidates = new LaunchCandidate[NETEASE_PACKAGES.length];
        int count = 0;

        for (String packageName : NETEASE_PACKAGES) {
            LaunchCandidate candidate = findLaunchCandidate(packageManager, packageName, buildUrisForPackage(packageName, songId));
            if (candidate == null) {
                continue;
            }
            candidates[count] = candidate;
            count += 1;
        }

        LaunchCandidate[] resolved = new LaunchCandidate[count];
        System.arraycopy(candidates, 0, resolved, 0, count);
        return resolved;
    }

    private String[] buildUrisForPackage(String packageName, String songId) {
        if ("com.hihonor.cloudmusic".equals(packageName)) {
            return new String[] {
                "honororpheus://song/" + songId,
                "orpheus://song/" + songId,
                "orpheus://song?id=" + songId,
                "orpheus://play?songid=" + songId
            };
        }

        return new String[] {
            "orpheus://song/" + songId,
            "orpheus://song?id=" + songId,
            "orpheus://play?songid=" + songId
        };
    }

    private LaunchCandidate findLaunchCandidate(PackageManager packageManager, String packageName, String[] uris) {
        for (String uri : uris) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            intent.setPackage(packageName);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(packageManager) != null) {
                return new LaunchCandidate(packageName, uri, intent);
            }
        }
        return null;
    }

    private LaunchCandidate pickLaunchCandidate(LaunchCandidate[] candidates, String targetApp) {
        if (candidates.length == 0) {
            return null;
        }

        String preferredPackageName = TARGET_APP_HONOR.equals(targetApp)
            ? "com.hihonor.cloudmusic"
            : TARGET_APP_OFFICIAL.equals(targetApp)
                ? "com.netease.cloudmusic"
                : "";

        if (!TextUtils.isEmpty(preferredPackageName)) {
            for (LaunchCandidate candidate : candidates) {
                if (preferredPackageName.equals(candidate.packageName)) {
                    return candidate;
                }
            }
        }

        return candidates[0];
    }

    private static class LaunchCandidate {
        final String packageName;
        final String uri;
        final Intent intent;

        LaunchCandidate(String packageName, String uri, Intent intent) {
            this.packageName = packageName;
            this.uri = uri;
            this.intent = intent;
        }
    }
}
