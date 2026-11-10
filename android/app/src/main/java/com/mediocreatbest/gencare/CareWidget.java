package com.mediocreatbest.gencare;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * GenCare's Care Log home-screen widget (drawn by CareRender, data from
 * CareStore). A tap on a button that needs nothing more logs it right there,
 * as you, for the person on the widget; the widget then says so with Undo
 * for two minutes. A button that needs details opens the app on it. The name
 * at the top switches to the next person the family takes care of.
 */
public class CareWidget extends AppWidgetProvider {

    static final String ACTION_LOG = "com.mediocreatbest.gencare.CARE_LOG";
    static final String ACTION_UNDO = "com.mediocreatbest.gencare.CARE_UNDO";
    static final String ACTION_NEXT = "com.mediocreatbest.gencare.CARE_NEXT";
    static final String EXTRA_MEMBER = "member";
    static final String EXTRA_BUTTON = "button";
    static final String EXTRA_ICON = "icon";
    static final String EXTRA_LABEL = "label";
    static final String EXTRA_LOG = "log";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        CareRender.update(context, manager, appWidgetIds);
        WidgetRefreshWorker.schedule(context);
        // Saved more than 20 minutes ago (or never): ask for the latest now.
        if (System.currentTimeMillis() - CareStore.fetchedAt(context) > 20 * 60_000L) {
            WidgetRefreshWorker.refreshNow(context);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        CareRender.update(context, manager, new int[]{appWidgetId});
    }

    @Override
    public void onEnabled(Context context) {
        WidgetRefreshWorker.schedule(context);
        WidgetRefreshWorker.refreshNow(context);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) CareStore.forget(context, id);
    }

    @Override
    public void onDisabled(Context context) {
        if (!WidgetRender.anyWidgets(context)) WidgetRefreshWorker.cancel(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_NEXT.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                CareStore.nextPerson(context, id);
                CareRender.updateAll(context);
            }
            return;
        }
        if (ACTION_LOG.equals(action)) {
            final Context c = context.getApplicationContext();
            final String member = intent.getStringExtra(EXTRA_MEMBER);
            final String button = intent.getStringExtra(EXTRA_BUTTON);
            final String icon = intent.getStringExtra(EXTRA_ICON);
            final String label = intent.getStringExtra(EXTRA_LABEL);
            if (member == null || button == null) return;
            // Right away: "Logging Wet diaper…", then what the server says.
            CareStore.setNote(c, "logging", member, icon, label, "", "");
            CareRender.updateAll(c);
            final PendingResult done = goAsync();
            new Thread(() -> {
                try {
                    JSONObject res = CareStore.log(c, member, button);
                    if (res == null) {
                        CareStore.setNote(c, "error", member, icon, label, "", "");
                    } else {
                        CareStore.setNote(c, res.optBoolean("already") ? "already" : "ok", member,
                                res.optString("i", icon), res.optString("l", label), res.optString("id"), res.optString("at"));
                    }
                    CareRender.updateAll(c);
                    WidgetRefreshWorker.refreshIn(c, 2);
                } finally {
                    done.finish();
                }
            }).start();
            return;
        }
        if (ACTION_UNDO.equals(action)) {
            final Context c = context.getApplicationContext();
            final String logId = intent.getStringExtra(EXTRA_LOG);
            final String member = intent.getStringExtra(EXTRA_MEMBER);
            final String icon = intent.getStringExtra(EXTRA_ICON);
            final String label = intent.getStringExtra(EXTRA_LABEL);
            if (logId == null || logId.isEmpty()) return;
            final PendingResult done = goAsync();
            new Thread(() -> {
                try {
                    boolean gone = CareStore.unlog(c, logId);
                    CareStore.setNote(c, gone ? "undone" : "undo_error", member, icon, label, gone ? "" : logId, "");
                    CareRender.updateAll(c);
                    WidgetRefreshWorker.refreshIn(c, 2);
                } finally {
                    done.finish();
                }
            }).start();
            return;
        }
        super.onReceive(context, intent);
    }
}
