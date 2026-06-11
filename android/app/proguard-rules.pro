# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
-renamesourcefileattribute SourceFile

# ── Capacitor ──────────────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugins.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.PluginMethod { *; }

# ── Custom plugins ─────────────────────────────────────────────────────────
-keep class com.goodsapp.collector.NativeMusicBridgePlugin { *; }
-keep class com.goodsapp.collector.MihoyoSessionImportPlugin { *; }

# ── Capacitor Cordova plugins ──────────────────────────────────────────────
-keep class org.apache.cordova.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# ── AndroidX / Core Splash Screen ──────────────────────────────────────────
-keep class androidx.core.splashscreen.** { *; }

# ── Keep Serializable / Parcelable ─────────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ── Enum safety ────────────────────────────────────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── WebView JavaScript bridge (Capacitor internal) ─────────────────────────
-keep class **JsBridge** { *; }
-keepattributes JavascriptInterface
