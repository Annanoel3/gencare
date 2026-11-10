package com.mediocreatbest.gencare;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Draws the Care Log widget from what {@link CareStore} has saved: the person
 * it's for (tap their name for the next one), a line or two about their
 * latest ("🍼 Bottle · 4 oz · 2:14 PM · David"), a note about the last tap
 * with Undo, and their buttons in the order the family uses them, two rows of
 * three (three rows when the widget is tall enough).
 */
final class CareRender {

    private static final int[] ROWS = {R.id.care_row0, R.id.care_row1, R.id.care_row2};
    private static final int[] CELLS = {R.id.care_b0, R.id.care_b1, R.id.care_b2, R.id.care_b3, R.id.care_b4, R.id.care_b5, R.id.care_b6, R.id.care_b7, R.id.care_b8};
    private static final int[] ICONS = {R.id.care_i0, R.id.care_i1, R.id.care_i2, R.id.care_i3, R.id.care_i4, R.id.care_i5, R.id.care_i6, R.id.care_i7, R.id.care_i8};
    private static final int[] LABELS = {R.id.care_l0, R.id.care_l1, R.id.care_l2, R.id.care_l3, R.id.care_l4, R.id.care_l5, R.id.care_l6, R.id.care_l7, R.id.care_l8};

    private CareRender() {
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        update(c, m, WidgetRender.ids(c, CareWidget.class));
    }

    static void update(Context c, AppWidgetManager m, int[] ids) {
        if (ids == null || ids.length == 0) return;
        JSONArray people = CareStore.people(c);
        for (int id : ids) {
            try {
                m.updateAppWidget(id, draw(c, m, id, people));
            } catch (Exception ignored) {
                // One widget that can't be drawn never stops the others.
            }
        }
    }

