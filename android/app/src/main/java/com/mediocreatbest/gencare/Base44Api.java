package com.mediocreatbest.gencare;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

/**
 * Minimal base44 client for work the phone does with the app closed
 * (CalendarSyncWorker). Posts to
 *   {serverUrl}/api/apps/{appId}/functions/{name}
 * with the session token SessionSnapshotter copied out of the WebView.
 */
public final class Base44Api {

    private static final String TAG = "GenCare";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 45000;

    /** The phone-calendar function: import rows, pull exports, report exports. */
    static final String CALENDAR_FUNCTION = "phoneCalendar";

    private Base44Api() {
    }

    static final class Result {
        final int code;
        final JSONObject body;
        final String error;

        Result(int code, JSONObject body, String error) {
            this.code = code;
            this.body = body;
            this.error = error;
        }

        boolean isSuccess() { return code >= 200 && code < 300; }
        boolean isAuthFailure() { return code == 401 || code == 403; }
        boolean isTransport() { return code == 0; }
    }

    static String deviceTimezone() {
        try {
            String id = TimeZone.getDefault().getID();
            return (id == null || id.isEmpty()) ? null : id;
        } catch (Exception e) {
            return null;
        }
    }

    static Result phoneCalendar(Context context, JSONObject payload, int readTimeoutMs) {
        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }
        try {
            String timezone = deviceTimezone();
            if (timezone != null && !payload.has("timezone")) {
                payload.put("timezone", timezone);
            }
        } catch (Exception ignored) {
        }
        String url = serverUrl + "/api/apps/" + appId + "/functions/" + CALENDAR_FUNCTION;
        return post(context, url, payload, readTimeoutMs);
    }

    private static Result post(Context context, String spec, JSONObject body, int readTimeoutMs) {
        String token = Base44Session.getToken(context);
        String appId = Base44Session.getAppId(context);
        if (token == null) {
            return new Result(0, null, "no stored access token");
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(spec).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(readTimeoutMs > 0 ? readTimeoutMs : READ_TIMEOUT_MS);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            if (appId != null) {
                connection.setRequestProperty("X-App-Id", appId);
            }
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload);
            }
            int code = connection.getResponseCode();
            String responseText = readStream(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
            Log.d(TAG, "Base44Api POST " + spec + " -> " + code);
            JSONObject object = null;
            if (responseText != null) {
                String trimmed = responseText.trim();
                if (trimmed.startsWith("{")) {
                    try {
                        object = new JSONObject(trimmed);
                    } catch (Exception parseError) {
                        Log.w(TAG, "Base44Api: unparseable JSON body");
                    }
                }
            }
            return new Result(code, object, code >= 400 ? responseText : null);
        } catch (Exception e) {
            Log.w(TAG, "Base44Api POST transport failure: " + e.getMessage());
            return new Result(0, null, String.valueOf(e.getMessage()));
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        } catch (Exception e) {
            Log.w(TAG, "Base44Api: failed reading response: " + e.getMessage());
        }
        return builder.toString();
    }
}
