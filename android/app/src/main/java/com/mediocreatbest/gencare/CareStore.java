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

/**
 * What the Care Log widget shows, kept on the phone (Anna, Nov 10 2026: "a log
 * widget. It should work for any type of care and be sorted accordingly by
 * the app"). The server's widgetFeed function, with this phone's widget key
 * (WidgetStore), answers with everyone the family takes care of, a line or
 * two about their latest, and their Care Log buttons in the order this family
 * uses them (base44/shared/careQuick.ts). The same key logs a one-tap button
 * as this person, and takes back one they logged in the last 15 minutes.
 *
 * Also kept here: which person each widget is showing, and the note about the
 * last tap ("Wet diaper logged · Undo").
 */
final class CareStore {

    private static final String TAG = "GenCare";
    private static final String PREFS = "gencare_care_widget";
    private static final String K_PEOPLE = "people";
    private static final String K_FETCHED = "fetched_at";
    private static final String K_PERSON = "person_";
    private static final String K_NOTE = "note";

    private CareStore() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long fetchedAt(Context c) { return prefs(c).getLong(K_FETCHED, 0L); }

    /** [{ id, n, b, s: [{ i, t, at, by, now }], q: [{ k, i, l, a }] }] */
    static JSONArray people(Context c) {
        try {
            String raw = prefs(c).getString(K_PEOPLE, null);
            return raw == null ? new JSONArray() : new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** The person this widget shows (the first one until someone switches). */
    static JSONObject personFor(Context c, int widgetId, JSONArray people) {
        if (people.length() == 0) return null;
        String want = prefs(c).getString(K_PERSON + widgetId, "");
        for (int i = 0; i < people.length(); i++) {
            JSONObject p = people.optJSONObject(i);
            if (p != null && p.optString("id").equals(want)) return p;
        }
        JSONObject p = people.optJSONObject(0);
        if (p != null) prefs(c).edit().putString(K_PERSON + widgetId, p.optString("id")).apply();
        return p;
    }

    /** The next person the family takes care of, on this widget. */
    static void nextPerson(Context c, int widgetId) {
        JSONArray people = people(c);
        if (people.length() < 2) return;
        JSONObject now = personFor(c, widgetId, people);
        int at = 0;
        for (int i = 0; i < people.length(); i++) {
            JSONObject p = people.optJSONObject(i);
            if (p != null && now != null && p.optString("id").equals(now.optString("id"))) at = i;
        }
        JSONObject next = people.optJSONObject((at + 1) % people.length());
        if (next != null) prefs(c).edit().putString(K_PERSON + widgetId, next.optString("id")).apply();
    }

    static void forget(Context c, int widgetId) {
        prefs(c).edit().remove(K_PERSON + widgetId).apply();
    }

    static void clearAll(Context c) {
        prefs(c).edit().clear().apply();
    }

    // ── The note about the last tap ──────────────────────────────────────────

    /** state: "logging", "ok", "already", "error", "undone"; at: when (ms). */
    static void setNote(Context c, String state, String memberId, String icon, String label, String logId, String loggedAt) {
        try {
            JSONObject n = new JSONObject();
            n.put("state", state);
            n.put("member", memberId == null ? "" : memberId);
            n.put("i", icon == null ? "" : icon);
            n.put("l", label == null ? "" : label);
            n.put("id", logId == null ? "" : logId);
            n.put("loggedAt", loggedAt == null ? "" : loggedAt);
            n.put("at", System.currentTimeMillis());
            prefs(c).edit().putString(K_NOTE, n.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** The note, while it's still worth showing (2 minutes; "logging" 40 seconds), or null. */
    static JSONObject note(Context c) {
        try {
            String raw = prefs(c).getString(K_NOTE, null);
            if (raw == null) return null;
            JSONObject n = new JSONObject(raw);
            long age = System.currentTimeMillis() - n.optLong("at");
            long keep = "logging".equals(n.optString("state")) ? 40_000L : 120_000L;
            return age >= 0 && age < keep ? n : null;
        } catch (Exception e) {
            return null;
        }
    }

    // ── Talking to the server ────────────────────────────────────────────────

    /** The latest people and buttons. True when saved. */
    static boolean fetch(Context c) {
        try {
            JSONObject body = new JSONObject();
            body.put("mode", "care");
            return call(c, body) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Logs a one-tap button now. The answer ({ id, i, l, at, already }), or null. */
    static JSONObject log(Context c, String memberId, String button) {
        try {
            JSONObject body = new JSONObject();
            body.put("mode", "log");
            body.put("member_id", memberId);
            body.put("button", button);
            return call(c, body);
        } catch (Exception e) {
            return null;
        }
    }

    /** Takes back an entry this phone just logged. True when it's gone. */
    static boolean unlog(Context c, String logId) {
        try {
            JSONObject body = new JSONObject();
            body.put("mode", "unlog");
            body.put("id", logId);
            return call(c, body) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Posts to widgetFeed with the widget key; saves the people it answers with. The answer, or null. */
    private static JSONObject call(Context c, JSONObject body) {
        String key = WidgetStore.key(c);
        String app = WidgetStore.appId(c);
        String server = WidgetStore.serverUrl(c);
        if (key == null || key.isEmpty() || app == null || server == null) return null;
        if (server.endsWith("/")) server = server.substring(0, server.length() - 1);
        HttpURLConnection conn = null;
        try {
            body.put("key", key);
            conn = (HttpURLConnection) new URL(server + "/api/apps/" + app + "/functions/widgetFeed").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(20000);
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
                WidgetStore.dropKey(c);
                clearAll(c);
                return null;
            }
            if (res != null && "no_access".equals(res.optString("error"))) {
                WidgetStore.setState(c, "no_access");
                return null;
            }
            if (code >= 200 && code < 300 && res != null && res.optBoolean("ok")) {
                JSONArray people = res.optJSONArray("people");
                SharedPreferences.Editor e = prefs(c).edit().putLong(K_FETCHED, System.currentTimeMillis());
                if (people != null) e.putString(K_PEOPLE, people.toString());
                e.apply();
                if ("no_access".equals(WidgetStore.state(c))) WidgetStore.setState(c, "");
                return res;
            }
            Log.w(TAG, "care widget: answered " + code);
            return null;
        } catch (Exception e) {
            Log.w(TAG, "care widget: " + e.getMessage());
            return null;
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
