package com.mediocreatbest.gencare;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.CalendarContract;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The phone's calendars and GenCare stay in step with the app closed.
 *
 * Import: Android tells this worker when anything in the phone's calendars
 * changes (a content trigger on the calendar provider, held until things have
 * been quiet for 30 seconds), and it also runs every 6 hours. Each time it
 * reads the ticked calendars (CalendarBridge.readEvents) and, when that differs
 * from what it last sent, hands the rows to the server's phoneCalendar function
 * (mode "import"), which turns them into GenCare appointments.
 *
 * Export: on the same runs it asks the server for the family events this
 * person wants on their phone (mode "export_pull": the server applies the
 * person's own export filter), writes them into the calendar they chose
 * (CalendarBridge.writeRows) and reports the provider ids back (mode
 * "export_report"), so a family member's new appointment lands on everyone's
 * phone calendar without anyone opening GenCare.
 *
 * Which calendars to import, and whether export is on: the app says so
 * (CalendarBridge.setSyncCalendars / setExportEnabled) on every open and after
 * every change. Nothing ticked and export off: nothing runs.
 */
public class CalendarSyncWorker extends Worker {

    private static final String TAG = "GenCare";
    static final String WATCH_NAME = "gencare_calendar_watch";
    static final String SEND_NAME = "gencare_calendar_send";
    static final String PERIODIC_NAME = "gencare_calendar_periodic";

    private static final String KEY_MODE = "mode";
    private static final String MODE_WATCH = "watch";
    private static final String MODE_SEND = "send";

    private static final String PREFS = "gencare_calendar_sync";
    private static final String KEY_IDS = "calendar_ids";
    private static final String KEY_HASH = "last_hash";
    private static final String KEY_SENT_AT = "last_sent_at";
    private static final String KEY_COUNT = "last_count";
    private static final String KEY_EMPTY_SINCE = "empty_since";
    private static final String KEY_EXPORT = "export_on";

    /** The same window the app reads (calendarSync.js DEVICE_DAYS). */
    private static final int DAYS = 365;
    /** Unchanged rows are sent again after a day anyway, as a check-in. */
    private static final long RESEND_AFTER_MS = 24L * 60L * 60L * 1000L;
    private static final long EMPTY_HOLD_MS = 6L * 60L * 60L * 1000L;
    /** A first import sorts every event with AI: it can take minutes. */
    private static final int READ_TIMEOUT_MS = 180000;

    private static final Object LOCK = new Object();

    public CalendarSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The calendars the person ticked, as the app last said. */
    static List<String> calendarIds(Context c) {
        List<String> ids = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY_IDS, "[]"));
            for (int i = 0; i < a.length(); i++) {
                String id = a.optString(i, "").trim();
                if (!id.isEmpty() && id.matches("\\d+")) {
                    ids.add(id);
                }
            }
        } catch (Exception ignored) {
        }
        return ids;
    }

    /**
     * The app's word on which calendars to watch. Called on every app open and
     * after every tick, so it changes nothing when nothing changed.
     */
    static void setCalendars(Context ctx, List<String> ids) {
        Context c = ctx.getApplicationContext();
        String json = new JSONArray(ids).toString();
        SharedPreferences p = prefs(c);
        boolean changed = !json.equals(p.getString(KEY_IDS, "[]"));
        SharedPreferences.Editor ed = p.edit().putString(KEY_IDS, json);
        // A different set of calendars: what was sent before says nothing.
        if (changed) {
            ed.remove(KEY_HASH).remove(KEY_COUNT).remove(KEY_EMPTY_SINCE);
        }
        ed.apply();
        reschedule(c);
    }

    /** The app's word on whether family events should be written to this phone. */
    static void setExportEnabled(Context ctx, boolean on) {
        Context c = ctx.getApplicationContext();
        prefs(c).edit().putBoolean(KEY_EXPORT, on).apply();
        reschedule(c);
    }

    static boolean exportEnabled(Context c) {
        return prefs(c).getBoolean(KEY_EXPORT, false);
    }

    private static void reschedule(Context c) {
        List<String> ids = calendarIds(c);
        boolean export = exportEnabled(c);
        if (ids.isEmpty() && !export) {
            stop(c);
            return;
        }
        if (ids.isEmpty()) {
            try {
                WorkManager.getInstance(c).cancelUniqueWork(WATCH_NAME);
            } catch (Exception ignored) {
            }
        } else if (CalendarBridge.hasPermission(c)) {
            // Watching the calendar provider only with calendar access: once it's
            // turned back on, the app says so again on its next open and this arms.
            arm(c, ExistingWorkPolicy.KEEP);
        }
        schedulePeriodic(c);
    }

    /** A fresh sign-in landed (SessionSnapshotter): send what's waiting. */
    static void kickIfWatching(Context ctx) {
        Context c = ctx.getApplicationContext();
        if (!calendarIds(c).isEmpty() || exportEnabled(c)) {
            kickSend(c);
        }
    }

    /** Nothing ticked: no watching, no sending. */
    static void stop(Context c) {
        try {
            WorkManager wm = WorkManager.getInstance(c.getApplicationContext());
            wm.cancelUniqueWork(WATCH_NAME);
            wm.cancelUniqueWork(PERIODIC_NAME);
            wm.cancelUniqueWork(SEND_NAME);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not stop", e);
        }
    }

    /** Wait for the next change in the phone's calendars. */
    private static void arm(Context c, ExistingWorkPolicy policy) {
        try {
            Constraints constraints = new Constraints.Builder()
                    .addContentUriTrigger(CalendarContract.CONTENT_URI, true)
                    .setTriggerContentUpdateDelay(30, TimeUnit.SECONDS)
                    .setTriggerContentMaxDelay(2, TimeUnit.MINUTES)
                    .build();
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CalendarSyncWorker.class)
                    .setConstraints(constraints)
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_WATCH).build())
                    .addTag(WATCH_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(WATCH_NAME, policy, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not watch the calendars", e);
        }
    }

    /** Read and send as soon as there is a connection, retrying on its own. */
    private static void kickSend(Context c) {
        try {
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CalendarSyncWorker.class)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_SEND).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,
                            OneTimeWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                    .addTag(SEND_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext())
                    .enqueueUniqueWork(SEND_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not queue a send", e);
        }
    }

    private static void schedulePeriodic(Context c) {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(CalendarSyncWorker.class, 6, TimeUnit.HOURS)
                    .setConstraints(new Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build())
                    .setInputData(new Data.Builder().putString(KEY_MODE, MODE_SEND).build())
                    .addTag(PERIODIC_NAME)
                    .build();
            WorkManager.getInstance(c.getApplicationContext())
                    .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not schedule the 6-hour check", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (MODE_WATCH.equals(getInputData().getString(KEY_MODE))) {
            // Listen for the next change first, so it's heard even if the send
            // below can't go out yet.
            if (!calendarIds(c).isEmpty() && CalendarBridge.hasPermission(c)) {
                arm(c, ExistingWorkPolicy.APPEND_OR_REPLACE);
                kickSend(c);
            }
            return Result.success();
        }
        synchronized (LOCK) {
            return send(c);
        }
    }

    private static Result send(Context c) {
        // Signed out, or never signed in on this phone yet.
        if (!Base44Session.isUsable(c)) {
            return Result.success();
        }
        Result imported = sendImport(c);
        Result exported = sendExport(c);
        if (imported instanceof Result.Retry || exported instanceof Result.Retry) {
            return Result.retry();
        }
        return Result.success();
    }

    private static Result sendImport(Context c) {
        List<String> ids = calendarIds(c);
        if (ids.isEmpty()) {
            return Result.success();
        }
        // Calendar access turned off: the app says so itself on its next open.
        if (!CalendarBridge.hasPermission(c)) {
            Log.w(TAG, "CalendarSyncWorker: no calendar access, nothing read");
            return Result.success();
        }

        JSONArray rows = new JSONArray();
        try {
            CalendarBridge.readEvents(c, ids, DAYS, rows);
        } catch (Exception e) {
            Log.w(TAG, "CalendarSyncWorker: could not read the calendars", e);
            return Result.retry();
        }

        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        if (rows.length() == 0 && p.getInt(KEY_COUNT, -1) != 0) {
            long since = p.getLong(KEY_EMPTY_SINCE, 0L);
            if (since == 0L) {
                p.edit().putLong(KEY_EMPTY_SINCE, now).apply();
                Log.w(TAG, "CalendarSyncWorker: the calendars read empty, waiting before believing it");
                return Result.success();
            }
            if (now - since < EMPTY_HOLD_MS) {
                return Result.success();
            }
        } else if (p.contains(KEY_EMPTY_SINCE)) {
            p.edit().remove(KEY_EMPTY_SINCE).apply();
        }

        String hash = sha256(ids.toString() + "|" + rows.toString());
        if (hash.equals(p.getString(KEY_HASH, "")) && now - p.getLong(KEY_SENT_AT, 0L) < RESEND_AFTER_MS) {
            return Result.success();
        }

        JSONObject body = new JSONObject();
        try {
            body.put("mode", "import");
            body.put("source", "device");
            body.put("calendarIds", new JSONArray(ids));
            body.put("rows", rows);
            body.put("from", "phone_background");
        } catch (Exception e) {
            return Result.success();
        }

        Base44Api.Result r = Base44Api.phoneCalendar(c, body, READ_TIMEOUT_MS);
        if (r.isSuccess() && r.body != null && r.body.optBoolean("in_progress", false)) {
            return Result.retry();
        }
        if (r.isSuccess()) {
            p.edit()
                    .putString(KEY_HASH, hash)
                    .putLong(KEY_SENT_AT, now)
                    .putInt(KEY_COUNT, rows.length())
                    .apply();
            Log.d(TAG, "CalendarSyncWorker: sent " + rows.length() + " event(s); created "
                    + (r.body != null ? r.body.optInt("created", 0) : 0));
            return Result.success();
        }
        if (r.isAuthFailure()) {
            Log.w(TAG, "CalendarSyncWorker: sign-in refused, waiting for a fresh one");
            return Result.success();
        }
        if (r.isTransport() || r.code >= 500 || r.code == 429) {
            return Result.retry();
        }
        Log.w(TAG, "CalendarSyncWorker: the server refused the calendars (" + r.code + ")");
        return Result.success();
    }

    /**
     * Family events out to this phone. The server decides WHAT (the person's
     * export filter: which family members, which categories) and WHERE (the
     * calendar they chose); this only writes and reports back.
     */
    private static Result sendExport(Context c) {
        if (!exportEnabled(c)) {
            return Result.success();
        }
        if (!CalendarBridge.hasWritePermission(c)) {
            Log.w(TAG, "CalendarSyncWorker: no calendar write access, nothing exported");
            return Result.success();
        }
        JSONObject pull = new JSONObject();
        try {
            pull.put("mode", "export_pull");
            pull.put("from", "phone_background");
        } catch (Exception e) {
            return Result.success();
        }
        Base44Api.Result r = Base44Api.phoneCalendar(c, pull, 60000);
        if (!r.isSuccess() || r.body == null) {
            if (r.isTransport() || r.code >= 500 || r.code == 429) {
                return Result.retry();
            }
            return Result.success();
        }
        String calendarId = r.body.optString("calendarId", "");
        JSONArray events = r.body.optJSONArray("events");
        JSONArray deletes = r.body.optJSONArray("deletes");
        JSONArray results = new JSONArray();
        if (calendarId.matches("\\d+") && events != null && events.length() > 0) {
            try {
                CalendarBridge.writeRows(c, calendarId, events, results);
            } catch (Exception e) {
                Log.w(TAG, "CalendarSyncWorker: could not write exported events", e);
            }
        }
        List<String> deletedIds = new ArrayList<>();
        if (deletes != null) {
            for (int i = 0; i < deletes.length(); i++) {
                String id = deletes.optString(i, "").trim();
                if (id.matches("\\d+")) {
                    deletedIds.add(id);
                }
            }
            if (!deletedIds.isEmpty()) {
                CalendarBridge.deleteRows(c, deletedIds);
            }
        }
        if (results.length() == 0 && deletedIds.isEmpty()) {
            return Result.success();
        }
        JSONObject report = new JSONObject();
        try {
            report.put("mode", "export_report");
            report.put("results", results);
            report.put("deleted", new JSONArray(deletedIds));
            report.put("from", "phone_background");
        } catch (Exception e) {
            return Result.success();
        }
        Base44Api.Result rr = Base44Api.phoneCalendar(c, report, 60000);
        if (!rr.isSuccess() && (rr.isTransport() || rr.code >= 500)) {
            return Result.retry();
        }
        Log.d(TAG, "CalendarSyncWorker: exported " + results.length() + " event(s), removed " + deletedIds.size());
        return Result.success();
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }
}
