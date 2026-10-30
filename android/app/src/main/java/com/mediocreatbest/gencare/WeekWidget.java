package com.mediocreatbest.gencare;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** GenCare's Week home-screen widget (drawn by WidgetRender, kept fresh by WidgetRefreshWorker). */
public class WeekWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetRender.updateAll(context);
        WidgetRefreshWorker.schedule(context);
        // Saved more than 20 minutes ago (or never): ask for the latest now.
        if (System.currentTimeMillis() - WidgetStore.fetchedAt(context) > 20 * 60_000L) {
            WidgetRefreshWorker.refreshNow(context);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        WidgetRender.updateAll(context);
    }

    @Override
    public void onEnabled(Context context) {
        WidgetRefreshWorker.schedule(context);
        WidgetRefreshWorker.refreshNow(context);
    }

    @Override
    public void onDisabled(Context context) {
        if (!WidgetRender.anyWidgets(context)) WidgetRefreshWorker.cancel(context);
    }
}
