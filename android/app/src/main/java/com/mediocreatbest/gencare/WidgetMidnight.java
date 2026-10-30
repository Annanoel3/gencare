package com.mediocreatbest.gencare;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

/**
 * Just after midnight the widgets move to the new day, even when the phone is
 * asleep and the 30-minute refresh is held back (Doze). Redraws from what's
 * saved; no network needed.
 */
public class WidgetMidnight extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        WidgetRender.updateAll(context); // also sets the next one
        WidgetRefreshWorker.refreshNow(context);
    }

    static void schedule(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            PendingIntent pi = PendingIntent.getBroadcast(c, 77, new Intent(c, WidgetMidnight.class),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            if (!WidgetRender.anyWidgets(c)) {
                am.cancel(pi);
                return;
            }
            Calendar next = WidgetStore.today();
            next.add(Calendar.DAY_OF_MONTH, 1);
            next.add(Calendar.MINUTE, 1);
            am.setAndAllowWhileIdle(AlarmManager.RTC, next.getTimeInMillis(), pi);
        } catch (Exception ignored) {
            // The 30-minute refresh still turns the day over.
        }
    }
}
