package com.mediocreatbest.gencare;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * The rows of the Today and This week widgets (WidgetRender draws the rest).
 *   Today:     today's events (or "Nothing on the calendar today"), then
 *              "Tomorrow · Sat, Oct 31" and tomorrow's.
 *   This week: one row per day, Sunday to Saturday, its events beside it.
 * A tap on an event opens it in the app; a tap on a day opens that day.
 */
public class WidgetListService extends RemoteViewsService {

    static final String EXTRA_KIND = "com.mediocreatbest.gencare.WIDGET_KIND";
    private static final int WEEK_LINES = 4;

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent.getStringExtra(EXTRA_KIND));
    }

    /** One row: an event, a quiet line ("Tomorrow · …"), or a day of the week. */
    private static final class Row {
        int type; // 0 = event, 1 = line, 2 = day
        String day;
        String text;
        JSONObject event;
        JSONArray events;
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context c;
        private final String kind;
        private final List<Row> rows = new ArrayList<>();

        Factory(Context c, String kind) {
            this.c = c;
            this.kind = kind == null ? WidgetRender.KIND_DAY : kind;
        }

        @Override public void onCreate() { }
        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 3; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        @Override
        public void onDataSetChanged() {
            rows.clear();
            if (WidgetRender.notice(c) != null) return; // the empty view says why
            JSONObject days = WidgetStore.days(c);
            Calendar today = WidgetStore.today();
            if (WidgetRender.KIND_WEEK.equals(kind)) {
                Calendar d = WidgetStore.weekStart();
                for (int i = 0; i < 7; i++) {
                    Row r = new Row();
                    r.type = 2;
                    r.day = WidgetStore.ymd(d);
                    r.text = WidgetRender.fmt(d, "EEE") + "|" + d.get(Calendar.DAY_OF_MONTH);
                    r.events = WidgetStore.eventsOn(days, r.day);
                    rows.add(r);
                    d.add(Calendar.DAY_OF_MONTH, 1);
                }
                return;
            }
            String todayKey = WidgetStore.ymd(today);
            JSONArray todays = WidgetStore.eventsOn(days, todayKey);
            if (todays.length() == 0) rows.add(line(todayKey, "Nothing on the calendar today."));
            for (int i = 0; i < todays.length(); i++) rows.add(event(todayKey, todays.optJSONObject(i)));
            Calendar tomorrow = (Calendar) today.clone();
            tomorrow.add(Calendar.DAY_OF_MONTH, 1);
            String tKey = WidgetStore.ymd(tomorrow);
            JSONArray tomorrows = WidgetStore.eventsOn(days, tKey);
            rows.add(line(tKey, "Tomorrow · " + WidgetRender.fmt(tomorrow, "EEE, MMM d")));
            if (tomorrows.length() == 0) rows.add(line(tKey, "Nothing on the calendar."));
            for (int i = 0; i < tomorrows.length(); i++) rows.add(event(tKey, tomorrows.optJSONObject(i)));
        }

        private Row line(String day, String text) {
            Row r = new Row();
            r.type = 1;
            r.day = day;
            r.text = text;
            return r;
        }

        private Row event(String day, JSONObject ev) {
            Row r = new Row();
            r.type = 0;
            r.day = day;
            r.event = ev == null ? new JSONObject() : ev;
            return r;
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            Row r = rows.get(position);
            String pkg = c.getPackageName();
            Intent fill = new Intent();
            if (r.type == 1) {
                RemoteViews rv = new RemoteViews(pkg, R.layout.widget_row_section);
                rv.setTextViewText(R.id.section, r.text);
                fill.putExtra(NotifyBridge.EXTRA_OPEN_PATH, "/calendar?date=" + r.day);
                rv.setOnClickFillInIntent(R.id.section, fill);
                return rv;
            }
            if (r.type == 2) return dayRow(pkg, r, fill);

            JSONObject ev = r.event;
            RemoteViews rv = new RemoteViews(pkg, R.layout.widget_row_event);
            rv.setTextViewText(R.id.title, ev.optString("t"));
            StringBuilder meta = new StringBuilder();
            if (ev.optBoolean("a")) {
                meta.append("All day");
            } else {
                meta.append(WidgetRender.clock(c, ev.optString("s")));
                String end = ev.optString("e");
                if (!end.isEmpty()) meta.append(" – ").append(WidgetRender.clock(c, end));
            }
            if (!ev.optString("w").isEmpty()) meta.append(" · ").append(ev.optString("w"));
            if (!ev.optString("n").isEmpty()) meta.append(" · ").append(ev.optString("n"));
            if (ev.optBoolean("p")) meta.append(" · Only you");
            rv.setTextViewText(R.id.meta, meta.toString());
            bar(rv, R.id.bar, ev.optString("c"));
            fill.putExtra(NotifyBridge.EXTRA_OPEN_PATH, "/calendar?date=" + r.day + "&open=" + ev.optString("id"));
            rv.setOnClickFillInIntent(R.id.row, fill);
            return rv;
        }

        private RemoteViews dayRow(String pkg, Row r, Intent fill) {
            RemoteViews rv = new RemoteViews(pkg, R.layout.widget_row_day);
            String[] label = r.text.split("\\|");
            rv.setTextViewText(R.id.dow, label[0]);
            rv.setTextViewText(R.id.dnum, label.length > 1 ? label[1] : "");
            boolean isToday = r.day.equals(WidgetStore.ymd(WidgetStore.today()));
            rv.setInt(R.id.dnum, "setBackgroundResource", isToday ? R.drawable.widget_today : 0);
            WidgetRender.textColor(c, rv, R.id.dnum, isToday ? -1 : R.color.widget_fg);
            rv.removeAllViews(R.id.events);
            int n = r.events.length();
            if (n == 0) {
                rv.addView(R.id.events, lineView(pkg, "No events", "", true));
            }
            for (int i = 0; i < Math.min(n, WEEK_LINES); i++) {
                JSONObject ev = r.events.optJSONObject(i);
                if (ev == null) continue;
                String when = ev.optBoolean("a") ? "" : WidgetRender.clock(c, ev.optString("s")) + "  ";
                rv.addView(R.id.events, lineView(pkg, when + ev.optString("t"), ev.optString("c"), false));
            }
            if (n > WEEK_LINES) rv.addView(R.id.events, lineView(pkg, "+" + (n - WEEK_LINES) + " more", "", true));
            fill.putExtra(NotifyBridge.EXTRA_OPEN_PATH, "/calendar?date=" + r.day);
            rv.setOnClickFillInIntent(R.id.row, fill);
            return rv;
        }

        private RemoteViews lineView(String pkg, String text, String color, boolean quiet) {
            RemoteViews line = new RemoteViews(pkg, R.layout.widget_line);
            line.setTextViewText(R.id.text, text);
            WidgetRender.textColor(c, line, R.id.text, quiet ? R.color.widget_muted : R.color.widget_fg);
            bar(line, R.id.bar, quiet ? "" : color);
            return line;
        }

        /** A care event's color bar; plain events (not care-related) get none. */
        private void bar(RemoteViews rv, int id, String hex) {
            int color = WidgetRender.parse(hex);
            if (color == 0) {
                rv.setViewVisibility(id, View.INVISIBLE);
            } else {
                rv.setViewVisibility(id, View.VISIBLE);
                rv.setInt(id, "setColorFilter", color);
            }
        }
    }
}
