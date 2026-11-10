package com.mediocreatbest.gencare;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Keeps the home-screen widgets current with the app closed: every 30 minutes
 * while any GenCare widget is on the home screen (and right away when the app
 * says the calendar changed), it fetches the feed and redraws them. With no
 * network it still redraws from what's saved, so a new day rolls over.
 */
public class WidgetRefreshWorker extends Worker {

    static final String PERIODIC = "gencare_widgets_periodic";
    static final String NOW = "gencare_widgets_now";

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!WidgetRender.anyWidgets(c)) return Result.success();
        boolean calendar = WidgetRender.ids(c, DayWidget.class).length + WidgetRender.ids(c, WeekWidget.class).length + WidgetRender.ids(c, MonthWidget.class).length > 0;
        if (calendar) WidgetStore.fetch(c);
        // The Care Log widget: who's cared for, their latest and their buttons.
        if (WidgetRender.ids(c, CareWidget.class).length > 0) CareStore.fetch(c);
        WidgetRender.updateAll(c);
        return Result.success();
    }

    static final String LATER = "gencare_widgets_later";

    /** Refresh again in a few minutes (the Care Log widget's "logged" note goes away then). */
    static void refreshIn(Context c, int minutes) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
                .setInitialDelay(minutes, TimeUnit.MINUTES)
                .build();
        WorkManager.getInstance(c.getApplicationContext())
                .enqueueUniqueWork(LATER, ExistingWorkPolicy.REPLACE, req);
    }

    /** The every-30-minutes refresh, while any widget is on the home screen. */
    static void schedule(Context c) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(WidgetRefreshWorker.class, 30, TimeUnit.MINUTES)
                .build();
        WorkManager.getInstance(c.getApplicationContext())
                .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c.getApplicationContext()).cancelUniqueWork(PERIODIC);
    }

    /** Refresh now (the calendar changed in the app, or a widget was just added). */
    static void refreshNow(Context c) {
        if (!WidgetRender.anyWidgets(c)) return;
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(c.getApplicationContext())
                .enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req);
    }
}
