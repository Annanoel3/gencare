package com.mediocreatbest.gencare;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * What the home-screen widgets (Day, Week, Month) show, kept on the phone.
 *
 * The web app hands over a read-only widget key once (WidgetBridge.setKey).
 * With it, {@link #fetch} asks the server's widgetFeed function for the six
 * weeks the Month widget can show (which always hold this week and today),
 * and keeps the answer here, so the widgets draw from it with the app closed
 * and with no network. App-private storage, excluded from backups like the
 * session (backup_rules.xml).
 */
final class WidgetStore {

    private static final String TAG = "GenCare";
    private static final String PREFS = "gencare_widgets";
    private static final String K_KEY = "key";
    private static final String K_USER = "user_id";
    private static final String K_APP = "app_id";
    private static final String K_SERVER = "server_url";
    private static final String K_FEED = "feed";
    private static final String K_FETCHED = "fetched_at";
    private static final String K_STATE = "state"; // "", "no_key", "no_access"

    private WidgetStore() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean hasKey(Context c) {
        String k = prefs(c).getString(K_KEY, null);
        return k != null && !k.isEmpty();
    }

    static String key(Context c) { return prefs(c).getString(K_KEY, null); }
    static String userId(Context c) { return prefs(c).getString(K_USER, ""); }
    static long fetchedAt(Context c) { return prefs(c).getLong(K_FETCHED, 0L); }
    static String state(Context c) { return prefs(c).getString(K_STATE, ""); }

    static void setKey(Context c, String key, String userId, String appId, String serverUrl) {
        prefs(c).edit()
                .putString(K_KEY, key)
                .putString(K_USER, userId == null ? "" : userId)
                .putString(K_APP, appId)
                .putString(K_SERVER, serverUrl)
                .remove(K_FEED)
                .remove(K_FETCHED)
                .putString(K_STATE, "")
                .commit();
    }

    /** Forgets everything (signing out); returns the key that was here, if any. */
    static String clear(Context c) {
        String old = key(c);
        prefs(c).edit().clear().commit();
        return old;
    }

    /** The cached feed's days: { "YYYY-MM-DD": [ {id,t,s,e,a,c,p,w,n} ] }, or an empty object. */
    static JSONObject days(Context c) {
        try {
            String raw = prefs(c).getString(K_FEED, null);
            if (raw == null) return new JSONObject();
            JSONObject feed = new JSONObject(raw);
            JSONObject d = feed.optJSONObject("days");
            return d == null ? new JSONObject() : d;
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static JSONArray eventsOn(JSONObject days, String day) {
        JSONArray a = days.optJSONArray(day);
        return a == null ? new JSONArray() : a;
    }

    // ── Dates (minSdk 24: java.util.Calendar, not java.time) ──────────────

    static String ymd(Calendar cal) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(cal.getTimeZone());
        return f.format(cal.getTime());
    }

    static Calendar today() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c;
    }

    /** The Sunday on or before the 1st of this month: the Month widget's first square. */
    static Calendar monthGridStart() {
        Calendar c = today();
        c.set(Calendar.DAY_OF_MONTH, 1);
        int back = c.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        c.add(Calendar.DAY_OF_MONTH, -back);
        return c;
    }

    /** The Sunday on or before today. */
    static Calendar weekStart() {
        Calendar c = today();
        c.add(Calendar.DAY_OF_MONTH, -(c.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY));
        return c;
    }

    // ── Fetching ───────────────────────────────────────────────────────────

    /** Asks the server for the six weeks on show. Returns true when the cache was updated. */
    static boolean fetch(Context c) {
        SharedPreferences p = prefs(c);
        String key = p.getString(K_KEY, null);
        String app = p.getString(K_APP, null);
        String server = p.getString(K_SERVER, null);
        if (key == null || app == null || server == null) return false;
        Calendar from = monthGridStart();
        Calendar to = (Calendar) from.clone();
        to.add(Calendar.DAY_OF_MONTH, 41);
        // The Day widget also shows tomorrow; at the very end of a 6-week grid
        // that's past it.
        Calendar tomorrow = today();
        tomorrow.add(Calendar.DAY_OF_MONTH, 1);
        if (tomorrow.after(to)) to = tomorrow;
        if (server.endsWith("/")) server = server.substring(0, server.length() - 1);
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("key", key);
            body.put("from", ymd(from));
            body.put("to", ymd(to));
            conn = (HttpURLConnection) new URL(server + "/api/apps/" + app + "/functions/widgetFeed").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("X-App-Id", app);
            conn.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            int code = conn.getResponseCode();
            String text = read(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
            JSONObject res = text != null && text.trim().startsWith("{") ? new JSONObject(text.trim()) : null;
            if (code == 401 || (res != null && "no_key".equals(res.optString("error")))) {
                // The server no longer knows this key (it keeps a few per person):
                // drop it, so the widgets say "Open GenCare" and the app gets a new one.
                p.edit().remove(K_KEY).remove(K_FEED).remove(K_FETCHED).putString(K_STATE, "no_key").apply();
                return false;
            }
            if (res != null && "no_access".equals(res.optString("error"))) {
                p.edit().putString(K_STATE, "no_access").apply();
                return false;
            }
            if (code >= 200 && code < 300 && res != null && res.optBoolean("ok")) {
                p.edit()
                        .putString(K_FEED, res.toString())
                        .putLong(K_FETCHED, System.currentTimeMillis())
                        .putString(K_STATE, "")
                        .apply();
                return true;
            }
            Log.w(TAG, "widgets: feed answered " + code);
            return false;
        } catch (Exception e) {
            Log.w(TAG, "widgets: could not fetch: " + e.getMessage());
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream s) {
        if (s == null) return null;
        StringBuilder b = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(s, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) b.append(line);
        } catch (Exception e) {
            return null;
        }
        return b.toString();
    }
}
