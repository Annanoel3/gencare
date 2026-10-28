package com.mediocreatbest.gencare;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;

import java.net.URLDecoder;
import java.util.Locale;

/**
 * GenCare's one activity: the WebView that loads gencare.base44.app, plus the
 * native plugins the web app calls (NotifyBridge, CalendarBridge, RecorderBridge,
 * BillingBridge). Ported from ADHDone's MainActivity without the task-capture,
 * widget, share and alarm pieces GenCare doesn't have.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "GenCare";

    private String lastLoadedUrl = null;
    private boolean isShowingOfflinePage = false;
    private long lastRendererRestart = 0L;
    private int rendererRestarts = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugins BEFORE super.onCreate() so Capacitor picks them up
        registerPlugin(NotifyBridge.class);
        registerPlugin(CalendarBridge.class);
        registerPlugin(RecorderBridge.class);
        registerPlugin(BillingBridge.class);
        super.onCreate(savedInstanceState);
        setupInAppNavigation();
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Copy the base44 session into native storage so the calendar worker can
        // talk to the server with the app closed.
        if (bridge != null) {
            SessionSnapshotter.schedule(this, bridge.getWebView());
        }
        InAppUpdate.resumeIfNeeded(this);
    }

    /** A tap on the recorder's notification carries the page to open. */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String path = intent.getStringExtra(NotifyBridge.EXTRA_OPEN_PATH);
        intent.removeExtra(NotifyBridge.EXTRA_OPEN_PATH);
        if (path != null && !path.isEmpty()) {
            NotifyBridge.deliverPath(path);
        }
    }

    /** Hand sms:/tel:/mailto:/geo: links to the phone's apps (the WebView can't load them). */
    private boolean launchExternalScheme(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }
        Uri uri;
        String scheme;
        try {
            uri = Uri.parse(url);
            scheme = uri.getScheme();
        } catch (Exception e) {
            return false;
        }
        if (scheme == null) {
            return false;
        }
        scheme = scheme.toLowerCase(Locale.US);
        boolean isMessaging = "sms".equals(scheme) || "smsto".equals(scheme) || "mms".equals(scheme) || "mmsto".equals(scheme);
        boolean isMail = "mailto".equals(scheme);
        boolean isDial = "tel".equals(scheme);
        boolean isGeo = "geo".equals(scheme);
        if (!isMessaging && !isMail && !isDial && !isGeo) {
            return false;
        }
        Intent intent = new Intent((isMessaging || isMail) ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (isMessaging) {
            String body = extractQueryParam(uri, "body");
            if (body != null) {
                intent.putExtra("sms_body", body);
            }
        }
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "launchExternalScheme: no app handles " + scheme + ":");
        } catch (Exception e) {
            Log.w(TAG, "launchExternalScheme: failed to open " + scheme + ": " + e.getMessage());
        }
        return true;
    }

    private String extractQueryParam(Uri uri, String key) {
        try {
            String ssp = uri.getSchemeSpecificPart();
            if (ssp == null) {
                return null;
            }
            int q = ssp.indexOf('?');
            if (q < 0) {
                return null;
            }
            for (String param : ssp.substring(q + 1).split("&")) {
                if (param.startsWith(key + "=")) {
                    return URLDecoder.decode(param.substring(key.length() + 1), "UTF-8");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "extractQueryParam failed: " + e.getMessage());
        }
        return null;
    }

    private void setupInAppNavigation() {
        WebView webView = getBridge().getWebView();

        // Google sign-in refuses the WebView marker ("disallowed_useragent")
        String ua = webView.getSettings().getUserAgentString();
        webView.getSettings().setUserAgentString(ua.replace("; wv", ""));

        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        final WebChromeClient originalChromeClient =
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ? webView.getWebChromeClient() : null;

        // window.open() stays in-app (Google sign-in popups)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView tempView = new WebView(MainActivity.this);
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (!launchExternalScheme(url)) {
                            webView.loadUrl(url);
                        }
                        return true;
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        if (!launchExternalScheme(url)) {
                            webView.loadUrl(url);
                        }
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onShowFileChooser(wv, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(wv, filePathCallback, fileChooserParams);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (originalChromeClient != null) {
                    originalChromeClient.onPermissionRequest(request);
                } else {
                    request.grant(request.getResources());
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onConsoleMessage(consoleMessage);
                }
                return super.onConsoleMessage(consoleMessage);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (url != null && !url.startsWith("data:")) {
                    lastLoadedUrl = url;
                    isShowingOfflinePage = false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !isShowingOfflinePage) {
                    isShowingOfflinePage = true;
                    String offlinePage = "<!DOCTYPE html><html><head>"
                        + "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                        + "<style>*{box-sizing:border-box;margin:0;padding:0}"
                        + "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f0f4f8;"
                        + "display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}"
                        + ".card{background:#fff;border-radius:20px;padding:40px 28px;max-width:320px;box-shadow:0 4px 24px rgba(0,0,0,.08)}"
                        + ".icon{font-size:56px;margin-bottom:20px}"
                        + "h1{font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:12px}"
                        + "p{font-size:15px;color:#6b7280;line-height:1.6;margin-bottom:28px}"
                        + "button{background:#e11d48;color:#fff;border:none;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;width:100%}"
                        + "</style></head><body><div class='card'>"
                        + "<div class='icon'>&#128246;</div>"
                        + "<h1>No Internet Connection</h1>"
                        + "<p>GenCare needs an internet connection to work. Check your signal and try again.</p>"
                        + "<button onclick='window.location.href=\"" + (lastLoadedUrl != null ? lastLoadedUrl : "/") + "\"'> Try Again</button>"
                        + "</div></body></html>";
                    view.loadData(offlinePage, "text/html", "UTF-8");
                }
            }

            /** The WebView's renderer died: rebuild instead of crashing (at most twice a minute). */
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long now = System.currentTimeMillis();
                rendererRestarts = (now - lastRendererRestart < 60_000L) ? rendererRestarts + 1 : 1;
                lastRendererRestart = now;
                if (rendererRestarts > 2) {
                    return false;
                }
                view.post(() -> {
                    try {
                        recreate();
                    } catch (Exception e) {
                        Log.e(TAG, "recreate after renderer loss failed: " + e.getMessage());
                    }
                });
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return launchExternalScheme(request.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return launchExternalScheme(url);
            }
        });

        // Reload the page when the connection comes back
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkRequest networkReq = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            cm.registerNetworkCallback(networkReq, new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    if (isShowingOfflinePage && lastLoadedUrl != null) {
                        isShowingOfflinePage = false;
                        runOnUiThread(() -> getBridge().getWebView().loadUrl(lastLoadedUrl));
                    }
                }
            });
        }
    }

    // Back navigation belongs to the @capacitor/app plugin (predictive-back compatible),
    // which emits "backButton" to the web app's handler in AppLayout.
}