    private static RemoteViews draw(Context c, AppWidgetManager m, int id, JSONArray people) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_care);
        int base = 5000 + (id % 1000) * 20;

        String notice = null;
        String noticePath = "/care-log";
        if (!WidgetStore.hasKey(c)) notice = c.getString(R.string.widget_care_signed_out);
        else if ("no_access".equals(WidgetStore.state(c))) notice = c.getString(R.string.widget_care_no_access);
        else if (CareStore.fetchedAt(c) == 0L) notice = c.getString(R.string.widget_loading);
        else if (people.length() == 0) {
            notice = c.getString(R.string.widget_care_nobody);
            noticePath = "/family";
        }

        JSONObject person = notice == null ? CareStore.personFor(c, id, people) : null;
        String pid = person == null ? "" : person.optString("id");
        String logPath = person == null ? "/care-log" : "/care-log?for=" + pid;
        rv.setOnClickPendingIntent(R.id.widget_header, WidgetRender.open(c, logPath, base));

        if (person == null) {
            rv.setTextViewText(R.id.care_person, "");
            rv.setViewVisibility(R.id.care_status1, View.GONE);
            rv.setViewVisibility(R.id.care_status2, View.GONE);
            rv.setViewVisibility(R.id.care_note, View.GONE);
            rv.setViewVisibility(R.id.care_grid, View.GONE);
            rv.setViewVisibility(R.id.care_empty, View.VISIBLE);
            rv.setTextViewText(R.id.care_empty, notice == null ? c.getString(R.string.widget_loading) : notice);
            rv.setOnClickPendingIntent(R.id.care_empty, WidgetRender.open(c, noticePath, base + 1));
            return rv;
        }

        // Who: tap for the next person the family takes care of.
        boolean several = people.length() > 1;
        rv.setTextViewText(R.id.care_person, person.optString("n") + (several ? "  ›" : ""));
        rv.setOnClickPendingIntent(R.id.care_person, several ? next(c, id, base + 2) : WidgetRender.open(c, logPath, base + 2));

        // Their latest.
        JSONArray s = person.optJSONArray("s");
        int lines = s == null ? 0 : Math.min(2, s.length());
        rv.setViewVisibility(R.id.care_status1, View.VISIBLE);
        rv.setTextViewText(R.id.care_status1, lines > 0 ? statusText(c, s.optJSONObject(0)) : "Nothing logged in the last two weeks");
        rv.setOnClickPendingIntent(R.id.care_status1, WidgetRender.open(c, logPath, base + 3));

        // The last tap, on this widget's person.
        JSONObject note = CareStore.note(c);
        boolean showNote = note != null && pid.equals(note.optString("member"));
        if (showNote) {
            String state = note.optString("state");
            rv.setViewVisibility(R.id.care_note, View.VISIBLE);
            rv.setTextViewText(R.id.care_note_text, noteText(c, note, person.optString("n")));
            boolean undo = "ok".equals(state) && !note.optString("id").isEmpty();
            rv.setViewVisibility(R.id.care_undo, undo ? View.VISIBLE : View.GONE);
            if (undo) rv.setOnClickPendingIntent(R.id.care_undo, undo(c, note, base + 4));
        } else {
            rv.setViewVisibility(R.id.care_note, View.GONE);
        }
        // The second line makes way for the note.
        rv.setViewVisibility(R.id.care_status2, lines > 1 && !showNote ? View.VISIBLE : View.GONE);
        if (lines > 1) {
            rv.setTextViewText(R.id.care_status2, statusText(c, s.optJSONObject(1)));
            rv.setOnClickPendingIntent(R.id.care_status2, WidgetRender.open(c, logPath, base + 5));
        }

        // The buttons: 2 rows of 3, or 3 when it's tall enough (1 when it's very short).
        Bundle opts = m.getAppWidgetOptions(id);
        int tall = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        int rows = tall >= 250 ? 3 : tall > 0 && tall < 140 ? 1 : 2;
        JSONArray q = person.optJSONArray("q");
        int n = q == null ? 0 : q.length();
        rv.setViewVisibility(R.id.care_empty, View.GONE);
        rv.setViewVisibility(R.id.care_grid, View.VISIBLE);
        for (int r = 0; r < 3; r++) rv.setViewVisibility(ROWS[r], r < rows && r * 3 < Math.max(n, 1) ? View.VISIBLE : View.GONE);
        for (int i = 0; i < CELLS.length; i++) {
            JSONObject b = i < rows * 3 && q != null ? q.optJSONObject(i) : null;
            if (b == null) {
                rv.setViewVisibility(CELLS[i], View.INVISIBLE);
                continue;
            }
            rv.setViewVisibility(CELLS[i], View.VISIBLE);
            rv.setTextViewText(ICONS[i], b.optString("i"));
            rv.setTextViewText(LABELS[i], b.optString("l"));
            WidgetRender.textColor(c, rv, LABELS[i], R.color.widget_fg);
            PendingIntent tap = b.optBoolean("a")
                    // Needs details (how much, what happened): the app, on that form.
                    ? WidgetRender.open(c, logPath + "&log=" + Uri.encode(b.optString("k")), base + 6 + i)
                    : log(c, id, pid, b, base + 6 + i);
            rv.setOnClickPendingIntent(CELLS[i], tap);
        }
        WidgetRender.textColor(c, rv, R.id.care_status1, R.color.widget_muted);
        WidgetRender.textColor(c, rv, R.id.care_status2, R.color.widget_muted);
        return rv;
    }

    private static PendingIntent broadcast(Context c, Intent i, int requestCode) {
        i.setClass(c, CareWidget.class);
        // Each widget's each button its own intent, so their extras never mix.
        i.setData(Uri.parse("gencare-care://" + requestCode));
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent log(Context c, int widgetId, String memberId, JSONObject b, int requestCode) {
        Intent i = new Intent(CareWidget.ACTION_LOG)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                .putExtra(CareWidget.EXTRA_MEMBER, memberId)
                .putExtra(CareWidget.EXTRA_BUTTON, b.optString("k"))
                .putExtra(CareWidget.EXTRA_ICON, b.optString("i"))
                .putExtra(CareWidget.EXTRA_LABEL, b.optString("l"));
        return broadcast(c, i, requestCode);
    }

    private static PendingIntent next(Context c, int widgetId, int requestCode) {
        return broadcast(c, new Intent(CareWidget.ACTION_NEXT).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId), requestCode);
    }

    private static PendingIntent undo(Context c, JSONObject note, int requestCode) {
        Intent i = new Intent(CareWidget.ACTION_UNDO)
                .putExtra(CareWidget.EXTRA_LOG, note.optString("id"))
                .putExtra(CareWidget.EXTRA_MEMBER, note.optString("member"))
                .putExtra(CareWidget.EXTRA_ICON, note.optString("i"))
                .putExtra(CareWidget.EXTRA_LABEL, note.optString("l"));
        return broadcast(c, i, requestCode);
    }

    // ── Words ────────────────────────────────────────────────────────────────

    /** "🍼 Bottle · 4 oz · 2:14 PM · David", or "😴 Asleep since 2:10 PM". */
    static String statusText(Context c, JSONObject s) {
        if (s == null) return "";
        String when = when(c, s.optString("at"));
        StringBuilder b = new StringBuilder();
        b.append(s.optString("i")).append(' ').append(s.optString("t"));
        if (!when.isEmpty()) b.append(s.optBoolean("now") ? " since " : " · ").append(when);
        String by = s.optString("by");
        if (!by.isEmpty()) b.append(" · ").append(by);
        return b.toString();
    }

    private static String noteText(Context c, JSONObject n, String name) {
        String what = n.optString("i") + " " + n.optString("l");
        switch (n.optString("state")) {
            case "logging": return "Logging " + n.optString("l") + "…";
            case "ok": return "✓ " + what + " logged for " + name;
            case "already": {
                String at = when(c, n.optString("loggedAt"));
                return "✓ " + n.optString("l") + " was already logged" + (at.isEmpty() ? " today" : " at " + at);
            }
            case "undone": return "Taken back: " + n.optString("l");
            case "undo_error": return "Couldn't take it back. Open GenCare to delete it.";
            default: return "Couldn't log " + n.optString("l") + ". Check your connection and try again.";
        }
    }

    /** "2:14 PM" today, "Yesterday 9:10 PM", else "Nov 8". */
    static String when(Context c, String iso) {
        Date d = parse(iso);
        if (d == null) return "";
        Calendar then = Calendar.getInstance();
        then.setTime(d);
        Calendar today = WidgetStore.today();
        Calendar yesterday = (Calendar) today.clone();
        yesterday.add(Calendar.DAY_OF_MONTH, -1);
        String clock = WidgetRender.clock(c, String.format(Locale.US, "%02d:%02d", then.get(Calendar.HOUR_OF_DAY), then.get(Calendar.MINUTE)));
        if (!then.before(today)) return clock;
        if (!then.before(yesterday)) return "Yesterday " + clock;
        return new SimpleDateFormat("MMM d", Locale.getDefault()).format(d);
    }

    /**
     * An ISO time from the server ("2026-11-10T20:14:00.000Z", "…+00:00", with
     * or without milliseconds; no zone means UTC, as the server keeps them).
     * Read by hand: minSdk 24 has no java.time.
     */
    static Date parse(String iso) {
        if (iso == null || iso.length() < 19 || iso.charAt(10) != 'T') return null;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            long ms = f.parse(iso.substring(0, 19)).getTime();
            String rest = iso.substring(19);
            if (rest.startsWith(".")) {
                int k = 1;
                while (k < rest.length() && Character.isDigit(rest.charAt(k))) k++;
                String frac = (rest.substring(1, k) + "000").substring(0, 3);
                ms += Integer.parseInt(frac);
                rest = rest.substring(k);
            }
            if (rest.length() >= 6 && (rest.charAt(0) == '+' || rest.charAt(0) == '-')) {
                int h = Integer.parseInt(rest.substring(1, 3));
                int m = Integer.parseInt(rest.substring(4, 6));
                int off = (h * 60 + m) * 60_000;
                ms += rest.charAt(0) == '+' ? -off : off;
            }
            return new Date(ms);
        } catch (Exception e) {
            return null;
        }
    }
}
