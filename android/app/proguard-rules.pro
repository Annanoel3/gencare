# ============================================================================
# GenCare R8 / ProGuard rules (ported from ADHDone's proven set)
# ============================================================================
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# WebView bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor core + plugins (looked up by class name from capacitor.plugins.json)
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class com.tchvu3.capacitorvoicerecorder.** { *; }
-keep class io.ionic.libs.** { *; }

# Our own native code (registered plugins, manifest entries)
-keep class com.mediocreatbest.gencare.** { *; }
-keepclassmembers class com.mediocreatbest.gencare.** { *; }

# WorkManager (pulled in by OneSignal)
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**

# OneSignal
-keep class com.onesignal.** { *; }
-keep interface com.onesignal.** { *; }
-dontwarn com.onesignal.**

# Push delivery path. ADHDone v23 lost push entirely when R8 stripped these
# (no FCM token -> device never registered). Only these packages are kept so
# the AdMob internals can still be shrunk (that's what moves Play's % up).
-keep class com.google.android.gms.cloudmessaging.** { *; }
-keep class com.google.android.datatransport.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.android.datatransport.**
-dontwarn com.google.firebase.**

# Play in-app updates
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

# Kotlin / coroutines (OneSignal 5 is built on kotlinx.coroutines; ADHDone v24 fix)
-keep class kotlin.coroutines.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn org.jetbrains.annotations.**
-keep class kotlinx.coroutines.** { *; }
-keepnames class kotlinx.coroutines.**
-dontwarn kotlinx.coroutines.**

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-dontwarn org.json.**
-dontwarn androidx.**
-dontwarn com.google.common.**

# RevenueCat
-keep class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**
