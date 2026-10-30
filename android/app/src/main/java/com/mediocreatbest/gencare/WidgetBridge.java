package com.mediocreatbest.gencare;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The web app's side of the home-screen widgets (src/lib/widgets.js):
 *   status()                               -> { hasKey, userId }
 *   setKey({ key, userId, appId, serverUrl })   this phone's read-only widget key
 *   reload()                               the calendar changed: refresh the widgets now
 *   clear()                                -> { key }   signing out: forget it all
 * Same plugin and methods on iPhone.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("hasKey", WidgetStore.hasKey(getContext()));
        r.put("userId", WidgetStore.userId(getContext()));
        r.put("widgets", WidgetRender.anyWidgets(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void setKey(PluginCall call) {
        String key = call.getString("key");
        String appId = call.getString("appId");
        String serverUrl = call.getString("serverUrl");
        if (key == null || key.isEmpty() || appId == null || appId.isEmpty() || serverUrl == null || serverUrl.isEmpty()) {
            call.reject("key, appId and serverUrl are required");
            return;
        }
        WidgetStore.setKey(getContext(), key, call.getString("userId", ""), appId, serverUrl);
        WidgetRender.updateAll(getContext());
        WidgetRefreshWorker.refreshNow(getContext());
        call.resolve();
    }

    @PluginMethod
    public void reload(PluginCall call) {
        WidgetRefreshWorker.refreshNow(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        String old = WidgetStore.clear(getContext());
        WidgetRender.updateAll(getContext());
        JSObject r = new JSObject();
        if (old != null) r.put("key", old);
        call.resolve(r);
    }
}
