package com.mediocreatbest.gencare;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Draws GenCare's three home-screen widgets from what {@link WidgetStore} has
 * saved: Today (today's events, then tomorrow's), This week (Sunday to
 * Saturday, like the app's Week view) and Month (six weeks of squares, like
 * the app's Month view). Care events carry their color; everything else is
 * plain text; only-you events are gray, the same as the calendar in the app.
 * A tap opens the app on that day (or on that event).
 */
final class WidgetRender {

    static final String KIND_DAY = "day";
    static final String KIND_WEEK = "week";

    private WidgetRender() {
    }

    static int[] ids(Context c, Class<?> provider) {
        try {
            return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, provider));
        } catch (Exception e) {
            return new int[0];
        }
    }

    static boolean anyWidgets(Context c) {
        return ids(c, DayWidget.class).length + ids(c, WeekWidget.class).length + ids(c, MonthWidget.class).length > 0;
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        updateList(c, m, ids(c, DayWidget.class), KIND_DAY);
        updateList(c, m, ids(c, WeekWidget.class), KIND_WEEK);
        updateMonth(c, m, ids(c, MonthWidget.class));
    }

    /** What to say instead of events, or null when there are events to show. */
    static String notice(Context c) {
        if (!WidgetStore.hasKey(c)) return c.getString(R.string.widget_signed_out);
        if ("no_access".equals(WidgetStore.state(c))) return c.getString(R.string.widget_no_access);
        if (WidgetStore.fetchedAt(c) == 0L) return c.getString(R.string.widget_loading);
        return null;
    }

    // ── Today and This week (lists) ──────────────────────────────────────────

    static void updateList(Context c, AppWidgetManager m, int[] ids, String kind) {
        if (ids.length == 0) return;
        Calendar today = WidgetStore.today();
        String title;
        String subtitle;
        if (KIND_DAY.equals(kind)) {
            title = c.getString(R.string.widget_day_label);
            subtitle = fmt(today, "EEE, MMM d");
        } else {
            Calendar start = WidgetStore.weekStart();
            Calendar end = (Calendar) start.clone();
            end.add(Calendar.DAY_OF_MONTH, 6);
            title = c.getString(R.string.widget_week_label);
            subtitle = fmt(start, "MMM d") + " – " + (start.get(Calendar.MONTH) == end.get(Calendar.MONTH) ? fmt(end, "d") : fmt(end, "MMM d"));
        }
        String note = notice(c);
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_list);
            rv.setTextViewText(R.id.widget_title, title);
            rv.setTextViewText(R.id.widget_subtitle, subtitle);
            Intent svc = new Intent(c, WidgetListService.class)
                    .putExtra(WidgetListService.EXTRA_KIND, kind)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            rv.setRemoteAdapter(R.id.widget_list, svc);
            rv.setEmptyView(R.id.widget_list, R.id.widget_empty);
            rv.setTextViewText(R.id.widget_empty, note != null ? note : "");
            rv.setPendingIntentTemplate(R.id.widget_list, template(c, KIND_DAY.equals(kind) ? 11 : 12));
            String todayPath = "/calendar?date=" + WidgetStore.ymd(today);
            rv.setOnClickPendingIntent(R.id.widget_header, open(c, todayPath, KIND_DAY.equals(kind) ? 21 : 22));
            rv.setOnClickPendingIntent(R.id.widget_empty, open(c, todayPath, KIND_DAY.equals(kind) ? 31 : 32));
            m.updateAppWidget(id, rv);
            m.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
        }
    }

    // ── Month ────────────────────────────────────────────────────────────────

    static void updateMonth(Context c, AppWidgetManager m, int[] ids) {
        if (ids.length == 0) return;
        Calendar today = WidgetStore.today();
        String todayKey = WidgetStore.ymd(today);
        int month = today.get(Calendar.MONTH);
        Calendar start = WidgetStore.monthGridStart();
        JSONObject days = WidgetStore.days(c);
        String note = notice(c);

        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_month);
        rv.setTextViewText(R.id.widget_title, fmt(today, "MMMM yyyy"));
        rv.setTextViewText(R.id.widget_note, note == null ? "" : shortNotice(c));
        rv.setOnClickPendingIntent(R.id.widget_header, open(c, "/calendar?date=" + todayKey, 40));

        Calendar d = (Calendar) start.clone();
        for (int i = 0; i < 42; i++) {
            String key = WidgetStore.ymd(d);
            boolean inMonth = d.get(Calendar.MONTH) == month;
            boolean isToday = key.equals(todayKey);
            if (i % 7 == 0) {
                // A sixth (or fifth) row that's all next month isn't drawn.
                rv.setViewVisibility(MonthIds.ROWS[i / 7], i >= 28 && !inMonth ? View.GONE : View.VISIBLE);
            }
            rv.setTextViewText(MonthIds.DAY[i], String.valueOf(d.get(Calendar.DAY_OF_MONTH)));
            rv.setInt(MonthIds.DAY[i], "setBackgroundResource", isToday ? R.drawable.widget_today : 0);
            textColor(c, rv, MonthIds.DAY[i], isToday ? -1 : inMonth ? R.color.widget_fg : R.color.widget_faint);
            rv.setInt(MonthIds.CELL[i], "setBackgroundResource", isToday ? R.drawable.widget_today_cell : 0);

            JSONArray list = note == null ? WidgetStore.eventsOn(days, key) : new JSONArray();
            chip(c, rv, list.optJSONObject(0), MonthIds.CHIP_A[i], MonthIds.COLOR_A[i], MonthIds.TEXT_A[i], inMonth);
            chip(c, rv, list.optJSONObject(1), MonthIds.CHIP_B[i], MonthIds.COLOR_B[i], MonthIds.TEXT_B[i], inMonth);
            int more = list.length() - 2;
            rv.setViewVisibility(MonthIds.MORE[i], more > 0 ? View.VISIBLE : View.GONE);
            rv.setTextViewText(MonthIds.MORE[i], more > 0 ? "+" + more : "");
            rv.setOnClickPendingIntent(MonthIds.CELL[i], open(c, "/calendar?date=" + key, 100 + i));
            d.add(Calendar.DAY_OF_MONTH, 1);
        }
        for (int id : ids) m.updateAppWidget(id, rv);
    }

    private static String shortNotice(Context c) {
        if (!WidgetStore.hasKey(c) || "no_access".equals(WidgetStore.state(c))) return "Open GenCare";
        return c.getString(R.string.widget_loading);
    }

    private static void chip(Context c, RemoteViews rv, JSONObject ev, int chipId, int colorId, int textId, boolean inMonth) {
        if (ev == null) {
            rv.setViewVisibility(chipId, View.GONE);
            return;
        }
        rv.setViewVisibility(chipId, View.VISIBLE);
        rv.setTextViewText(textId, ev.optString("t"));
        int color = parse(ev.optString("c"));
        if (color != 0) {
            rv.setViewVisibility(colorId, View.VISIBLE);
            rv.setInt(colorId, "setColorFilter", color);
            rv.setInt(colorId, "setImageAlpha", inMonth ? 255 : 120);
            rv.setTextColor(textId, Color.WHITE);
        } else {
            // Not care-related: plain text, no color.
            rv.setViewVisibility(colorId, View.INVISIBLE);
            textColor(c, rv, textId, inMonth ? R.color.widget_fg : R.color.widget_faint);
        }
    }

    // ── Shared bits ──────────────────────────────────────────────────────────

    /** An event's color, or 0 for plain text. */
    static int parse(String hex) {
        if (hex == null || hex.isEmpty()) return 0;
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * A text color that follows the phone's light/dark setting even when it
     * changes after this was drawn (Android 12+); -1 = white.
     */
    static void textColor(Context c, RemoteViews rv, int viewId, int colorRes) {
        if (colorRes == -1) {
            rv.setTextColor(viewId, Color.WHITE);
            return;
        }
        if (Build.VERSION.SDK_INT >= 31) {
            rv.setColorInt(viewId, "setTextColor", colorFor(c, colorRes, false), colorFor(c, colorRes, true));
        } else {
            rv.setTextColor(viewId, c.getColor(colorRes));
        }
    }

    static int colorFor(Context c, int colorRes, boolean night) {
        Configuration conf = new Configuration(c.getResources().getConfiguration());
        conf.uiMode = (conf.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (night ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        return c.createConfigurationContext(conf).getColor(colorRes);
    }

    static String fmt(Calendar cal, String pattern) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.getDefault());
        f.setTimeZone(cal.getTimeZone());
        return f.format(cal.getTime());
    }

    /** "9:00 AM" (or "09:00" when the phone uses 24-hour time) from "HH:MM". */
    static String clock(Context c, String hhmm) {
        if (hhmm == null || hhmm.length() < 4) return "";
        try {
            String[] p = hhmm.split(":");
            int h = Integer.parseInt(p[0]);
            int min = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            if (android.text.format.DateFormat.is24HourFormat(c)) return String.format(Locale.US, "%02d:%02d", h, min);
            return String.format(Locale.US, "%d:%02d %s", ((h + 11) % 12) + 1, min, h >= 12 ? "PM" : "AM");
        } catch (Exception e) {
            return hhmm;
        }
    }

    /** Opens the app on a page, e.g. "/calendar?date=2026-10-30" (MainActivity hands it to the web app). */
    static PendingIntent open(Context c, String path, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction("com.mediocreatbest.gencare.WIDGET_OPEN." + requestCode)
                .putExtra(NotifyBridge.EXTRA_OPEN_PATH, path)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** For list rows: each row fills in its own page (WidgetListService). */
    static PendingIntent template(Context c, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction("com.mediocreatbest.gencare.WIDGET_ROW." + requestCode)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getActivity(c, requestCode, i, flags);
    }
}
