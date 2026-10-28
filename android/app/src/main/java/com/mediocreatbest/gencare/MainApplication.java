package com.mediocreatbest.gencare;

import android.app.Application;

import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class MainApplication extends Application {

    // OneSignal App ID for GenCare (the same app the website's OneSignalInit uses)
    private static final String ONESIGNAL_APP_ID = "41013e11-10b9-45c1-a24f-11c47b3b2534"; // GenCare at OneSignal (067a47c8... was FitAbility's, pasted by mistake)

    @Override
    public void onCreate() {
        super.onCreate();
        if (BuildConfig.DEBUG) {
            OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        }
        // Always initialize in the Application class, not MainActivity.
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);
        // Do NOT call requestPermission() here (NullPointerException: no coroutine
        // context). The web app asks through NotifyBridge.requestPermission().
    }
}
