package com.mediocreatbest.gencare;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Copies the base44 session (token, app id, server URL) out of WebView
 * localStorage into native storage, a few times after each app open, so the
 * calendar worker can reach the server with the app closed. Reads only.
 * The server URL is the page's own origin (the SDK calls /api/... relatively).
 */
public final class SessionSnapshotter {

    private static final String TAG = "GenCare";
    private static final long[] ATTEMPT_DELAYS_MS = { 3000, 8000, 20000, 45000 };

    private static final String READ_SCRIPT =
            "(function(){try{return JSON.stringify({"
                    + "token: localStorage.getItem('base44_access_token'),"
                    + "appId: localStorage.getItem('base44_app_id'),"
                    + "serverUrl: localStorage.getItem('base44_app_base_url') || location.origin"
                    + "});}catch(e){return null;}})()";

    private SessionSnapshotter() {
    }

    static void schedule(Activity activity, WebView webView) {
        if (activity == null || webView == null) {
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        for (long delay : ATTEMPT_DELAYS_MS) {
            handler.postDelayed(() -> attempt(activity, webView), delay);
        }
    }

    private static void attempt(Activity activity, WebView webView) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            return;
        }
        try {
            webView.evaluateJavascript(READ_SCRIPT, value -> onResult(activity, value));
        } catch (Exception e) {
            Log.w(TAG, "SessionSnapshotter: evaluateJavascript failed: " + e.getMessage());
        }
    }

    private static void onResult(Activity activity, String value) {
        if (value == null || "null".equals(value)) {
            return;
        }
        try {
            String json = value;
            if (json.startsWith("\"")) {
                json = new JSONObject("{\"v\":" + json + "}").getString("v");
            }
            JSONObject parsed = new JSONObject(json);
            String token = nullSafe(parsed.optString("token", null));
            String appId = nullSafe(parsed.optString("appId", null));
            String serverUrl = nullSafe(parsed.optString("serverUrl", null));
            if (token == null || appId == null || serverUrl == null) {
                return;
            }
            if (Base44Session.store(activity, token, appId, serverUrl)) {
                // A fresh sign-in: anything the worker couldn't send can go now.
                CalendarSyncWorker.kickIfWatching(activity);
            }
        } catch (Exception e) {
            Log.w(TAG, "SessionSnapshotter: could not parse session: " + e.getMessage());
        }
    }

    private static String nullSafe(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return (trimmed.isEmpty() || "null".equals(trimmed)) ? null : trimmed;
    }
}
